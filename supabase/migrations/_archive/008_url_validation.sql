-- ─────────────────────────────────────────────────────────────────────────────
-- 008 · URL Validation Status
-- Adds url_status and url_last_checked to scraped_grants so the daily
-- validation job can flag dead links for admin review.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS url_status       TEXT        DEFAULT 'unchecked'
    CHECK (url_status IN ('unchecked', 'ok', 'dead')),
  ADD COLUMN IF NOT EXISTS url_last_checked TIMESTAMPTZ;

-- Index for fast admin queries (show all dead / unchecked URLs)
CREATE INDEX IF NOT EXISTS scraped_grants_url_status_idx ON scraped_grants (url_status);

-- Comment
COMMENT ON COLUMN scraped_grants.url_status       IS 'unchecked | ok | dead — updated daily by validate-urls job';
COMMENT ON COLUMN scraped_grants.url_last_checked IS 'Timestamp of last HTTP check on apply_url';
