-- 036_goal_purposes.sql
-- Companion v1 design spec §7: purposes on goals + pipeline purpose reference
-- + pipeline source marker. Additive, idempotent, org-scoped RLS (034 style).
--
-- DESIGN (spec §5/§7):
-- · One active goal per org holds MANY purposes ("side funding projects are
--   purposes, not goals"). Purposes are addable/editable at any time.
-- · Purposes are keyed by org_id and RE-PARENTED to the new goal row when a
--   goal is superseded (set_funding_goal adjustment), so pipeline items'
--   purpose references survive goal adjustments — ids stay stable.
-- · Per-purpose progress is DERIVED on read from pipeline items (same
--   derive-not-cache discipline as secured). Nothing here caches progress.
-- · pipeline_items.source marks off-pipeline secured income materialised as
--   won items ('pre_existing') and manual entries ('manual') — spec §4 Q3.
--   goals.secured_amount is retained as a column for back-compat but is no
--   longer read anywhere: secured derives from pipeline 'won' on read.

-- ── goal_purposes ────────────────────────────────────────────────────────────
create table if not exists public.goal_purposes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  goal_id       uuid not null references public.goals(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  status        text not null default 'active' check (status in ('active','retired')),
  category      text not null check (category in ('core','programme','staffing','capital','capacity','working_capital','other')),
  label         text not null,              -- free text: "Minibus appeal", "Youth worker post"
  approx_amount integer,                    -- whole pounds; nullable — roughness is honest (spec §4 Q2)
  sort_order    integer not null default 0
);
create index if not exists goal_purposes_org on public.goal_purposes (org_id, status);
create index if not exists goal_purposes_goal on public.goal_purposes (goal_id, status);

alter table public.goal_purposes enable row level security;
drop policy if exists "goal_purposes_select_own_org" on public.goal_purposes;
create policy "goal_purposes_select_own_org" on public.goal_purposes
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "goal_purposes_insert_own_org" on public.goal_purposes;
create policy "goal_purposes_insert_own_org" on public.goal_purposes
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "goal_purposes_update_own_org" on public.goal_purposes;
create policy "goal_purposes_update_own_org" on public.goal_purposes
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid()));
-- NO delete policy: purposes are retired (status), never hard-deleted.

comment on table public.goal_purposes is 'Purpose lines within the active goal (design spec §5/§7): side funding projects are purposes, not parallel goals. Re-parented on goal supersede; progress derived on read from pipeline_items.purpose_id.';

-- ── pipeline_items: optional purpose reference + source marker ───────────────
alter table public.pipeline_items
  add column if not exists purpose_id uuid references public.goal_purposes(id) on delete set null;
alter table public.pipeline_items
  add column if not exists source text check (source is null or source in ('manual','pre_existing'));

create index if not exists pipeline_items_purpose on public.pipeline_items (purpose_id) where purpose_id is not null;

comment on column public.pipeline_items.purpose_id is 'Optional link to a goal purpose (spec §7): makes per-purpose progress derivable on read. Unassigned items count toward the goal overall; assignment is a nudge, never a requirement.';
comment on column public.pipeline_items.source is 'Origin marker for non-catalogue entries: pre_existing = off-pipeline secured income materialised as a won item at goal setup (spec §4 Q3); manual = user-entered outside the catalogue flow. Null for ordinary adds.';
