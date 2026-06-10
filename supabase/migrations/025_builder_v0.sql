-- 025_builder_v0.sql
-- Application builder v0 (build spec Part B): the org's reusable content bank
-- and structured applications. The builder produces the first 10% (scaffold,
-- mapped content, gaps) — never finished prose — and every banked answer
-- enriches org_core_content so the next application starts easier.
--
-- FK note: applications.opportunity_id references scraped_grants(id) — the
-- spec's `opportunities(id)` is a view in this schema and cannot carry a FK.
-- RLS: org-scoped via organisations.owner_id = auth.uid() (single-owner model,
-- same pattern as the rest of the app). Service-role bypasses for server routes.
-- Idempotent: safe to re-apply.

-- ── Core content bank ────────────────────────────────────────────────────────

create table if not exists public.org_core_content (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id),
  block_type text not null check (block_type in (
    'mission','programmes','beneficiaries','impact_evidence',
    'track_record','organisation_history','team','finances_summary',
    'safeguarding','edi','partnerships','need_evidence','other'
  )),
  title      text not null,
  content    text not null,
  source     text not null check (source in ('user_entered','banked_from_application','extracted_from_profile')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists core_content_org on public.org_core_content (org_id, block_type);

alter table public.org_core_content enable row level security;

drop policy if exists "core_content_select_own_org" on public.org_core_content;
create policy "core_content_select_own_org" on public.org_core_content
  for select using (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

drop policy if exists "core_content_insert_own_org" on public.org_core_content;
create policy "core_content_insert_own_org" on public.org_core_content
  for insert with check (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

drop policy if exists "core_content_update_own_org" on public.org_core_content;
create policy "core_content_update_own_org" on public.org_core_content
  for update using (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

drop policy if exists "core_content_delete_own_org" on public.org_core_content;
create policy "core_content_delete_own_org" on public.org_core_content
  for delete using (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

comment on table public.org_core_content is 'Reusable application content blocks per org (builder v0). Sources: user_entered, banked_from_application (the accrual loop), extracted_from_profile. Org-scoped RLS via organisations.owner_id.';

-- ── Applications ─────────────────────────────────────────────────────────────

create table if not exists public.applications (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id),
  opportunity_id     uuid references public.scraped_grants(id),   -- nullable: off-catalogue allowed
  pipeline_item_id   uuid references public.pipeline_items(id) on delete set null,
  funder_name        text,                                        -- denormalised for off-catalogue
  grant_name         text,
  status             text not null default 'draft' check (status in ('draft','in_progress','complete')),
  questions          jsonb not null default '[]',
  eligibility_result jsonb,                                       -- audit output if opportunity linked
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists applications_org on public.applications (org_id, updated_at desc);

alter table public.applications enable row level security;

drop policy if exists "applications_select_own_org" on public.applications;
create policy "applications_select_own_org" on public.applications
  for select using (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

drop policy if exists "applications_insert_own_org" on public.applications;
create policy "applications_insert_own_org" on public.applications
  for insert with check (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

drop policy if exists "applications_update_own_org" on public.applications;
create policy "applications_update_own_org" on public.applications
  for update using (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

drop policy if exists "applications_delete_own_org" on public.applications;
create policy "applications_delete_own_org" on public.applications
  for delete using (
    org_id in (select id from public.organisations where owner_id = auth.uid())
  );

comment on table public.applications is 'Builder v0 applications: parsed questions with scaffold/mapped-content/gaps per question (jsonb, shape in src/lib/builder/types.ts), optional catalogue + pipeline links, eligibility_result snapshot. Org-scoped RLS.';
