-- URL quality tracking — deep audit support
-- url_quality_score: 0–100 confidence the URL is the right page for this grant
-- url_quality_issues: array of issue flags from deepCheckUrl()

ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS url_quality_score    SMALLINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS url_quality_issues   TEXT[]   DEFAULT '{}';

CREATE INDEX IF NOT EXISTS scraped_grants_quality_score_idx
  ON scraped_grants (url_quality_score)
  WHERE url_quality_score IS NOT NULL;
