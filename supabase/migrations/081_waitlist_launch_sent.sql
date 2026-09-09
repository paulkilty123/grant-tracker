-- APPLIED to production 2026-09-08.
--
-- 081: the launch email to the waitlist is sent once per address.
--
-- Same shape as ack_sent_at (077): the send script selects rows where this is
-- null and stamps each one the moment its send is confirmed, so a re-run
-- finds nobody. Idempotence lives in the database, not in a flag somebody
-- has to remember.

alter table waitlist_signups
  add column if not exists launch_sent_at timestamptz;

comment on column waitlist_signups.launch_sent_at is
  'When the launch-day email was sent to this address. Null = not yet.';
