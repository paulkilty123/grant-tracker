-- 052_match_feedback_reviewer_note.sql
--
-- Somewhere for the admin's own reasoning when triaging a flag.
--
-- match_feedback.free_text and .reasons are the USER's words. Nothing recorded
-- why the admin classified a flag the way they did. That is a real gap for
-- match_precision and taxonomy_gap in particular, because neither writes
-- anything to the grant: the class label is the only output, so without a note
-- the reasoning is lost. The Buttle UK case is the example — the row correctly
-- lists children AND homeless, and that second tag is very likely why a
-- homelessness charity matched. That observation is exactly the matcher-tuning
-- input the class exists to capture.
--
-- Nullable, no default, no backfill. Purely additive.
--
-- Idempotent: safe to re-apply.

alter table public.match_feedback
  add column if not exists reviewer_note text;

comment on column public.match_feedback.reviewer_note is
  'The admin''s own note when triaging: why this class, what was checked. Distinct from free_text, which is what the user wrote. Required by the API for match_precision and taxonomy_gap, because those write nothing to the grant and the note is the only record of the decision.';
