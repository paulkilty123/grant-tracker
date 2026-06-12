-- 027_projects.sql
-- Project-first model phase 2 (redesign spec section 8): the Project entity.
-- A project is the user's real starting object; funder applications are
-- projections of it. Org supplies the eligibility side of matching; the
-- project supplies the relevance side (sectors, beneficiaries, amount).
-- Idempotent: safe to re-apply.

create table if not exists public.projects (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id),
  name               text not null,
  type_label         text not null default 'project' check (type_label in ('project','campaign','programme')),
  status             text not null default 'active' check (status in ('active','funded','archived')),
  description_raw    text,                -- the user's original description / paste
  what_it_will_do    text,
  who_benefits       text,                -- including evidence of need
  difference_it_makes text,
  duration           text,
  outreach           text,
  learning           text,
  budget_amount      integer,             -- rough GBP sought
  sectors            text[] not null default '{}',            -- ImpactSector slugs (relevance side)
  beneficiary_groups text[] not null default '{}',            -- BeneficiaryGroup slugs
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists projects_org on public.projects (org_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "projects_select_own_org" on public.projects;
create policy "projects_select_own_org" on public.projects
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "projects_insert_own_org" on public.projects;
create policy "projects_insert_own_org" on public.projects
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "projects_update_own_org" on public.projects;
create policy "projects_update_own_org" on public.projects
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid()));
drop policy if exists "projects_delete_own_org" on public.projects;
create policy "projects_delete_own_org" on public.projects
  for delete using (org_id in (select id from public.organisations where owner_id = auth.uid()));

alter table public.applications
  add column if not exists project_id uuid references public.projects(id) on delete set null;

comment on table public.projects is 'Project-first entity (spec section 8 phase 2): six standard sections + budget + derived relevance attributes (sectors/beneficiaries as org-taxonomy slugs). Applications link via applications.project_id. Org-scoped RLS.';
