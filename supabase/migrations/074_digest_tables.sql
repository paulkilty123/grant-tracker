-- 074: the two tables the weekly digest needs.
--
-- APPLIED to production 2026-08-31.
--
-- Neither is read by anything today. `grant_field_changes` is the point: it is
-- worth nothing added in November and costs nothing added now, because it can
-- only ever report changes it was present to witness. Ladder rung 4 of the
-- digest spec — "changes to funds they follow" — has no data source at all in
-- the schema as it stands, so the feature ships when the table has a few weeks
-- of history in it and not before. Same decision as the reopening detector:
-- build the data now, ship the feature when it can be honest, and do not fake
-- it in the meantime.

-- ── 1. grant_field_changes ───────────────────────────────────────────────────
-- One row per tracked field per observed change, written by the crawl.
--
-- A deadline moving FORWARD six weeks is more urgent to a fundraiser than most
-- new matches and they would not otherwise know. That is the row this table
-- exists to make possible.
--
-- Deliberately not an audit log of everything. Four fields, chosen because a
-- change in each is something a reader can act on. Adding a fifth later is a
-- one-line change; recording all forty would make the useful ones unfindable.

create table if not exists public.grant_field_changes (
  id           uuid primary key default gen_random_uuid(),
  grant_id     uuid not null references public.scraped_grants(id) on delete cascade,
  field        text not null check (field in ('deadline','amount_min','amount_max','next_open_date','is_rolling')),
  -- Text rather than typed columns: one table covers a date, two integers and a
  -- boolean, and the digest renders these as prose either way. The typed
  -- alternative is four nullable columns of which three are always null.
  old_value    text,
  new_value    text,
  -- When the crawl SAW the change, which is not when the funder made it. The
  -- digest must never imply the latter.
  observed_at  timestamptz not null default now(),
  -- The UTC calendar day of observed_at, stored rather than computed in the
  -- index below. `observed_at::date` is NOT immutable — the result depends on
  -- the session timezone — so Postgres refuses it in an index expression.
  -- Pinning the zone makes it immutable and, more usefully, makes the dedup
  -- window mean the same thing regardless of who runs the crawl.
  observed_on  date generated always as ((observed_at at time zone 'UTC')::date) stored,
  -- What noticed it, so a bad extractor can be traced and its rows discounted
  -- rather than the whole table being distrusted.
  source       text not null default 'crawl'
);

-- The digest's only query shape: recent changes for a set of grants.
create index if not exists grant_field_changes_grant_observed_idx
  on public.grant_field_changes (grant_id, observed_at desc);

create index if not exists grant_field_changes_observed_idx
  on public.grant_field_changes (observed_at desc);

-- A crawl that runs twice in a day must not record the same change twice. The
-- unique index is on the transition rather than the row, so a deadline that
-- moves and then moves back is two legitimate rows.
create unique index if not exists grant_field_changes_dedup_idx
  on public.grant_field_changes (grant_id, field, coalesce(old_value,''), coalesce(new_value,''), observed_on);

comment on table public.grant_field_changes is
  'Observed changes to catalogue fields, written by the crawl. Feeds digest ladder rung 4. Starts empty by design and is only as old as this migration.';

-- ── 2. digest_sent_items ─────────────────────────────────────────────────────
-- What a given organisation has already been shown, so the digest can keep two
-- promises from the spec: no section repeats two weeks running, and no
-- individual item repeats within a month.
--
-- Recomputing this blind is not possible — "did we already show them this?" is
-- a fact about the past, not about the catalogue. It is also the table that
-- stops the alert email double-sending when the two are unified later.

create table if not exists public.digest_sent_items (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  -- Which part of the email it appeared in. A fund may legitimately appear as a
  -- new match one week and a closing deadline a month later; what must not
  -- repeat is the same item in the same role.
  section    text not null check (section in ('closing','in_progress','new_match','near_miss','profile_prompt','fund_change','opening_soon')),
  -- Grant uuid, or the profile field label for a prompt. Text because the two
  -- key spaces differ and a foreign key here would forbid the prompt rows.
  item_key   text not null,
  sent_at    timestamptz not null default now()
);

create index if not exists digest_sent_items_org_sent_idx
  on public.digest_sent_items (org_id, sent_at desc);

create index if not exists digest_sent_items_lookup_idx
  on public.digest_sent_items (org_id, section, item_key, sent_at desc);

comment on table public.digest_sent_items is
  'What each org has already been shown in a digest. Enforces the no-repeat rules in the digest spec section 4d.';

-- ── 3. Access ────────────────────────────────────────────────────────────────
-- Neither table is client-readable. Both are written by crons and read by the
-- digest builder, all of which speak as service_role and bypass RLS. There is
-- no screen for either, and inventing a read policy for a screen that does not
-- exist is how a table ends up quietly exposed.
--
-- Explicit GRANTs rather than the inherited default: from 30 October 2026 new
-- public tables are not exposed to the Data API automatically, and relying on
-- the default in either direction is a bad thing to discover later.

alter table public.grant_field_changes enable row level security;
revoke all on public.grant_field_changes from anon, authenticated;
grant select, insert, update, delete on public.grant_field_changes to service_role;

alter table public.digest_sent_items enable row level security;
revoke all on public.digest_sent_items from anon, authenticated;
grant select, insert, update, delete on public.digest_sent_items to service_role;

-- No policies for anon or authenticated, deliberately rather than unfinished.
-- With RLS on and no policy for a verb, the verb is denied.
