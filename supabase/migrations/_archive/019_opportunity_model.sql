-- ============================================================================
-- 019_opportunity_model.sql
--
-- Generic opportunity model: extend scraped_grants with type-specific fields
-- for social investment, programmes and in-kind support, and expose via an
-- `opportunity` view with neutral naming for new code (MCP, agents).
--
-- Additive migration — no renames, no dual-write. Existing code keeps reading
-- scraped_grants unchanged. New code reads from `opportunity`.
-- ============================================================================

-- 1. Common: organisation-size eligibility bands ----------------------------
-- Lets the eligibility engine answer "does this org fit the fund's income
-- range?" without parsing eligibility_criteria text.
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS min_org_income INTEGER,
  ADD COLUMN IF NOT EXISTS max_org_income INTEGER;

-- 2. Common: provenance ------------------------------------------------------
-- Crawl/agent reasoning chain. Pays off for readiness agent + SEUK/audit
-- conversations down the line.
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS provenance JSONB;

-- 3. Type-specific: social investment ---------------------------------------
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS si_instrument_type        TEXT,
  ADD COLUMN IF NOT EXISTS si_repayment_term_months  INTEGER,
  ADD COLUMN IF NOT EXISTS si_interest_rate_percent  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS si_security_required      TEXT,
  ADD COLUMN IF NOT EXISTS si_min_investment         INTEGER,
  ADD COLUMN IF NOT EXISTS si_max_investment         INTEGER;

-- Soft constraint via CHECK so we can extend instrument types later without
-- touching an enum type.
ALTER TABLE scraped_grants
  DROP CONSTRAINT IF EXISTS si_instrument_type_check;
ALTER TABLE scraped_grants
  ADD CONSTRAINT si_instrument_type_check CHECK (
    si_instrument_type IS NULL
    OR si_instrument_type IN ('loan','blended','recoverable_grant','equity','revenue_share')
  );

-- 4. Type-specific: programmes ----------------------------------------------
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS prog_cohort_size          INTEGER,
  ADD COLUMN IF NOT EXISTS prog_length_weeks         INTEGER,
  ADD COLUMN IF NOT EXISTS prog_location_mode        TEXT,
  ADD COLUMN IF NOT EXISTS prog_location_city        TEXT,
  ADD COLUMN IF NOT EXISTS prog_includes_funding     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prog_funding_amount       INTEGER,
  ADD COLUMN IF NOT EXISTS prog_application_cycle    TEXT,
  ADD COLUMN IF NOT EXISTS prog_next_cohort_start    DATE;

ALTER TABLE scraped_grants
  DROP CONSTRAINT IF EXISTS prog_location_mode_check;
ALTER TABLE scraped_grants
  ADD CONSTRAINT prog_location_mode_check CHECK (
    prog_location_mode IS NULL
    OR prog_location_mode IN ('in_person','remote','hybrid')
  );

ALTER TABLE scraped_grants
  DROP CONSTRAINT IF EXISTS prog_application_cycle_check;
ALTER TABLE scraped_grants
  ADD CONSTRAINT prog_application_cycle_check CHECK (
    prog_application_cycle IS NULL
    OR prog_application_cycle IN ('annual','twice_yearly','rolling','ad_hoc')
  );

-- 5. Type-specific: in-kind support -----------------------------------------
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS ik_support_type           TEXT,
  ADD COLUMN IF NOT EXISTS ik_value_estimate         INTEGER,
  ADD COLUMN IF NOT EXISTS ik_capacity_available     TEXT;

-- 6. Indexes -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_scraped_grants_funding_type
  ON scraped_grants(funding_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_scraped_grants_type_location
  ON scraped_grants(funding_type, location_tag) WHERE is_active = true;

-- 7. Generic opportunity view ------------------------------------------------
-- Neutral naming for new code. Reads only — writes still go through
-- scraped_grants directly until we decide on a rename strategy post-launch.
CREATE OR REPLACE VIEW opportunity AS
SELECT
  id,
  external_id,
  source,
  title,
  funder            AS provider,
  funder_type       AS provider_type,
  funding_type      AS type,
  description,

  -- common
  sectors,
  impact_sectors,
  eligible_structures,
  target_beneficiaries,
  niche_tags,
  beneficiary_tags,
  diversity_tags,
  location_tag,
  is_local,
  apply_url,
  url_status,
  url_last_checked,
  url_quality_score,
  url_quality_issues,
  is_active,
  is_invite_only,
  saved_for_later,
  first_seen_at,
  last_seen_at,
  next_open_date,
  next_open_date_parsed,
  last_opened_at,
  civil_society_relevant,
  funder_brief        AS provider_brief,
  funder_brief_backup AS provider_brief_backup,
  grant_sources       AS sources,
  raw_data,
  provenance,
  min_org_income,
  max_org_income,
  applicant_type,
  accepts_social_enterprises,

  -- grant-specific
  amount_min,
  amount_max,
  deadline,
  is_rolling,
  eligibility_criteria,
  funding_subtype,

  -- social investment
  si_instrument_type,
  si_repayment_term_months,
  si_interest_rate_percent,
  si_security_required,
  si_min_investment,
  si_max_investment,

  -- programme
  prog_cohort_size,
  prog_length_weeks,
  prog_location_mode,
  prog_location_city,
  prog_includes_funding,
  prog_funding_amount,
  prog_application_cycle,
  prog_next_cohort_start,
  next_cohort_date,

  -- in-kind
  ik_support_type,
  ik_value_estimate,
  ik_capacity_available
FROM scraped_grants;

-- 8. RLS for the view --------------------------------------------------------
-- Inherits from scraped_grants (publicly SELECT-able). No additional policy
-- needed since the view doesn't expose any new sensitive columns.
COMMENT ON VIEW opportunity IS
  'Generic-naming read view over scraped_grants. Writes still go through scraped_grants. Aliases: funder→provider, funder_type→provider_type, funding_type→type, funder_brief→provider_brief, grant_sources→sources.';
