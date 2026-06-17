-- 028_drop_deep_search_tables.sql
-- Drop the orphaned Live Search tables. The Live Search (web-search) feature and
-- its endpoint (/api/deep-search) were removed; the orphaned client code and
-- src/lib/searchHistory.ts were deleted (commits 022cc42e, d99d1e60). No live
-- code references these tables.
--   deep_search_cache    — query result cache (disposable)
--   live_search_history  — weekly-cap ledger (test data only, no user data needed)
-- CASCADE clears their own indexes / RLS policies / FK constraint.
-- Applied to prod 2026-06-17 via Supabase migration `drop_deep_search_tables`.

drop table if exists public.live_search_history cascade;
drop table if exists public.deep_search_cache cascade;
