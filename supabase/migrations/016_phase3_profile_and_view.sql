-- Phase 3: Profile funding type preferences + fix grants_with_funder view
--
-- 1. Add funding_type_preferences to organisations
-- 2. Recreate grants_with_funder view to include impact_sectors

-- ── 1. organisations.funding_type_preferences ────────────────────────────────
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS funding_type_preferences TEXT[] NOT NULL DEFAULT '{}';

-- ── 2. Recreate view with impact_sectors ─────────────────────────────────────
DROP VIEW IF EXISTS grants_with_funder;

CREATE VIEW grants_with_funder AS
SELECT
  g.id, g.external_id, g.source, g.title, g.funder, g.funder_type,
  g.description, g.amount_min, g.amount_max, g.deadline, g.is_rolling,
  g.is_local, g.sectors, g.eligibility_criteria, g.apply_url, g.raw_data,
  g.first_seen_at, g.last_seen_at, g.is_active, g.url_status,
  g.url_last_checked, g.is_invite_only, g.funding_type,
  g.eligible_structures, g.impact_sectors,
  g.org_stage, g.next_cohort_date, g.diversity_tags,
  g.next_open_date, g.next_open_date_parsed,
  f.name        AS funder_full_name,
  f.short_name  AS funder_short_name,
  f.website     AS funder_website,
  f.funder_type AS funder_category,
  f.geographic_scope,
  f.sector_tags AS funder_sector_tags,
  f.typical_min AS funder_typical_min,
  f.typical_max AS funder_typical_max,
  f.is_rolling  AS funder_is_rolling
FROM scraped_grants g
LEFT JOIN funders f
  ON lower(g.funder) = lower(f.name)
  OR lower(g.funder) = lower(f.short_name);
