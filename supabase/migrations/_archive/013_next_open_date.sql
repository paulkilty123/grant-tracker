-- Migration 013: Add next_open_date for grants that aren't currently open
-- but have a known future opening (e.g. "July 2026", "Q3 2026", "Spring 2026")
-- This powers the "Opens ..." badge on grant cards.

ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS next_open_date TEXT DEFAULT NULL;

COMMENT ON COLUMN scraped_grants.next_open_date IS
  'Human-readable date when the grant next opens for applications (e.g. "July 2026"). NULL if currently open or unknown.';
