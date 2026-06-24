-- David feedback 2026-06-24: free-text notes on saved grants.
-- Stored on the grant_interactions 'saved' row, alongside reminder_at, so a user can
-- record their research (e.g. "eligibility we don't meet now but could in a year").
alter table public.grant_interactions add column if not exists note text;
