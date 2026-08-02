-- 047 — spend_restriction: what the money can be spent on.
--
-- NOT YET APPLIED TO PROD. Additive only (one nullable column plus one array
-- column on organisations, no change to existing data) — but it is DDL, so
-- apply deliberately, not as a deploy side effect.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A NEW COLUMN RATHER THAN CLEANING funding_subtype
--
-- funding_subtype answers two unrelated questions in one slot:
--
--   what can you spend it on   restricted | unrestricted | capital
--   what shape is the thing    small_grant | emergency | accelerator | loan | …
--
-- Measured on the 623 live grants: only 165 carry a restriction answer. 46 hold
-- `small_grant` or `emergency`, which are true and useful facts — but they
-- occupy the single slot, so those rows can never record a restriction. A £2k
-- unrestricted small grant currently has to choose between being small and
-- being unrestricted.
--
-- Cleaning the column in place would mean destroying one true fact to store
-- another. Splitting keeps both, and leaves funding_subtype as product shape.
--
-- The backfill below copies only the three restriction values across. It does
-- NOT clear them from funding_subtype: the old column stays readable until the
-- new one is proven, so this migration is reversible by dropping the column.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.scraped_grants
  add column if not exists spend_restriction text;

comment on column public.scraped_grants.spend_restriction is
  'What the money may be spent on: restricted | unrestricted | capital. NULL means the funder page does not say — deliberately distinct from "restricted", so an unread page is never mistaken for a stated restriction.';

-- Org-side preference. Deliberately separate from funding_subtype_preferences,
-- which stays for product shape. NOTE: nothing has ever written a non-empty
-- value to funding_subtype_preferences — the onboarding wizard hard-codes `[]`
-- and no UI offers the choice, so the matcher has been reading a field no user
-- could set. This column ships with the UI that populates it.
alter table public.organisations
  add column if not exists spend_restriction_preferences text[] not null default '{}';

comment on column public.organisations.spend_restriction_preferences is
  'Which spend restrictions this org wants, e.g. {capital} for an org that needs equipment money. Empty = no preference stated, which the matcher treats as "do not score this dimension" rather than "wants nothing".';

-- Backfill the 165 rows whose restriction is already recorded in the wrong column.
update public.scraped_grants
   set spend_restriction = funding_subtype
 where funding_subtype in ('restricted', 'unrestricted', 'capital')
   and spend_restriction is null;

create index if not exists idx_scraped_grants_spend_restriction
  on public.scraped_grants (spend_restriction)
  where spend_restriction is not null;
