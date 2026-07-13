-- 039_research_cost_levers.sql
-- Research agent v1 build spec §8 step 2 / §4.1 lever 2: research-once-keep-forever.
-- Additive, idempotent.
--
-- DESIGN: a researched funder profile is cached against the funder, reused
-- across THREADS AND ORGS until stale (spec §4.1) — it is deliberately NOT
-- org-scoped, unlike every other agent table so far. There is no client-facing
-- read path for this cache (it is consulted and written by the orchestrator's
-- research tools only, via the service client, same trust level as
-- agent_threads/agent_messages), so RLS is enabled with NO policies at all:
-- locked to service role, nothing to scope a per-org policy against anyway.
--
-- This cache is explicitly NOT the permanent record — spec §4.1: "the staging
-- pipeline is the permanent version." A cache entry going stale or being wrong
-- has no user-facing consequence beyond a re-search; verified facts still only
-- ever reach scraped_grants through needs_review (step 5, unbuilt yet).

create table if not exists public.researched_funder_cache (
  id            uuid primary key default gen_random_uuid(),
  funder_key    text not null unique,   -- normalised funder identity (lowercased, trimmed name)
  funder_name   text not null,          -- display form as researched
  summary       text,                   -- short scaffold note: what they fund, how to approach, watch-outs
  focus_notes   text[] default '{}'::text[],
  source_urls   text[] default '{}'::text[],
  fetched_at    timestamptz not null default now()
);
create index if not exists researched_funder_cache_fetched_at on public.researched_funder_cache (fetched_at desc);

alter table public.researched_funder_cache enable row level security;
-- Deliberately NO policies: no org to scope by, no client read/write path.
-- Service role (the tool layer) bypasses RLS and is the only writer/reader.

comment on table public.researched_funder_cache is 'Research agent v1 cost lever 2 (spec §4.1): research-once-keep-forever. Global cache keyed by funder identity, not org-scoped, reused across every thread/org until stale. Service-role only — no RLS policies. Not the permanent record; that is needs_review (step 5).';
