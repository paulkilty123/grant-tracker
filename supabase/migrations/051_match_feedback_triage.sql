-- 051_match_feedback_triage.sql
--
-- Adds resolution tracking to match_feedback so a flag can be routed into the
-- admin review queue, triaged, and then closed.
--
-- Why this is needed: match_feedback has no notion of having been dealt with
-- (id, user_id, grant_id, direction, reasons, free_text, match_score_at_time,
-- created_at, updated_at). Without it the router re-queues the same flags on
-- every run and a rejected flag comes straight back the next day.
--
-- All three columns are NULLABLE with no default and no backfill, so every
-- existing row reads as "not yet triaged" and nothing changes for any existing
-- reader. Purely additive: no column is dropped, renamed or retyped, and the
-- existing unique (user_id, grant_id) constraint is untouched.
--
-- triage_class records the outcome for ALL three classes, including
-- match_precision. Nothing routes match_precision anywhere today, deliberately:
-- it is recorded as matcher-tuning input for later, not acted on. Charlotte's
-- Buttle UK flag is the worked example — she reported that they do not work with
-- children, the row correctly lists children and young people (and correctly
-- lists homeless, which is very likely why a homelessness charity matched), so
-- editing that row would damage an accurate one.
--
-- Idempotent: safe to re-apply.

alter table public.match_feedback
  add column if not exists reviewed_at   timestamptz,
  add column if not exists resolution    text,
  add column if not exists triage_class  text;

comment on column public.match_feedback.reviewed_at is
  'When an admin triaged this flag. NULL = not yet triaged; this is what the review queue selects on.';

comment on column public.match_feedback.resolution is
  'What the admin did: applied (a correction was written to the grant at user_verified trust), rejected (no change; the flag was not a catalogue defect), or superseded (another flag on the same grant carried the correction).';

comment on column public.match_feedback.triage_class is
  'Which kind of problem this flag turned out to be. catalogue_gap = a field on the row is missing or wrong. match_precision = the row is accurate, the match was wrong (recorded only, nothing routes it). taxonomy_gap = the row is defensible but the taxonomy cannot express the distinction.';

-- Value guards rather than enums: these vocabularies are young and an enum
-- would need a migration to extend. A CHECK can be relaxed in place, and the
-- repo has been bitten before by a TypeScript union drifting ahead of a
-- Postgres enum and surfacing as a silent "Save failed".
alter table public.match_feedback
  drop constraint if exists match_feedback_resolution_check;
alter table public.match_feedback
  add constraint match_feedback_resolution_check
  check (resolution is null or resolution in ('applied', 'rejected', 'superseded'));

alter table public.match_feedback
  drop constraint if exists match_feedback_triage_class_check;
alter table public.match_feedback
  add constraint match_feedback_triage_class_check
  check (triage_class is null or triage_class in ('catalogue_gap', 'match_precision', 'taxonomy_gap'));

-- The review queue's hot path: untriaged negative flags, newest first.
create index if not exists idx_match_feedback_untriaged
  on public.match_feedback (created_at desc)
  where reviewed_at is null and direction = 'down';
