-- Machine-readable version of next_open_date for cron comparisons
ALTER TABLE scraped_grants
  ADD COLUMN IF NOT EXISTS next_open_date_parsed DATE DEFAULT NULL;
