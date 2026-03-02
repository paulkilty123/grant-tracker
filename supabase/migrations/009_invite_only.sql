-- ─────────────────────────────────────────────────────────────────────────────
-- 009 · Invite-Only Flag
-- Adds is_invite_only boolean to scraped_grants and auto-detects existing
-- entries based on common "by invitation" phrases in the description.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS is_invite_only BOOLEAN NOT NULL DEFAULT false;

-- Auto-detect from existing descriptions
UPDATE scraped_grants
SET is_invite_only = true
WHERE is_active = true
  AND is_invite_only = false
  AND (
    description ILIKE '%invite only%'
    OR description ILIKE '%by invitation%'
    OR description ILIKE '%invitation only%'
    OR description ILIKE '%by invitation only%'
    OR description ILIKE '%invitees only%'
    OR description ILIKE '%invited organisations%'
    OR description ILIKE '%do not accept unsolicited%'
    OR description ILIKE '%not accepting unsolicited%'
    OR description ILIKE '%unsolicited applications%'
    OR description ILIKE '%proactively approach%'
    OR title ILIKE '%invite only%'
    OR title ILIKE '%by invitation%'
    OR title ILIKE '%invitation only%'
  );

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS scraped_grants_invite_only_idx ON scraped_grants (is_invite_only);

COMMENT ON COLUMN scraped_grants.is_invite_only IS 'True if this funder only accepts invited applications — shown as a badge in search results';
