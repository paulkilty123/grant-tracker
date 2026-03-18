-- Add results column to live_search_history so users can restore past searches
alter table live_search_history
  add column if not exists results jsonb;
