-- 069_subscriptions.sql
--
-- The first half of the money path: somewhere to record what an account is
-- paying for, and a rule in SQL that turns that into the entitlement the app
-- already enforces.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE TWO NOUNS, AND WHY THEY ARE NOT THE SAME NOUN
--
-- Billing is a fact about an ACCOUNT. Stripe has one customer per person who
-- pays, and Team is explicitly "three org profiles, one login", so the payer
-- and the organisation are not one-to-one and never will be.
--
-- Entitlement is a fact about an ORGANISATION. Migration 030 settled that and
-- four tables' row-level security reads it:
--
--   org_id in (select id from organisations
--              where owner_id = auth.uid() and apply_access = true)
--
-- So this migration adds `subscriptions`, keyed by owner, and DERIVES
-- `organisations.apply_access` from it. Nothing about RLS changes, no policy is
-- rewritten, and every gate in the app keeps reading the column it already
-- reads. 030 anticipated exactly this: "Post-GA: driven by Stripe subscription
-- state."
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE PART THAT COULD HAVE CUT OFF THIRTY-TWO LIVE ACCOUNTS
--
-- Thirty-two of the forty-one organisations on the system have apply_access
-- true today, granted by hand: the founding cohort, plus accounts fixed one at
-- a time as the entitlement bug surfaced. NONE of them has a Stripe customer
-- and none of them ever will for the first six free months.
--
-- A derivation of the obvious shape — "apply_access = does this owner hold a
-- paying subscription" — revokes all thirty-two the moment it is installed. The
-- cohort would open the app to a paywall, and the failure mode is silent: RLS
-- returns an empty set, which reads as "you have no pipeline" rather than as
-- "you have been locked out".
--
-- So entitlement has two sources and the derived value is their OR:
--
--   apply_access = manual_entitlement OR the subscription grants it
--
-- `manual_entitlement` is backfilled true for every org that has apply_access
-- today, which makes this migration a no-op for existing users by construction
-- rather than by hope. It is also the column the admin route should set from
-- now on, and the honest home for the cohort's six free months, a comp, or an
-- account fixed by hand — none of which are subscriptions and none of which
-- should have to pretend to be one.

-- ── 1. Plan and status ───────────────────────────────────────────────────────
-- `status` mirrors Stripe's subscription statuses verbatim rather than
-- simplifying them. A webhook that has to map an unfamiliar status onto a
-- smaller vocabulary has to guess, and the guess is made at the worst possible
-- moment: while someone's payment is failing.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_plan') then
    create type public.subscription_plan as enum ('match', 'apply', 'team');
  end if;
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    );
  end if;
end $$;

-- ── 2. The subscriptions table ───────────────────────────────────────────────

create table if not exists public.subscriptions (
  id                     uuid primary key default uuid_generate_v4(),

  -- One row per paying account, updated in place across upgrade, downgrade,
  -- cancel and resubscribe. Not one row per Stripe subscription object: the
  -- question this table answers is "what is this account entitled to now", and
  -- a history of superseded rows makes that question harder, not easier.
  owner_id               uuid not null unique references auth.users(id) on delete cascade,

  plan                   public.subscription_plan   not null,
  status                 public.subscription_status not null,

  stripe_customer_id     text not null,
  stripe_subscription_id text unique,
  stripe_price_id        text,

  -- Access runs to here when cancel_at_period_end is true. Stripe keeps the
  -- status at 'active' until the period ends, so the derivation below needs no
  -- special case for a pending cancellation.
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_end              timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index if not exists subscriptions_stripe_customer_key
  on public.subscriptions (stripe_customer_id);

comment on table public.subscriptions is
  'One row per paying account, keyed by auth user (the Stripe customer). Written only by the Stripe webhook via service_role. Entitlement is derived from it onto organisations.apply_access by trg_subscription_syncs_entitlement; never set apply_access directly.';

-- ── 3. The second source of entitlement ──────────────────────────────────────

alter table public.organisations
  add column if not exists manual_entitlement boolean not null default false;

comment on column public.organisations.manual_entitlement is
  'Apply-tier access granted by a human rather than bought: the founding cohort''s six free months, a comp, an account fixed by hand. ORed with subscription state to produce apply_access. This is the column the admin route sets; apply_access follows.';

-- Backfill BEFORE the derivation trigger exists, so no live account is ever
-- momentarily unentitled. Thirty-two rows expected on production.
update public.organisations
   set manual_entitlement = true
 where apply_access is true
   and manual_entitlement is false;

-- ── 4. The rule ──────────────────────────────────────────────────────────────

create or replace function public.subscription_grants_apply(
  p_plan   public.subscription_plan,
  p_status public.subscription_status
) returns boolean
language sql
immutable
as $$
  -- Match buys matched search, eligibility and alerts, and deliberately not the
  -- pipeline, so it does not grant this.
  --
  -- past_due grants. That is dunning, not a decision: the card failed and
  -- Stripe is retrying. Cutting a fundraiser out of their own pipeline over a
  -- card that expired is the wrong response to a recoverable event, and Stripe
  -- moves the status to unpaid or canceled when the retries are exhausted,
  -- which is where access actually ends.
  select p_plan in ('apply', 'team')
     and p_status in ('trialing', 'active', 'past_due');
$$;

create or replace function public.derive_apply_access(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_granted boolean;
begin
  select coalesce(public.subscription_grants_apply(s.plan, s.status), false)
    into v_granted
    from public.subscriptions s
   where s.owner_id = p_owner;

  v_granted := coalesce(v_granted, false);

  update public.organisations o
     set apply_access = (o.manual_entitlement or v_granted)
   where o.owner_id = p_owner
     and o.apply_access is distinct from (o.manual_entitlement or v_granted);
end;
$$;

comment on function public.derive_apply_access(uuid) is
  'Recomputes apply_access for every org this owner holds. SECURITY DEFINER so current_user is postgres and trg_enforce_apply_access_immutable (migration 030) permits the write; that guard still blocks anyone else, which is the point of routing every entitlement change through here.';

-- ── 5. Wiring, from both sides ───────────────────────────────────────────────
-- Both directions matter. A subscription changing must re-derive the owner's
-- orgs, and an org appearing or changing hands must pick up the entitlement its
-- owner already has — otherwise a Team subscriber's second org profile arrives
-- locked and the reason is invisible.

create or replace function public.tg_subscription_syncs_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.derive_apply_access(old.owner_id);
    return old;
  end if;

  perform public.derive_apply_access(new.owner_id);
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    perform public.derive_apply_access(old.owner_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_subscription_syncs_entitlement on public.subscriptions;
create trigger trg_subscription_syncs_entitlement
  after insert or update or delete on public.subscriptions
  for each row execute function public.tg_subscription_syncs_entitlement();

create or replace function public.tg_organisation_derives_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.derive_apply_access(new.owner_id);
  return null;
end;
$$;

-- AFTER, not BEFORE. A BEFORE trigger setting new.apply_access = true would be
-- read by trg_enforce_apply_access_immutable as an ordinary caller trying to
-- grant themselves the paid tier, and rejected — correctly. Deriving after the
-- row exists routes the write through derive_apply_access, where the SECURITY
-- DEFINER context is what makes it legitimate.
drop trigger if exists trg_organisation_derives_entitlement on public.organisations;
create trigger trg_organisation_derives_entitlement
  after insert or update of owner_id, manual_entitlement on public.organisations
  for each row execute function public.tg_organisation_derives_entitlement();

-- ── 6. updated_at ────────────────────────────────────────────────────────────

create or replace function public.tg_subscriptions_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_touch on public.subscriptions;
create trigger trg_subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.tg_subscriptions_touch();

-- ── 7. Access ────────────────────────────────────────────────────────────────
-- A person may READ their own subscription, because the billing screen has to
-- render "Apply, £18 a month, renews 14 October" without a round trip through
-- the service role. Nobody may write it from the client under any circumstance:
-- the only legitimate author is the Stripe webhook, which speaks as
-- service_role and bypasses RLS.
--
-- Explicit GRANTs rather than the inherited default. From 30 October 2026 new
-- public tables are not exposed to the Data API automatically, and a table that
-- silently returns an empty array on the day the billing screen ships is a bad
-- way to find that out.

alter table public.subscriptions enable row level security;

revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.subscriptions to service_role;

drop policy if exists "own subscription is readable" on public.subscriptions;
create policy "own subscription is readable"
  on public.subscriptions
  for select
  to authenticated
  using (owner_id = auth.uid());

-- No insert, update or delete policy exists, and that is deliberate rather than
-- unfinished. With RLS on and no policy for a verb, the verb is denied.
