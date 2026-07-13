-- 041_flagged_findings.sql
-- Research agent v1 build spec §3/§4/§8 step 5: the enrichment staging flow.
-- Additive, idempotent, org-scoped RLS (034 style).
--
-- DESIGN: "flag for verification" stages a researched-live finding into
-- scraped_grants — the SAME table and the SAME Needs Review admin workflow
-- every other catalogue addition goes through (the Grant Manager UI at
-- /dashboard/admin/urls has no concept of the smaller `funders` table, so
-- staging there would be invisible to Paul's actual review process; this
-- table was deliberately picked over it). agent_flagged_findings is NOT the
-- staged content itself — that lives on the scraped_grants row it points
-- at, written via stampNewGrant() (src/lib/grant-merge.ts) exactly like every
-- other addition (is_active=false, source below admin/ai_enrich trust so
-- real enrichment can still improve it — CLAUDE.md's admin-provenance-locks-
-- ai_enrich gotcha). This table is purely the "tagged to the originating
-- thread" audit trail spec §4 asks for, plus the claimed fields and source
-- URLs a reviewer needs to check against the funder's own source before
-- activation (spec §4: "verification standard unchanged").

create table if not exists public.agent_flagged_findings (
  id               uuid primary key default gen_random_uuid(),
  thread_id        uuid not null references public.agent_threads(id) on delete cascade,
  org_id           uuid not null references public.organisations(id) on delete cascade,
  scraped_grant_id uuid not null references public.scraped_grants(id) on delete cascade,
  source_urls      text[] not null default '{}'::text[],
  claimed_fields   jsonb not null,          -- what the model claimed at flag time (funder_name, summary, focus_notes) — the reviewer's starting point, not the row's live values
  created_at       timestamptz not null default now()
);
create index if not exists agent_flagged_findings_thread on public.agent_flagged_findings (thread_id, created_at desc);
create index if not exists agent_flagged_findings_org on public.agent_flagged_findings (org_id);
create index if not exists agent_flagged_findings_grant on public.agent_flagged_findings (scraped_grant_id);

alter table public.agent_flagged_findings enable row level security;
drop policy if exists "agent_flagged_findings_select_own_org" on public.agent_flagged_findings;
create policy "agent_flagged_findings_select_own_org" on public.agent_flagged_findings
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
-- No insert/update/delete policy: written server-side (service role) by the
-- flag_for_verification tool only, same as agent_thread_briefs.

comment on table public.agent_flagged_findings is 'Research agent v1 enrichment staging flow (design spec §3/§4, build step 5): links a scraped_grants row staged from a research thread back to its thread + source URLs + what was claimed. The catalogue row itself carries the actual staged content (stampNewGrant, is_active=false) — this table is the audit trail, not a second copy of the data.';
