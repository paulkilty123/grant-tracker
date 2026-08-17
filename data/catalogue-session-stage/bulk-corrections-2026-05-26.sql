-- ============================================================================
-- Bulk tag corrections drafted from tag audit, 2026-05-26
-- Conservative: only applies suggestions where the funder source ACTUALLY
-- supports them. Audit-keyword false positives explicitly skipped (e.g.
-- Bromley "Mental Health" / "Arts & Culture" — not in source).
-- ============================================================================
-- Standing rule: not executed. Review each block, run when ready.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1A — UKRI / academic rows: out-of-scope for civil society cohort
-- These fund universities, RTOs, Catapults — not charities/CICs.
-- Setting civil_society_relevant=false removes them from cohort MCP queries.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE scraped_grants
SET civil_society_relevant = false
WHERE external_id IN (
  'ukri__opportunity_accelerated_knowledge_transfer_partnerships_6_akt_6_',
  'ukri__opportunity_doctoral_focal_award_plus_innovating_in_data_driven_research_',
  'ukri__opportunity_enhancing_resilience_to_wildfires_in_the_wildland_urban_interface_',
  'ukri__opportunity_knowledge_transfer_partnership_ktp_2026_to_2027_round_2_',
  'ukri__opportunity_mathematical_sciences_early_independence_fellowship_'
);

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1B — SCF Main Grants programme + sub-funds
-- Source: SCF Main Grants programme priorities are explicitly
--   Tackling Poverty / Improving Health / Reaching Potential / Acting on Climate.
-- Sub-funds (Gatwick, Lewes, Rye, B&H Legacy) operate within Main Grants — same
-- application portal, same priorities — so they should inherit the priority
-- area sector tags. Geographic narrowing stays in location_tag / description.
--
-- People in Poverty beneficiary tag: matches "Tackling Poverty" priority — add
-- to all 5 SCF Main-Grants-affiliated rows.
-- Children + Young People beneficiary tags: ONLY add to Main Grants (B&H Legacy
-- already has them; the geographic sub-funds aren't C&YP-specific).
-- ────────────────────────────────────────────────────────────────────────────

-- 1B.1 SCF Main Grants — add children + young_people beneficiary tags
UPDATE scraped_grants
SET beneficiary_tags = ARRAY(
  SELECT DISTINCT unnest(COALESCE(beneficiary_tags, ARRAY[]::text[]) || ARRAY['children','young_people']::text[])
)
WHERE external_id = 'staged-scf-main-grants';

-- 1B.2 All 5 SCF rows — add people_in_poverty beneficiary tag (matches Tackling Poverty priority)
UPDATE scraped_grants
SET beneficiary_tags = ARRAY(
  SELECT DISTINCT unnest(COALESCE(beneficiary_tags, ARRAY[]::text[]) || ARRAY['people_in_poverty']::text[])
)
WHERE external_id IN (
  'staged-scf-main-grants',
  'staged-scf-bh-legacy-fund',
  'staged-scf-gatwick-foundation-fund',
  'staged-scf-lewes-fund',
  'staged-scf-rye-fund'
);

-- 1B.3 Align sub-fund impact_sectors with Main Grants priority areas.
-- Main Grants already has [community, health, education, environment].
-- Sub-funds inconsistently subsetted these — bring them up to parity since they
-- operate within the same priority structure.
-- Net effect:
--   B&H Legacy:  [young_people, education, community]      → adds health, environment
--   Gatwick:     [community, environment]                  → adds health, education
--   Lewes:       [community]                               → adds health, education, environment
--   Rye:         [community]                               → adds health, education, environment

UPDATE scraped_grants
SET impact_sectors = ARRAY(
  SELECT DISTINCT unnest(COALESCE(impact_sectors, ARRAY[]::text[]) || ARRAY['health','environment']::text[])
)
WHERE external_id = 'staged-scf-bh-legacy-fund';

UPDATE scraped_grants
SET impact_sectors = ARRAY(
  SELECT DISTINCT unnest(COALESCE(impact_sectors, ARRAY[]::text[]) || ARRAY['health','education']::text[])
)
WHERE external_id = 'staged-scf-gatwick-foundation-fund';

UPDATE scraped_grants
SET impact_sectors = ARRAY(
  SELECT DISTINCT unnest(COALESCE(impact_sectors, ARRAY[]::text[]) || ARRAY['health','education','environment']::text[])
)
WHERE external_id IN ('staged-scf-lewes-fund', 'staged-scf-rye-fund');

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1C — Bromley Community Fund
-- Source description: "Supports local charities and community organisations
-- across the London Borough of Bromley. Funds work with children and young
-- people, older people, and disability."
-- Add: community (the fund is literally called "Community Fund"), older_people
-- (in source).
-- Skip audit suggestions that were FALSE POSITIVES (not in source):
--   Health, Mental Health, Employment, Arts & Culture — keyword matches not
--   supported by the source description.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE scraped_grants
SET impact_sectors = ARRAY(
  SELECT DISTINCT unnest(COALESCE(impact_sectors, ARRAY[]::text[]) || ARRAY['community','older_people']::text[])
)
WHERE external_id = 'staged-lcf-bromley-community-fund';

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Wimbledon Foundation Community Fund (score 20 — biggest single fix)
-- Source: "Themes: Addressing financial insecurity / cost of living,
-- Supporting mental health and wellbeing, Promoting and supporting digital
-- inclusion. Beneficiaries: any groups facing disadvantage including BAME,
-- disability groups, LGBTQIA+, young people, NEET, older people."
--
-- Currently tagged sectors: [community, mental_health, tech]
-- Audit suggested 9 missing — I'm applying 5 that are supported by source,
-- skipping 4 false positives:
--   ✅ health        — "mental health and wellbeing" + general wellbeing theme
--   ✅ employment    — "NEET" (not in education/employment/training) explicit
--   ✅ disability    — "disability groups" explicit
--   ✅ older_people  — "older people" explicit
--   ✅ financial     — "Addressing financial insecurity / cost of living" explicit
--   ❌ young_people  — already in beneficiary_tags; not adding as sector (would double-count)
--   ❌ education     — not in source
--   ❌ sport         — not in source
--   ❌ social_economy — not in source
-- ────────────────────────────────────────────────────────────────────────────
UPDATE scraped_grants
SET impact_sectors = ARRAY(
  SELECT DISTINCT unnest(
    COALESCE(impact_sectors, ARRAY[]::text[]) ||
    ARRAY['health','employment','disability','older_people','financial']::text[]
  )
)
WHERE external_id = 'staged-lcf-wimbledon-foundation-community-fund';

-- ============================================================================
-- POST-RUN VERIFICATION
-- ============================================================================
-- Run this after the updates to confirm the new state:
--
-- SELECT external_id, impact_sectors, beneficiary_tags, civil_society_relevant
-- FROM scraped_grants
-- WHERE external_id IN (
--   'ukri__opportunity_accelerated_knowledge_transfer_partnerships_6_akt_6_',
--   'ukri__opportunity_doctoral_focal_award_plus_innovating_in_data_driven_research_',
--   'ukri__opportunity_enhancing_resilience_to_wildfires_in_the_wildland_urban_interface_',
--   'ukri__opportunity_knowledge_transfer_partnership_ktp_2026_to_2027_round_2_',
--   'ukri__opportunity_mathematical_sciences_early_independence_fellowship_',
--   'staged-scf-main-grants',
--   'staged-scf-bh-legacy-fund',
--   'staged-scf-gatwick-foundation-fund',
--   'staged-scf-lewes-fund',
--   'staged-scf-rye-fund',
--   'staged-lcf-bromley-community-fund',
--   'staged-lcf-wimbledon-foundation-community-fund'
-- )
-- ORDER BY external_id;
