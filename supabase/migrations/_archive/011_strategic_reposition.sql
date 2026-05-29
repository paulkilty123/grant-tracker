-- Migration 011: Strategic Repositioning
-- Adds new fields to the organisations table to support:
--   • Full legal structure taxonomy (replaces 5-value org_type enum)
--   • Social mission declaration flag (critical for Ltd company soft matching)
--   • Articles-restrict-profit flag (affects not-for-profit eligibility interpretation)
--   • Individual practitioner toggle (creative sector dual grants)
--   • 12-sector impact taxonomy
--   • Org stage (idea → pre-revenue → early → growth → established)
-- Adds new fields to scraped_grants to support eligibility engine:
--   • eligible_structures (which legal forms can apply)
--   • accepts_social_enterprises (soft flag for Ltd company soft matching)
--   • applicant_type (individual / organisation / both)
--   • funding_type (grant / accelerator / social_investment / diversity_fund / blended / in_kind)
--   • impact_sectors (new 12-sector taxonomy tags)

-- ─────────────────────────────────────────────────────────────────────────────
-- ORGANISATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Full legal structure — more granular than the old org_type enum
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS legal_structure TEXT
    CHECK (legal_structure IN (
      'cic_guarantee', 'cic_shares', 'cio', 'registered_charity',
      'ltd_guarantee', 'ltd_shares', 'llp', 'cooperative',
      'unincorporated', 'sole_trader', 'not_registered'
    ));

-- Soft-match signal: does the org self-identify as mission-driven?
-- Critical for plain Ltd companies that would otherwise be excluded.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS social_mission_declared BOOLEAN NOT NULL DEFAULT false;

-- Do articles of association restrict dividends or state social purpose?
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS articles_restrict_profit BOOLEAN NOT NULL DEFAULT false;

-- The user is both a solo practitioner AND an org director.
-- When true, surface individual grants (e.g. Arts Council DYCP) alongside org grants.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS also_individual_practitioner BOOLEAN NOT NULL DEFAULT false;

-- 1–3 impact sectors from the new 12-sector taxonomy.
-- Replaces the old free-text themes field for structured matching.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS impact_sectors TEXT[] NOT NULL DEFAULT '{}';

-- Organisation stage — used to match programme eligibility windows.
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS org_stage TEXT
    CHECK (org_stage IN ('idea', 'pre_revenue', 'early', 'growth', 'established'));

-- ─────────────────────────────────────────────────────────────────────────────
-- SCRAPED_GRANTS (funding opportunities)
-- ─────────────────────────────────────────────────────────────────────────────

-- Which legal structures are explicitly eligible for this opportunity.
-- Drives the hard-filter step of the eligibility engine.
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS eligible_structures TEXT[] NOT NULL DEFAULT '{}';

-- Soft flag: does the funder accept social enterprises (Ltd cos with social mission)?
-- 'yes' = confirmed, 'likely' = inferred from language, 'no' = excluded, NULL = unknown
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS accepts_social_enterprises TEXT
    CHECK (accepts_social_enterprises IN ('yes', 'likely', 'no'));

-- Who can apply: individual practitioners, organisations, or both.
-- Essential for creative sector where many grants are individual-only.
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS applicant_type TEXT NOT NULL DEFAULT 'organisation'
    CHECK (applicant_type IN ('individual', 'organisation', 'both'));

-- Broader funding type — extends beyond grants to cover the full landscape.
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS funding_type TEXT NOT NULL DEFAULT 'grant'
    CHECK (funding_type IN (
      'grant', 'accelerator', 'social_investment',
      'diversity_fund', 'blended_finance', 'in_kind'
    ));

-- New 12-sector taxonomy tags (array, replaces/augments old sectors[]).
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS impact_sectors TEXT[] NOT NULL DEFAULT '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orgs_legal_structure ON organisations (legal_structure);
CREATE INDEX IF NOT EXISTS idx_orgs_social_mission ON organisations (social_mission_declared);
CREATE INDEX IF NOT EXISTS idx_orgs_impact_sectors ON organisations USING GIN (impact_sectors);
CREATE INDEX IF NOT EXISTS idx_orgs_org_stage ON organisations (org_stage);

CREATE INDEX IF NOT EXISTS idx_grants_funding_type ON scraped_grants (funding_type);
CREATE INDEX IF NOT EXISTS idx_grants_applicant_type ON scraped_grants (applicant_type);
CREATE INDEX IF NOT EXISTS idx_grants_eligible_structures ON scraped_grants USING GIN (eligible_structures);
CREATE INDEX IF NOT EXISTS idx_grants_impact_sectors ON scraped_grants USING GIN (impact_sectors);

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL: map existing org_type values to legal_structure
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE organisations SET legal_structure = 'registered_charity'
  WHERE legal_structure IS NULL AND org_type = 'registered_charity';

UPDATE organisations SET legal_structure = 'cic_guarantee'
  WHERE legal_structure IS NULL AND org_type = 'cic';

UPDATE organisations SET legal_structure = 'ltd_shares', social_mission_declared = true
  WHERE legal_structure IS NULL AND org_type = 'social_enterprise';

UPDATE organisations SET legal_structure = 'unincorporated'
  WHERE legal_structure IS NULL AND org_type = 'community_group';

-- 'other' org_type stays NULL until user re-selects their structure
