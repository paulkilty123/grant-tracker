-- ============================================================================
-- next_open_date stale-date corrections, 2026-05-26
-- Today is 2026-05-26. Anything before this date is stale.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Tier A: Confirmed annual cycle bumps (3 rows)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE scraped_grants
SET next_open_date = 'February 2027',
    next_open_date_parsed = '2027-02-01'
WHERE external_id = 'staged-borough-newham-genting';

UPDATE scraped_grants
SET next_open_date = 'July 2026',
    next_open_date_parsed = '2026-07-01'
WHERE external_id = 'staged-borough-croydon-community-grant';

UPDATE scraped_grants
SET next_open_date = 'Spring 2027',
    next_open_date_parsed = '2027-03-01'
WHERE external_id = 'staged-borough-waltham-forest-fellowship';

-- ────────────────────────────────────────────────────────────────────────────
-- Tier B: Out-of-scope rows (civil_society_relevant=false), set to NULL
-- These don't surface in cohort queries; stale dates are admin-side noise only.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE scraped_grants
SET next_open_date = NULL,
    next_open_date_parsed = NULL
WHERE external_id IN (
  'gov_uk_new-national-forest---north-and-midlands-1',
  'ukri__opportunity_accelerated_knowledge_transfer_partnerships_6_akt_6_',
  'ukri__opportunity_knowledge_transfer_partnership_ktp_2026_to_2027_round_2_',
  'ukri__opportunity_mathematical_sciences_early_independence_fellowship_'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Tier C: Cycle uncertain — honest TBC rather than fabricate (1 row)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE scraped_grants
SET next_open_date = NULL,
    next_open_date_parsed = NULL,
    raw_data = COALESCE(raw_data, '{}'::jsonb) || '{"cycle_uncertain":"Newham Neighbourhood Small Grants: cycle not documented at source; May 2025 was prior stale entry. TBC pending source-fetch."}'::jsonb
WHERE external_id = 'staged-borough-newham-neighbourhood-small-grants';

-- ────────────────────────────────────────────────────────────────────────────
-- Verification
-- ────────────────────────────────────────────────────────────────────────────
SELECT external_id, next_open_date, next_open_date_parsed
FROM scraped_grants
WHERE external_id IN (
  'staged-borough-newham-genting',
  'staged-borough-croydon-community-grant',
  'staged-borough-waltham-forest-fellowship',
  'staged-borough-newham-neighbourhood-small-grants',
  'gov_uk_new-national-forest---north-and-midlands-1',
  'ukri__opportunity_accelerated_knowledge_transfer_partnerships_6_akt_6_',
  'ukri__opportunity_knowledge_transfer_partnership_ktp_2026_to_2027_round_2_',
  'ukri__opportunity_mathematical_sciences_early_independence_fellowship_'
)
ORDER BY external_id;
