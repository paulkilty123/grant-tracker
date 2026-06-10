-- 026_builder_v0x.sql
-- Builder v0.x: import-previous-application + guidelines supplement.
-- 1. org_core_content.source gains 'imported_from_application' (the content
--    bank cold-start: a past application split into typed verbatim blocks).
-- 2. applications gains supplied_guidelines (+ source) — funder guidance the
--    applicant pastes or points at, injected into generation as an explicitly
--    unverified, applicant-supplied block. Never promoted to live enrichment.
-- Idempotent: safe to re-apply.

alter table public.org_core_content
  drop constraint if exists org_core_content_source_check;
alter table public.org_core_content
  add constraint org_core_content_source_check
  check (source in ('user_entered','banked_from_application','extracted_from_profile','imported_from_application'));

alter table public.applications
  add column if not exists supplied_guidelines text,
  add column if not exists supplied_guidelines_source text
    check (supplied_guidelines_source in ('pasted','url'));

comment on column public.applications.supplied_guidelines is 'Funder application guidance supplied by the applicant (pasted or fetched from a URL they gave). Unverified input: used to angle scaffolds/drafts for THEIR application only, cited as applicant-supplied, never promoted to catalogue enrichment.';
