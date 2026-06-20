-- 029_pipeline_items_starred.sql
-- #6 pipeline star/favourite: a per-item shortlist flag on the user's CRM, so a
-- user with a long pipeline can star a subset and filter to it. Inherits the
-- existing org-scoped RLS on pipeline_items (no new policy needed). Applied to
-- prod 2026-06-20 via migration `pipeline_items_starred`.
alter table public.pipeline_items
  add column if not exists starred boolean not null default false;
