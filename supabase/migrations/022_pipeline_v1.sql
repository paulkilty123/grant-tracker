-- 022_pipeline_v1.sql
-- Phase 1 of pipeline v1 redesign — schema additions only, no behaviour change.
-- See docs/pipeline-v1-spec.md §10 Phase 1.

-- 1. New columns on scraped_grants
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS deadline_cycle            jsonb,
  ADD COLUMN IF NOT EXISTS parent_grant_id           uuid REFERENCES scraped_grants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason          text,
  ADD COLUMN IF NOT EXISTS needs_intervention_reason text;

-- Index parent_grant_id for sub-fund lookups (partial index — most rows have no parent)
CREATE INDEX IF NOT EXISTS idx_scraped_grants_parent_id
  ON scraped_grants(parent_grant_id)
  WHERE parent_grant_id IS NOT NULL;

-- Composite index for the NR queue query (pipeline_state + is_active)
CREATE INDEX IF NOT EXISTS idx_scraped_grants_pipeline_state_active
  ON scraped_grants(pipeline_state, is_active);

-- 2. Extend pipeline_state enum with the four new values
-- IF NOT EXISTS is safe across reruns; each value must be its own statement
ALTER TYPE pipeline_state ADD VALUE IF NOT EXISTS 'enriched';
ALTER TYPE pipeline_state ADD VALUE IF NOT EXISTS 'tagged_awaiting_review';
ALTER TYPE pipeline_state ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE pipeline_state ADD VALUE IF NOT EXISTS 'between_rounds_scheduled';

-- 3. Column documentation
COMMENT ON COLUMN scraped_grants.deadline_cycle IS
  'Structured cycle dates as array of {day, month, label?}. Used by expire-grants cron for deterministic auto-roll instead of fragile prose parsing.';
COMMENT ON COLUMN scraped_grants.parent_grant_id IS
  'Optional FK to umbrella parent (SCF Main Grants -> sub-funds, LCF programmes). Enrichment fetches parent brief for context.';
COMMENT ON COLUMN scraped_grants.rejection_reason IS
  'Soft-reject reason code (historical_deadline, duplicate, malformed_url, non_funder, out_of_scope, dead_url, quarantine).';
COMMENT ON COLUMN scraped_grants.needs_intervention_reason IS
  'When auto-chain quarantines a row, the diagnostic message that surfaced.';
