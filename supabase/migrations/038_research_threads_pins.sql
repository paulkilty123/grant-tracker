-- 038_research_threads_pins.sql
-- Research agent v1 build spec §8 step 1: threads + pins schema.
-- Additive, idempotent, org-scoped RLS (034 style).
--
-- DESIGN (spec §3):
-- · agent_threads gains `kind` ('briefing' | 'research'). The existing
--   one-active-thread constraint only ever meant one active BRIEFING thread
--   (the drawer) — it is re-scoped to kind = 'briefing' so research threads
--   can run many-concurrent per org without touching briefing behaviour.
--   Existing rows default to kind = 'briefing', so current state is preserved
--   exactly; the partial unique index still enforces the old guarantee for it.
-- · agent_threads gains an optional focus: `focus_purpose_id` (a goal_purposes
--   reference) or `focus_label` (free text) — either, neither, or in practice
--   usually just one; not mutually exclusive at the DB level, the caller
--   decides. Re-parenting on goal supersede is goal_purposes' job (036); this
--   FK just points at whatever purpose row is currently live.
-- · agent_thread_pins: the thread's user-curated research log. Pins are
--   created by the user (the adviser may suggest one, never write it
--   silently) so, unlike agent_threads/agent_messages (service-role-only
--   writes), this table gets full client-facing CRUD under org-scoped RLS —
--   the same shape as grant_interactions. `opportunity_ref` is a bare text
--   field with no FK, deliberately: a researched, not-yet-catalogued find has
--   no scraped_grants row to point at (same reasoning as
--   grant_interactions.grant_id, CLAUDE.md's UUID-vs-legacy-id gotcha).

-- ── agent_threads: kind + focus + re-scoped active constraint ───────────────
alter table public.agent_threads
  add column if not exists kind text not null default 'briefing' check (kind in ('briefing','research'));
alter table public.agent_threads
  add column if not exists focus_purpose_id uuid references public.goal_purposes(id) on delete set null;
alter table public.agent_threads
  add column if not exists focus_label text;

drop index if exists public.agent_threads_one_active_per_org;
create unique index if not exists agent_threads_one_active_briefing_per_org
  on public.agent_threads (org_id) where status = 'active' and kind = 'briefing';
create index if not exists agent_threads_org_kind on public.agent_threads (org_id, kind, status);

comment on column public.agent_threads.kind is 'briefing (the drawer, one active per org — spec-unchanged) or research (research agent v1 spec §3, many concurrent per org).';
comment on column public.agent_threads.focus_purpose_id is 'Optional link to a goal_purposes row: the thread''s scope, when it tracks an existing purpose. Research agent v1 spec §3.';
comment on column public.agent_threads.focus_label is 'Optional free-text focus when there is no purpose to link (an ad hoc question, a not-yet-a-purpose campaign). Research agent v1 spec §3.';

-- ── agent_thread_pins ────────────────────────────────────────────────────────
create table if not exists public.agent_thread_pins (
  id             uuid primary key default gen_random_uuid(),
  thread_id      uuid not null references public.agent_threads(id) on delete cascade,
  org_id         uuid not null references public.organisations(id) on delete cascade,
  created_at     timestamptz not null default now(),
  title          text not null,
  body           text,
  source_kind    text not null check (source_kind in ('catalogue','researched','adviser_judgment')),
  opportunity_ref text
);
create index if not exists agent_thread_pins_thread on public.agent_thread_pins (thread_id, created_at desc);
create index if not exists agent_thread_pins_org on public.agent_thread_pins (org_id);

alter table public.agent_thread_pins enable row level security;
drop policy if exists "agent_thread_pins_select_own_org" on public.agent_thread_pins;
create policy "agent_thread_pins_select_own_org" on public.agent_thread_pins
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "agent_thread_pins_insert_own_org" on public.agent_thread_pins;
create policy "agent_thread_pins_insert_own_org" on public.agent_thread_pins
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "agent_thread_pins_update_own_org" on public.agent_thread_pins;
create policy "agent_thread_pins_update_own_org" on public.agent_thread_pins
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "agent_thread_pins_delete_own_org" on public.agent_thread_pins;
create policy "agent_thread_pins_delete_own_org" on public.agent_thread_pins
  for delete using (org_id in (select id from public.organisations where owner_id = auth.uid()));

comment on table public.agent_thread_pins is 'A research thread''s pinned findings log (research agent v1 spec §3). User-curated: client-writable CRUD under org-scoped RLS, unlike the service-role-only agent_threads/agent_messages. source_kind never lets researched content pass as catalogue-grade. opportunity_ref is unconstrained text — researched finds often have no catalogue row yet.';
