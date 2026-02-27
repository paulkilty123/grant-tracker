-- ─────────────────────────────────────────────────────────────────────────────
-- 003 · Alerts, Interactions & Crawled Grants
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Alert preferences on organisations ───────────────────────────────────────
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS alerts_enabled    BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alert_frequency   TEXT     DEFAULT 'weekly',   -- 'weekly' | 'instant'
  ADD COLUMN IF NOT EXISTS alert_min_score   INTEGER  DEFAULT 70;         -- 0-100

-- ── Track which grant alerts have already been sent (prevents duplicates) ────
CREATE TABLE IF NOT EXISTS sent_grant_alerts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  grant_id   TEXT        NOT NULL,
  sent_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, grant_id)
);

ALTER TABLE sent_grant_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org owners can read their sent alerts" ON sent_grant_alerts
  FOR SELECT USING (
    org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );
-- Service role has unrestricted access (used by the alert sending job)

-- ── Grant interactions — saves, dismissals, applications ─────────────────────
CREATE TABLE IF NOT EXISTS grant_interactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  grant_id   TEXT        NOT NULL,
  action     TEXT        NOT NULL CHECK (action IN ('saved', 'dismissed', 'applied')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, grant_id, action)
);

ALTER TABLE grant_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org owners can manage their interactions" ON grant_interactions
  FOR ALL USING (
    org_id IN (SELECT id FROM organisations WHERE owner_id = auth.uid())
  );

-- ── Crawled / scraped grants from external sources ───────────────────────────
CREATE TABLE IF NOT EXISTS scraped_grants (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id          TEXT        UNIQUE,           -- source system's ID
  source               TEXT        NOT NULL,         -- 'gov_uk' | '360giving' | 'ukri' etc.
  title                TEXT        NOT NULL,
  funder               TEXT,
  funder_type          TEXT,                         -- maps to funder_type enum values
  description          TEXT,
  amount_min           INTEGER,
  amount_max           INTEGER,
  deadline             DATE,
  is_rolling           BOOLEAN     DEFAULT FALSE,
  is_local             BOOLEAN     DEFAULT FALSE,
  sectors              TEXT[]      DEFAULT '{}',
  eligibility_criteria TEXT[]      DEFAULT '{}',
  apply_url            TEXT,
  raw_data             JSONB,
  first_seen_at        TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  is_active            BOOLEAN     DEFAULT TRUE      -- set false when no longer found in source
);

ALTER TABLE scraped_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Scraped grants are publicly readable" ON scraped_grants
  FOR SELECT USING (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS scraped_grants_source_idx   ON scraped_grants (source);
CREATE INDEX IF NOT EXISTS scraped_grants_active_idx   ON scraped_grants (is_active);
CREATE INDEX IF NOT EXISTS scraped_grants_deadline_idx ON scraped_grants (deadline);
