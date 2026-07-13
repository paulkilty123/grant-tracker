-- 040_research_briefs.sql
-- Research agent v1 build spec §3/§8 step 4: "Write me a brief" storage.
-- Additive, idempotent, org-scoped RLS (034 style).
--
-- DESIGN: a brief is generated server-side in ONE shot (src/lib/agent/brief.ts,
-- the same authorBriefing-outside-the-tool-layer pattern as the briefing
-- page's "My read" — CLAUDE.md: briefs are legitimately adviser-authored
-- advice, not application content, so the tool layer's scaffold guard never
-- sees this). sections carries FOUR arrays (what_they_fund, fit_against_
-- purpose, how_to_approach, watch_outs), each an array of {text, provenance}
-- claims — "every claim carrying its provenance kind" (spec §3). Read-only to
-- the client: select policy only, writes are service-role (the generation
-- route), matching agent_threads/agent_messages.

create table if not exists public.agent_thread_briefs (
  id              uuid primary key default gen_random_uuid(),
  thread_id       uuid not null references public.agent_threads(id) on delete cascade,
  org_id          uuid not null references public.organisations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  opportunity_ref text,                    -- catalogue UUID or researched funder_key; unconstrained, same reasoning as agent_thread_pins.opportunity_ref
  title           text not null,
  sections        jsonb not null,          -- { what_they_fund, fit_against_purpose, how_to_approach, watch_outs }, each Claim[] = {text, provenance}[]
  model           text not null,
  prompt_version  text not null
);
create index if not exists agent_thread_briefs_thread on public.agent_thread_briefs (thread_id, created_at desc);
create index if not exists agent_thread_briefs_org on public.agent_thread_briefs (org_id);

alter table public.agent_thread_briefs enable row level security;
drop policy if exists "agent_thread_briefs_select_own_org" on public.agent_thread_briefs;
create policy "agent_thread_briefs_select_own_org" on public.agent_thread_briefs
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
-- No insert/update/delete policy: briefs are generated + written server-side
-- (service role) through the /api/agent/research/brief route only.

comment on table public.agent_thread_briefs is 'Research agent v1 "Write me a brief" artefacts (design spec §3, build step 4). Client-readable, service-role-written. sections is FOUR provenance-tagged claim arrays — the mechanical guardrail (brief.ts) rejects a catalogue-tagged claim on a researched-only opportunity and vice versa.';
