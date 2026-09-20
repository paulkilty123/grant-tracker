-- 071_billing_incidents.sql
--
-- Somewhere for the billing path to fail LOUDLY.
--
-- 071 rather than 074: grant-tracker-1f renumbered its 070/071 to 072/073 after
-- I took 070, which left 071 genuinely unused. 074 is spoken for.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A TABLE AND NOT A LOG LINE
--
-- The webhook already refuses the dangerous cases — an unrecognised price, a
-- subscription with no owner_id — and returns 200 with a console.error. That is
-- correct towards Stripe (a retry cannot fix either) and useless towards us: the
-- line lands in Vercel's runtime logs, which nobody is watching, and rolls off.
--
-- So the failure looks EXACTLY like success from every angle a person checks.
-- The customer has paid, Stripe shows the subscription as active, our table has
-- no row, and the first anybody hears is an email saying "I've paid and I can't
-- get in". Paul asked for the class to be covered rather than the instance:
-- this table is what the daily reconciliation reads.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ONE ROW PER PROBLEM, NOT PER DELIVERY
--
-- Stripe redelivers, and a customer can generate several events in a minute.
-- Keyed on (kind, subscription) so a recurring failure bumps a counter instead
-- of burying the others. `seen_count` is then evidence of how long something has
-- been broken, which a stream of duplicates would hide.

create table if not exists public.billing_incidents (
  id                     uuid primary key default uuid_generate_v4(),

  /** A MapRefusal code from webhook-map.ts, or 'entitlement_mismatch'. */
  kind                   text not null,

  stripe_subscription_id text,
  stripe_customer_id     text,
  owner_id               uuid,

  /** Human-readable, and it must name the offending value. */
  detail                 text not null,

  first_seen             timestamptz not null default now(),
  last_seen              timestamptz not null default now(),
  seen_count             integer     not null default 1,

  /** Set by hand once somebody has dealt with it. Null means open. */
  resolved_at            timestamptz,
  resolution_note        text
);

-- The dedup key.
--
-- This was first written as a unique index on
-- `(kind, coalesce(stripe_subscription_id, ''))`, which is valid SQL and
-- completely useless here: PostgREST's ON CONFLICT names COLUMNS, and an
-- expression index cannot satisfy it. Every upsert failed with "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification", the
-- writer swallowed the error by design, and eleven incidents recorded nothing.
--
-- That is the exact failure this table exists to prevent, reproduced inside the
-- fix for it, and it was found by looking at the table rather than by trusting
-- the run that said it had written to it.
--
-- NULLS NOT DISTINCT because a refusal can arrive with no subscription id at
-- all, and two of those are the same problem — where Postgres would otherwise
-- treat every NULL as unique and let them pile up.
alter table public.billing_incidents
  drop constraint if exists billing_incidents_kind_subscription_key;
alter table public.billing_incidents
  add constraint billing_incidents_kind_subscription_key
  unique nulls not distinct (kind, stripe_subscription_id);

create index if not exists billing_incidents_open_idx
  on public.billing_incidents (last_seen desc)
  where resolved_at is null;

-- seen_count has to be incremented by a trigger, not by the writer. A
-- PostgREST upsert REPLACES the row with the payload it is given, and the
-- payload cannot say "whatever is there plus one" — so the first version left
-- it at 1 for ever while documenting it as evidence of how long something had
-- been broken. A dead column that claims to mean something is worse than no
-- column.
--
-- It also pins first_seen, which the same replace would otherwise reset.
-- Known wrinkle: resolving an incident by hand is an UPDATE too, so it bumps
-- the count and last_seen by one. Not worth a guard; first_seen still means
-- what it says.
create or replace function public.tg_billing_incident_seen()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.seen_count := old.seen_count + 1;
  new.first_seen := old.first_seen;
  new.last_seen  := now();
  return new;
end;
$$;

drop trigger if exists trg_billing_incident_seen on public.billing_incidents;
create trigger trg_billing_incident_seen
  before update on public.billing_incidents
  for each row execute function public.tg_billing_incident_seen();

comment on table public.billing_incidents is
  'Billing failures that are permanent rather than transient: a webhook refusal, or an entitlement mismatch found by reconciliation. Written by the Stripe webhook and by /api/cron/reconcile-billing. One row per (kind, subscription); a repeat bumps seen_count. resolved_at is set by a human.';

-- Service role only. Nothing here is a user's business and some of it names
-- Stripe identifiers, so it is not exposed to the Data API at all.
alter table public.billing_incidents enable row level security;
revoke all on public.billing_incidents from anon, authenticated;
grant select, insert, update, delete on public.billing_incidents to service_role;
