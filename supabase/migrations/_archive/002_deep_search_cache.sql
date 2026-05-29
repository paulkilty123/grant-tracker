-- Deep search cache table
-- Stores AI-researched grant results keyed by normalised query string.
-- Results older than 48 hours are ignored by the app and cleaned up weekly.

CREATE TABLE IF NOT EXISTS deep_search_cache (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  query_key   TEXT        NOT NULL UNIQUE,   -- normalised (lowercase, trimmed) query
  results     JSONB       NOT NULL,          -- full DeepSearchResponse JSON
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deep_search_cache_query_key  ON deep_search_cache (query_key);
CREATE INDEX IF NOT EXISTS idx_deep_search_cache_created_at ON deep_search_cache (created_at);

-- RLS: the API route uses the service role key so RLS doesn't block it,
-- but enable it anyway as a best practice.
ALTER TABLE deep_search_cache ENABLE ROW LEVEL SECURITY;

-- No public access — only service role reads/writes this table.
