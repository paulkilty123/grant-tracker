-- 034_goal_agent_tables.sql
-- Goal agent foundation (build-spec §5). Additive, idempotent, org-scoped RLS.
-- Applied on a Supabase branch first, then merged (branch discipline).
--
-- Conservatism on `goals`: only the fields the tool signature uses + status +
-- source. No milestones / speculative columns — they earn their way in from
-- real usage.
--
-- Goal HISTORY, not just current state: the partial unique index below allows
-- ONE active goal per org while retaining superseded rows, and there is NO
-- delete policy, so goals are never hard-deleted — set_funding_goal supersedes
-- (status -> 'superseded') and inserts a new active row. "How the goal changed
-- over time" survives as future brain signal + a likely briefing feature.

-- ── goals ────────────────────────────────────────────────────────────────────
create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  status         text not null default 'active' check (status in ('active','achieved','abandoned','superseded')),
  title          text not null,
  target_amount  integer not null,
  secured_amount integer not null default 0,   -- from pipeline 'won' + manual entry
  start_date     date not null,
  end_date       date not null,
  mix_targets    jsonb,                          -- { "grant": 60, "contract": 20, ... } or null
  "constraints"  jsonb not null default '[]'::jsonb,  -- [{ kind, text }] — what the org won't take
  source         text not null default 'wizard' check (source in ('wizard','upload','conversation'))
);
-- exactly one active goal per org; superseded/achieved/abandoned rows are kept
create unique index if not exists goals_one_active_per_org on public.goals (org_id) where status = 'active';
create index if not exists goals_org on public.goals (org_id, created_at desc);

alter table public.goals enable row level security;
drop policy if exists "goals_select_own_org" on public.goals;
create policy "goals_select_own_org" on public.goals
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "goals_insert_own_org" on public.goals;
create policy "goals_insert_own_org" on public.goals
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "goals_update_own_org" on public.goals;
create policy "goals_update_own_org" on public.goals
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid()));
-- deliberately NO delete policy: goals are superseded, never hard-deleted.

comment on table public.goals is 'The compass (build-spec §5.1). One active goal per org (partial unique index); superseded rows retained as history. No hard delete. Conservative field set — matches the tool signature.';

-- ── agent_runs (created before org_facts for its FK) ─────────────────────────
create table if not exists public.agent_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  goal_id        uuid references public.goals(id) on delete set null,
  created_at     timestamptz not null default now(),
  trigger        text not null,             -- user_request | refresh | feedback_followup | digest | eval
  context_digest jsonb not null,            -- ids + hashes of what was sent (replay/candidate-diff)
  model          text not null,
  prompt_version text not null,
  input_tokens   integer,
  output_tokens  integer,
  cost_estimate_microgbp integer,
  status         text not null default 'complete' check (status in ('complete','error','guardrail_blocked')),
  narrative      text,
  raw_output     jsonb
);
create index if not exists agent_runs_org on public.agent_runs (org_id, created_at desc);
alter table public.agent_runs enable row level security;
drop policy if exists "agent_runs_select_own_org" on public.agent_runs;
create policy "agent_runs_select_own_org" on public.agent_runs
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
-- writes are service-role only (system-written); no client insert/update/delete policy.

comment on table public.agent_runs is 'One row per reasoning pass (build-spec §5.2). context_digest enables get_briefing candidate-diff later. Service-role writes; org-scoped reads.';

-- ── org_facts ────────────────────────────────────────────────────────────────
create table if not exists public.org_facts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organisations(id) on delete cascade,
  created_at          timestamptz not null default now(),
  kind                text not null check (kind in ('correction','constraint','context','relationship','history')),
  fact                text not null,
  structured          jsonb,
  source              text not null,        -- user_stated | user_correction | inferred_confirmed
  status              text not null default 'active' check (status in ('active','retracted')),
  last_applied_run_id uuid references public.agent_runs(id) on delete set null
);
create index if not exists org_facts_org on public.org_facts (org_id) where status = 'active';
alter table public.org_facts enable row level security;
drop policy if exists "org_facts_select_own_org" on public.org_facts;
create policy "org_facts_select_own_org" on public.org_facts
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "org_facts_insert_own_org" on public.org_facts;
create policy "org_facts_insert_own_org" on public.org_facts
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "org_facts_update_own_org" on public.org_facts;
create policy "org_facts_update_own_org" on public.org_facts
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid()));
-- retraction is a status update, not a delete: no delete policy.

comment on table public.org_facts is 'Learned half of the org model (build-spec §5.3). Retracted via status, not deleted. structured.action=exclude rows are hard filters in context assembly.';

-- ── pipeline_items backlink (single permitted existing-table change, §5.6) ────
-- Reverse link from a pipeline item to the recommendation that produced it.
-- Plain nullable uuid for now; FK to agent_recommendations added when that
-- table lands (on delete set null).
alter table public.pipeline_items
  add column if not exists source_recommendation_id uuid;

comment on column public.pipeline_items.source_recommendation_id is 'Set when a pipeline item is created from an agent recommendation (build-spec §5.6). FK to agent_recommendations added when that table exists.';
