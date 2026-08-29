-- 069_subscriptions.sql
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ APPLIED TO PRODUCTION 2026-08-29, on Paul's go after he read the backfill │
-- │ list. Result: 32 organisations still entitled (unchanged), 11 permanent,  │
-- │ 21 dated 2027-03-10, 0 left unbacked, and the derivation agrees with      │
-- │ apply_access on every row. The guard in section 3b would have rolled the  │
-- │ whole thing back had the counts moved.                                    │
-- └───────────────────────────────────────────────────────────────────────────┘
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
-- THE PART THAT WOULD HAVE CUT OFF THIRTY-TWO LIVE ACCOUNTS
--
-- Thirty-two of the forty-one organisations on the system have apply_access
-- today and NOT ONE of them has ever paid. They are the founding cohort, and
-- Paul's arrangement with them is six free months, then a permanent founding
-- rate below the public price.
--
-- A derivation of the obvious shape — "apply_access = does this owner hold a
-- paying subscription" — revokes all thirty-two the moment it is installed. The
-- cohort would open the app to a paywall, and the failure mode is silent: RLS
-- returns an empty set, which reads as "you have no pipeline" rather than as
-- "you have been locked out".
--
-- So entitlement has two sources and the derived value is their OR:
--
--   apply_access = an unexpired granted period OR the subscription grants it
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE GRANT IS A DATE AND NOT A BOOLEAN
--
-- Six months is a promise with an end in it, and a boolean cannot hold one. A
-- `granted_access = true` on thirty-two accounts is indistinguishable on
-- 10 March 2027 from free access for ever, and nothing in the system would ever
-- raise its hand about it. The cohort is the largest block of users on the
-- platform; free-for-ever there is not a rounding error.
--
-- `granted_access_until` therefore carries the date:
--
--   null        no hand grant. The subscription is the only source.
--   a timestamp access until then. The cohort: 2027-03-10.
--   'infinity'  a permanent comp. Internal and review accounts.
--
-- One column rather than a flag plus a date, so the two can never disagree, and
-- so granting access by hand FORCES the granter to say until when. That is the
-- discipline that stops "just for now" becoming permanent.
--
-- THE DATE. Launch is 10 September 2026 and the free period runs six months
-- from launch, not from each signup — Paul's call, 28 August. The thirty-two
-- joined across seven months (25 February to 12 August), so counting from
-- signup would have billed the earliest and most loyal tester in launch week
-- and staggered the rest across seven separate dates. One shared date is also
-- one sentence in an email. If launch moves, this is one UPDATE, not a
-- migration.
--
-- A date-bounded grant cannot be maintained by triggers alone: no trigger fires
-- because a clock passed a number. `expire_lapsed_access_grants()` at the end
-- is the sweeper, and it needs a nightly caller — see the note there.

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
  add column if not exists granted_access_until timestamptz;

comment on column public.organisations.granted_access_until is
  'Apply-tier access given rather than bought, and the moment it stops. null = none, a timestamp = access until then, ''infinity'' = a permanent comp. ORed with subscription state to produce apply_access. This is the column the admin route sets; apply_access follows. Cohort founding members: 2027-03-10, six months from the 10 September 2026 launch.';

create index if not exists organisations_granted_access_until_idx
  on public.organisations (granted_access_until)
  where granted_access_until is not null;

-- Backfill BEFORE the derivation trigger exists, so no live account is ever
-- momentarily unentitled.
--
-- TWO GROUPS, NOT ONE. The first draft dated all thirty-two to 2027-03-10 on the
-- understanding that they were all cohort. Paul read the list on 29 August and
-- eleven of them are not: seven of his own organisations, the reviewer demo, the
-- MCP tier fixture, the directory reviewer, and a family test account. A uniform
-- date would have expired his own logins, the reviewer demo and an automated
-- test fixture on 10 March 2027 — and the fixture failing is the sort of thing
-- that gets debugged for an hour before anyone thinks of a date in a migration.
--
-- Internal first, so the cohort update below cannot claim them.

update public.organisations o
   set granted_access_until = 'infinity'
  from auth.users u
 where u.id = o.owner_id
   and o.apply_access is true
   and o.granted_access_until is null
   and u.email in (
     'paulkilty1@gmail.com',                         -- Paul, seven organisations
     'rohan.kilty@me.com',                           -- family test account (Oxfam GB)
     'reviewer@granttracker.co.uk',                  -- reviewer demo org
     'mcp-tier-fixture-apply@mcp-fixtures.invalid',  -- MCP tier fixture
     'directory-reviewer@shoots-review.invalid'      -- directory reviewer
   );

-- Everyone still holding access is a founding cohort member: six free months
-- from the 10 September launch, one shared date.
update public.organisations
   set granted_access_until = timestamptz '2027-03-10 00:00:00+00'
 where apply_access is true
   and granted_access_until is null;

-- ── 3b. Refuse to proceed if the population is not the one that was reviewed ──
-- Paul checked a list of 32: eleven internal, twenty-one cohort. If anybody has
-- been granted or revoked access since, these numbers move and the right answer
-- is to stop and have the list looked at again, not to date a stranger's
-- organisation on an assumption. Runs inside the migration's own transaction, so
-- raising here rolls the whole thing back.
do $$
declare
  v_internal int;
  v_cohort   int;
  v_missed   int;
begin
  select count(*) into v_internal
    from public.organisations where granted_access_until = 'infinity';
  select count(*) into v_cohort
    from public.organisations where granted_access_until = timestamptz '2027-03-10 00:00:00+00';
  select count(*) into v_missed
    from public.organisations where apply_access is true and granted_access_until is null;

  if v_missed <> 0 then
    raise exception
      'Backfill missed % organisations holding access. They would lose it the moment the derivation runs.', v_missed;
  end if;
  if v_internal <> 11 or v_cohort <> 21 then
    raise exception
      'Expected 11 internal and 21 cohort, found % and %. The population changed since Paul reviewed it on 2026-08-29; re-check the list before applying.',
      v_internal, v_cohort;
  end if;
end $$;

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
     set apply_access = (
           v_granted
           or (o.granted_access_until is not null and o.granted_access_until > now())
         )
   where o.owner_id = p_owner
     and o.apply_access is distinct from (
           v_granted
           or (o.granted_access_until is not null and o.granted_access_until > now())
         );
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
  after insert or update of owner_id, granted_access_until on public.organisations
  for each row execute function public.tg_organisation_derives_entitlement();

-- ── 6. The sweeper ───────────────────────────────────────────────────────────
-- Nothing fires when a clock passes a date, so the triggers above cannot expire
-- a grant on their own. Without a caller, every one of the thirty-two keeps
-- access past 10 March 2027 and the system never mentions it.
--
-- Returns the number of organisations whose access actually changed, so the
-- nightly run reports a number rather than a silence. NOT YET WIRED TO A CRON:
-- that belongs with the rest of the billing jobs (dunning email, trial ending)
-- rather than as a lone entry added here.

create or replace function public.expire_lapsed_access_grants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed integer := 0;
begin
  with lapsed as (
    select distinct o.owner_id
      from public.organisations o
     where o.apply_access is true
       and o.granted_access_until is not null
       and o.granted_access_until <= now()
  )
  select count(*) into v_changed from lapsed;

  perform public.derive_apply_access(owner_id)
     from (
       select distinct o.owner_id
         from public.organisations o
        where o.apply_access is true
          and o.granted_access_until is not null
          and o.granted_access_until <= now()
     ) s;

  return v_changed;
end;
$$;

comment on function public.expire_lapsed_access_grants() is
  'Re-derives entitlement for owners whose granted_access_until has passed. Needs a nightly caller; without one, granted access never ends. Returns the number of owners re-derived.';

-- ── 7. updated_at ────────────────────────────────────────────────────────────

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

-- ── 8. Access ────────────────────────────────────────────────────────────────
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
