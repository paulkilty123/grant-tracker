-- 030_apply_access_entitlement.sql
-- GA blocker — docs/ga-readiness-checklist.md §2a.
--
-- At GA the free tier opens to the public but Apply (pipeline + builder) stays
-- cohort-allowlisted, so the allowlist IS the access control for the paid
-- features and MUST hold server-side, not just in the UI.
--
-- Before this migration the builder *compute* (api/builder/* routes) was gated
-- by getBuilderUser() -> 403, but the Apply *data* tables (pipeline_items,
-- projects, applications, org_core_content) were written directly from the
-- browser and protected only by org-ownership RLS. Any authenticated user
-- (incl. a future free-tier signup) could therefore read/write their OWN org's
-- Apply-tier rows directly via the Supabase client — an entitlement bypass
-- (NOT a cross-org breach; RLS still isolates orgs).
--
-- This migration:
--   1. Makes the entitlement a DB fact: organisations.apply_access.
--   2. Seeds it true for the founding cohort (BUILDER_ALLOWLIST).
--   3. Hard-guards the column against self-service escalation (a user setting
--      apply_access=true on their own org via a hand-crafted INSERT/UPDATE).
--   4. Rewrites RLS on the four Apply-tier tables to require BOTH org-ownership
--      AND apply_access = true.
--
-- Carry-forward: apply_access is the foundation of the post-GA Stripe paid gate
-- (wire subscription state -> apply_access; no RLS rebuild needed). It replaces
-- the hardcoded TS allowlist in src/lib/builder/access.ts.
--
-- Idempotent: safe to re-apply.

-- ── 1. Entitlement column ────────────────────────────────────────────────────
alter table public.organisations
  add column if not exists apply_access boolean not null default false;

comment on column public.organisations.apply_access is
  'Apply-tier entitlement (pipeline + builder). Enforced in RLS on pipeline_items / projects / applications / org_core_content. Seeded 2026-06-22 from BUILDER_ALLOWLIST (src/lib/builder/access.ts); new (public) signups default false. Only service_role / postgres / supabase_admin may change it (trg_enforce_apply_access_immutable). Post-GA: driven by Stripe subscription state.';

-- ── 2. Seed the founding cohort ──────────────────────────────────────────────
-- Mirrors BUILDER_ALLOWLIST at time of writing. Every current org (20 of 20) is
-- owned by an allowlisted email, so all existing orgs become entitled; new
-- public signups stay false. Re-running is a safe no-op.
update public.organisations o
set apply_access = true
from auth.users u
where u.id = o.owner_id
  and o.apply_access is distinct from true
  and lower(u.email) = any (array[
    'paulkilty1@gmail.com','paul@granttracker.co.uk','paulkilty77@gmail.com',
    'reviewer@granttracker.co.uk','rohan.kilty@me.com',
    'admin@asiancommunityconcern.co.uk','pip.projectfemaleuk@gmail.com',
    'destination6one8@gmail.com','monica@tibetwatch.org','louis@reprezent.org.uk',
    'deviyani.clark@gmail.com','dave@thirdspacetheatre.co.uk',
    'jen.robinson-slater@learningwithparents.com','emma@thepaperbirds.com',
    'hema@olympiasmusic.com','david@digitalability.co','billymizen@gmail.com',
    'georgia.dale@gmail.com','j@joelknightphotography.co.uk',
    'jack@tinderboxcollective.org'
  ]);

-- ── 3. Lock the column against self-service escalation ───────────────────────
-- organisations is user-writable (RLS: owner_id = auth.uid() for ALL commands),
-- so without this guard a free-tier owner could INSERT a new org — or UPDATE
-- their existing one — with apply_access=true and grant themselves the paid
-- tier. The TS Organisation type omits the column so the app never sends it;
-- this trigger blocks a hand-crafted direct write. SECURITY INVOKER (the default)
-- so current_user reflects the real request role set by PostgREST
-- (authenticated / anon / service_role), not the function owner.
create or replace function public.enforce_apply_access_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.apply_access is true
       and current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'apply_access is a managed entitlement and cannot be set on insert (role %)', current_user
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.apply_access is distinct from old.apply_access
       and current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'apply_access is a managed entitlement and cannot be changed directly (role %)', current_user
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_apply_access_immutable on public.organisations;
create trigger trg_enforce_apply_access_immutable
  before insert or update on public.organisations
  for each row execute function public.enforce_apply_access_immutable();

-- ── 4. RLS: require org-ownership AND apply_access on the four Apply tables ───
-- Pattern (replaces the org-ownership-only policies):
--   org_id in (select id from organisations
--              where owner_id = auth.uid() and apply_access = true)
-- The inner subquery runs with the caller's RLS, so it only ever sees the
-- caller's own orgs — org isolation is preserved; apply_access adds the gate.

-- pipeline_items ─────────────────────────────────────────────────────────────
drop policy if exists "Org members can view pipeline" on public.pipeline_items;
create policy "Org members can view pipeline" on public.pipeline_items
  for select to public
  using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "Org members can insert pipeline" on public.pipeline_items;
create policy "Org members can insert pipeline" on public.pipeline_items
  for insert to public
  with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "Org members can update pipeline" on public.pipeline_items;
create policy "Org members can update pipeline" on public.pipeline_items
  for update to public
  using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true))
  with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "Org members can delete pipeline" on public.pipeline_items;
create policy "Org members can delete pipeline" on public.pipeline_items
  for delete to public
  using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

-- projects ───────────────────────────────────────────────────────────────────
drop policy if exists "projects_select_own_org" on public.projects;
create policy "projects_select_own_org" on public.projects
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "projects_insert_own_org" on public.projects;
create policy "projects_insert_own_org" on public.projects
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "projects_update_own_org" on public.projects;
create policy "projects_update_own_org" on public.projects
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true))
            with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "projects_delete_own_org" on public.projects;
create policy "projects_delete_own_org" on public.projects
  for delete using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

-- applications ───────────────────────────────────────────────────────────────
drop policy if exists "applications_select_own_org" on public.applications;
create policy "applications_select_own_org" on public.applications
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "applications_insert_own_org" on public.applications;
create policy "applications_insert_own_org" on public.applications
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "applications_update_own_org" on public.applications;
create policy "applications_update_own_org" on public.applications
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true))
                with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "applications_delete_own_org" on public.applications;
create policy "applications_delete_own_org" on public.applications
  for delete using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

-- org_core_content ───────────────────────────────────────────────────────────
-- The builder content bank — same Apply-tier browser-write / org-RLS bypass
-- class as the spec's three tables, gated here too to close the matching hole.
drop policy if exists "core_content_select_own_org" on public.org_core_content;
create policy "core_content_select_own_org" on public.org_core_content
  for select using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "core_content_insert_own_org" on public.org_core_content;
create policy "core_content_insert_own_org" on public.org_core_content
  for insert with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "core_content_update_own_org" on public.org_core_content;
create policy "core_content_update_own_org" on public.org_core_content
  for update using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true))
                with check (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));

drop policy if exists "core_content_delete_own_org" on public.org_core_content;
create policy "core_content_delete_own_org" on public.org_core_content
  for delete using (org_id in (select id from public.organisations where owner_id = auth.uid() and apply_access = true));
