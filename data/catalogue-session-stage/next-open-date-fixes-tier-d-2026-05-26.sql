-- ============================================================================
-- Tier D follow-up: next_open_date fixes from source-fetch verification
-- 2026-05-26. Standing rule: enrichment correction only, no is_active changes.
-- ============================================================================

-- #1 Postcode Places Trust — sharpen to dd-mm-yyyy precision
UPDATE scraped_grants
SET next_open_date = '24 June 2026',
    next_open_date_parsed = '2026-06-24'
WHERE external_id = 'cat-seed-postcode-places-trust';

-- #2 People's Postcode Trust — same fix
UPDATE scraped_grants
SET next_open_date = '24 June 2026',
    next_open_date_parsed = '2026-06-24'
WHERE external_id = 'cat-seed-postcode-trust-scotland';

-- #3 Persimmon — no change needed (already correct)

-- #4 Severn Trent Core Funding — sharpen next_open + add Round 1 deadline
UPDATE scraped_grants
SET next_open_date = '1 June 2026',
    next_open_date_parsed = '2026-06-01',
    deadline = '2026-06-30'
WHERE external_id = 'gemini-severn-trent-core-funding';

-- #5 BGV — currently OPEN; clear next_open + add note
UPDATE scraped_grants
SET next_open_date = NULL,
    next_open_date_parsed = NULL,
    raw_data = COALESCE(raw_data, '{}'::jsonb) || '{"cycle_note":"Autumn 2026 cohort applications currently open (verified 2026-05-26). Biannual cohorts; next estimated Spring 2027."}'::jsonb
WHERE external_id = 'roadmap-seed-bethnal-green-ventures-bgv-';

-- #6 Scops Arts Trust — fix stale text + add scope-narrow note
UPDATE scraped_grants
SET next_open_date = '1 September 2026',
    next_open_date_parsed = '2026-09-01',
    raw_data = COALESCE(raw_data, '{}'::jsonb) || '{"next_round_scope":"1 September 2026 Stage 1 round restricted to performance opportunities for Children & Young People music education (choirs excluded)."}'::jsonb
WHERE title = 'Scops Arts Trust' AND external_id IS NULL;

-- #7 Barclays Black Founder Accelerator — fix parsed/text mismatch + flag scope
UPDATE scraped_grants
SET next_open_date_parsed = '2027-03-01',
    civil_society_relevant = false,
    raw_data = COALESCE(raw_data, '{}'::jsonb) || '{"scope_note":"Startup accelerator for early-stage businesses, not civil-society grant. Out of cohort scope. 2026 cohort closed 30 April; next likely Spring 2027."}'::jsonb
WHERE external_id = 'roadmap-seed-barclays-black-founder-accelerator';

-- #8 Wessex Water Environment Fund — Apr 2026 → Apr 2027 (source explicit)
UPDATE scraped_grants
SET next_open_date = 'April 2027',
    next_open_date_parsed = '2027-04-01'
WHERE title = 'Wessex Water Environment Fund' AND external_id IS NULL;

-- Verify
SELECT external_id, title, next_open_date, next_open_date_parsed, deadline, civil_society_relevant
FROM scraped_grants
WHERE external_id IN (
  'cat-seed-postcode-places-trust',
  'cat-seed-postcode-trust-scotland',
  'gemini-severn-trent-core-funding',
  'roadmap-seed-bethnal-green-ventures-bgv-',
  'roadmap-seed-barclays-black-founder-accelerator'
)
OR (external_id IS NULL AND title IN ('Scops Arts Trust', 'Wessex Water Environment Fund'))
ORDER BY title;
