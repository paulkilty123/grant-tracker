-- ─────────────────────────────────────────────────────────────────────────────
-- 004 · Crawl Logs — per-source run history for the admin health dashboard
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crawl_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source     TEXT        NOT NULL,
  batch      INTEGER,                          -- 1 | 2 | 3 | NULL (manual)
  fetched    INTEGER     NOT NULL DEFAULT 0,   -- pages / items fetched from source
  upserted   INTEGER     NOT NULL DEFAULT 0,   -- rows written to scraped_grants
  error      TEXT,                             -- error message if crawl failed
  ran_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quickly get last N runs per source, or latest runs across all sources
CREATE INDEX IF NOT EXISTS crawl_logs_source_idx ON crawl_logs (source, ran_at DESC);
CREATE INDEX IF NOT EXISTS crawl_logs_ran_at_idx ON crawl_logs (ran_at DESC);

-- Allow read access to any authenticated user (admin page uses service role)
ALTER TABLE crawl_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read crawl logs" ON crawl_logs
  FOR SELECT TO authenticated USING (true);
-- Service role has unrestricted access (used by the crawl jobs to INSERT)
