-- The funder's funding-index page: the page that LISTS their funds.
--
-- Distinct from `apply_url`, which points at one fund. A funder typically has
-- one index and several funds hanging off it, and today we only ever record the
-- leaf. That is why a fund whose URL goes stale has nothing to recover from, and
-- why a new round opening on a funder we already carry is invisible until
-- somebody searches for it.
--
-- Captured now, used later. Paul, 2026-08-17:
--
--   > The structural fix after launch is a funder-level record with an index
--   > page and fund rows hanging off it, and watching those index pages is how
--   > new rounds get found without paying for search. Don't build any of that
--   > now, just don't throw away the URLs while you're in there.
--
-- So this is one nullable column and nothing else. No table, no view, no
-- trigger, no backfill job. The URL-correction pass populates it as a side
-- effect of work it is doing anyway: when a row's `apply_url` is wrong because
-- it points at a listing, that listing IS the index page, and the hop that finds
-- the real fund page is exactly the moment both URLs are in hand.
--
-- Deliberately NOT stored in `raw_data`: `upsertGrants` in crawl.ts overwrites
-- that column wholesale on every crawl, so anything put there is lost on the
-- next run for precisely the scraped rows this matters most for.

alter table public.scraped_grants
  add column if not exists funding_index_url text;

comment on column public.scraped_grants.funding_index_url is
  'The funder page that lists their funds, as distinct from apply_url which points at one fund. Populated opportunistically by the URL-correction hop. Intended for a funder-level record and index-page watching after launch.';

-- Partial index: the queries that will want this all ask "which rows have one",
-- and the column is null for most of the catalogue.
create index if not exists scraped_grants_funding_index_url_idx
  on public.scraped_grants (funding_index_url)
  where funding_index_url is not null;
