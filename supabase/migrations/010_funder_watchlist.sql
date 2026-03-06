-- ── Funder Watchlist ─────────────────────────────────────────────────────────
-- Tracks stable "available grants" listing pages for major UK funders.
-- A weekly cron checks each page for content changes and creates an alert
-- when the grant listing appears to have been updated (grants added or removed).

CREATE TABLE funder_watchlist (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT    NOT NULL,
  listing_url      TEXT    NOT NULL UNIQUE,
  region           TEXT    NOT NULL DEFAULT 'national',
  funder_type      TEXT    NOT NULL DEFAULT 'trust_foundation',
  last_checked     TIMESTAMPTZ,
  last_fingerprint TEXT,           -- normalised heading text from last successful check
  last_count       INTEGER DEFAULT 0,  -- rough count of headings found
  status           TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'paused'
  last_error       TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Alerts raised when a listing page changes ─────────────────────────────────
CREATE TABLE watchlist_alerts (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id    UUID    NOT NULL REFERENCES funder_watchlist(id) ON DELETE CASCADE,
  detected_at     TIMESTAMPTZ DEFAULT NOW(),
  alert_type      TEXT    NOT NULL,  -- 'listing_changed' | 'page_down'
  snapshot_before TEXT,              -- fingerprint before change
  snapshot_after  TEXT,              -- fingerprint after change (or error message)
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX watchlist_alerts_watchlist_idx   ON watchlist_alerts (watchlist_id);
CREATE INDEX watchlist_alerts_detected_at_idx ON watchlist_alerts (detected_at DESC);
CREATE INDEX watchlist_alerts_unresolved_idx  ON watchlist_alerts (resolved) WHERE NOT resolved;

-- RLS: service role key (used by admin API + cron) can do everything.
-- Anon/authenticated reads are intentionally blocked — admin-only data.
ALTER TABLE funder_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON funder_watchlist FOR ALL USING (true);
CREATE POLICY "Service role full access" ON watchlist_alerts FOR ALL USING (true);

-- ── Pre-populate: UK Community Foundations ───────────────────────────────────
-- These are stable "available grants" listing pages for the major UK community
-- foundations. The weekly cron will build a baseline fingerprint on first run,
-- then alert on any subsequent changes.
INSERT INTO funder_watchlist (name, listing_url, region, funder_type) VALUES
  ('Heart of England Community Foundation',      'https://www.heartofenglandcf.org/available-grants/',             'West Midlands',    'trust_foundation'),
  ('Community Foundation for Northern Ireland',  'https://www.communityfoundationni.org/grants',                   'Northern Ireland', 'trust_foundation'),
  ('Foundation Scotland',                        'https://foundationscotland.org.uk/apply-for-funding/',           'Scotland',         'trust_foundation'),
  ('Community Foundation Wales',                 'https://communityfoundationwales.org.uk/funds/',                  'Wales',            'trust_foundation'),
  ('Greater Manchester Community Foundation',    'https://www.gmcf.org.uk/funding-for-you/',                       'North West',       'trust_foundation'),
  ('Community Foundation Tyne & Wear',           'https://www.communityfoundation.org.uk/apply/',                  'North East',       'trust_foundation'),
  ('Quartet Community Foundation',               'https://quartetcf.org.uk/grant-programmes/',                     'Bristol & West',   'trust_foundation'),
  ('London Community Foundation',                'https://londoncf.org.uk/grants/',                                'London',           'trust_foundation'),
  ('East Midlands Community Foundation',         'https://www.emcf.co.uk/grants/',                                 'East Midlands',    'trust_foundation'),
  ('Two Ridings Community Foundation',           'https://tworidingscf.org.uk/funding/',                           'Yorkshire',        'trust_foundation'),
  ('Kent Community Foundation',                  'https://www.kentcf.org.uk/what-we-offer/grants/',                'Kent',             'trust_foundation'),
  ('Berkshire Community Foundation',             'https://www.berkshirecf.org.uk/grants-and-funding/',             'Berkshire',        'trust_foundation'),
  ('Somerset Community Foundation',              'https://www.somersetcf.org.uk/grants/',                          'Somerset',         'trust_foundation'),
  ('Suffolk Community Foundation',               'https://www.suffolkcf.org.uk/grants/',                           'Suffolk',          'trust_foundation'),
  ('Norfolk Community Foundation',               'https://norfolkcf.org.uk/grants/',                               'Norfolk',          'trust_foundation'),
  ('Essex Community Foundation',                 'https://essexcf.org.uk/grants/',                                 'Essex',            'trust_foundation'),
  ('Nottinghamshire Community Foundation',       'https://nottinghamshirecf.org.uk/grants/',                       'Nottinghamshire',  'trust_foundation'),
  ('Lancashire Community Foundation',            'https://www.lancashirecf.org.uk/apply-for-funding/',             'Lancashire',       'trust_foundation'),
  ('Cumbria Community Foundation',               'https://www.cumbriafoundation.org/grants/',                      'Cumbria',          'trust_foundation'),
  ('Sussex Community Foundation',                'https://www.sussexgiving.org.uk/what-we-fund/grants/',           'Sussex',           'trust_foundation');
