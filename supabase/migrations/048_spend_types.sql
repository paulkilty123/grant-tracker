-- 048 — split "what kind of cost" from "how tied to a purpose".
--
-- APPLIED TO PROD 2026-08-02, immediately before this file was committed.
--
-- 047 shipped spend_restriction as a single field with three values
-- (restricted | unrestricted | capital). That was the funding_subtype mistake
-- one level down: it collapsed two orthogonal questions into one slot.
--
--                    restricted              unrestricted
--   revenue          project funding         core costs
--   capital          equipment for a named   a capital pot to spend as
--                    project                 you see fit
--
-- Measured on the 623 live grants: 57 signal BOTH capital and core costs, so a
-- single-value field was wrong on roughly one in eleven. Paul spotted it from a
-- sample row quoting "supports both Capital and Revenue applications", which the
-- old schema was forcing into `unrestricted` and losing the capital half.
--
-- The 047 backfill is RE-DERIVED rather than reused. Rows previously tagged
-- `capital` become {capital} with a NULL restriction, because "capital" never
-- carried any restriction information — inferring one would manufacture a fact,
-- which is the exact failure the null-vs-default distinction exists to prevent.

alter table public.scraped_grants
  add column if not exists spend_types text[];

comment on column public.scraped_grants.spend_types is
  'What KIND of cost the money covers: {capital}, {revenue}, or both. Orthogonal to spend_restriction (which says how tied to a purpose it is). 57 of 623 live grants signal both, so a single-value field was wrong on roughly 1 in 11.';

comment on column public.scraped_grants.spend_restriction is
  'How tied to a purpose: restricted | unrestricted. NULL = the funder page does not say. Read together with spend_types, which says what kind of cost.';

update public.scraped_grants
   set spend_types = array['capital'], spend_restriction = null
 where spend_restriction = 'capital' and spend_types is null;

update public.scraped_grants
   set spend_types = array['revenue']
 where spend_restriction in ('restricted','unrestricted') and spend_types is null;

create index if not exists idx_scraped_grants_spend_types
  on public.scraped_grants using gin (spend_types)
  where spend_types is not null;
