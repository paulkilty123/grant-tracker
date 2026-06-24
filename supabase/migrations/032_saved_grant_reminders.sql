-- 032_saved_grant_reminders.sql
-- "Set a reminder" on a saved grant (David feedback 2026-06-23).
-- Stores an optional reminder date on the user's 'saved' grant_interactions row.
-- The daily deadline-reminders cron emails when a reminder is 7 or 14 days away,
-- alongside pipeline deadlines. Nullable + additive; only set on action='saved' rows.
alter table public.grant_interactions add column if not exists reminder_at date;
