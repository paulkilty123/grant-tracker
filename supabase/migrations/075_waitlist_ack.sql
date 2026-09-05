-- 075: the waitlist acknowledgement needs somewhere to record itself.
--
-- APPLIED to production 2026-09-05.
--
-- `waitlist_signups` had four columns and no memory of anything we had sent.
-- That was fine while the answer was "nothing" — api/waitlist wrote a row and
-- returned — and stops being fine the moment an email goes out, for two
-- reasons that both bite on the same day:
--
--   1. The backfill has to be safe to run twice. Fifteen people submitted the
--      form before the sender existed and have to be caught up by a script.
--      A script that emails "everyone on the list" is one accidental re-run
--      away from emailing them all a second time, and there is no undo on
--      email. `ack_sent_at` is what makes the backfill idempotent: it selects
--      on null and stamps as it goes.
--
--   2. "Take me off the list" has to mean something. The email carries a
--      removal link (see `waitlist-unsubscribe.ts`) and the person clicking it
--      is telling us not to send the launch email. Without a column the link
--      is decoration, which is worse than no link at all.
--
-- Both are nullable with no default and no backfill. Null means "we have not
-- sent to this row yet", which is the truth for all fifteen existing rows, and
-- it is the value the backfill selects on. Do NOT default `ack_sent_at` to
-- now() at any point: that would silently mark the existing fifteen as already
-- acknowledged, and the failure would be invisible — a backfill that reports
-- zero to send looks exactly like a backfill that has already run.

alter table public.waitlist_signups
  add column if not exists ack_sent_at timestamptz,
  add column if not exists unsubscribed_at timestamptz;

comment on column public.waitlist_signups.ack_sent_at is
  'When the acknowledgement email was sent to this address. Null means never. '
  'The backfill script selects on null and stamps this, so it is what makes a '
  'second run a no-op rather than a second email.';

comment on column public.waitlist_signups.unsubscribed_at is
  'When this person clicked "Take me off the list". Non-null means send them '
  'nothing further, including the launch email. The row is kept rather than '
  'deleted because created_at is the consent record and deleting it would '
  'destroy the evidence of both the consent and its withdrawal.';

-- Partial index on exactly the query the sender runs: who is still owed an
-- acknowledgement. Small table today, and the index is what stops the backfill
-- turning into a sequential scan once the list is thousands long.
create index if not exists waitlist_signups_pending_ack_idx
  on public.waitlist_signups (created_at)
  where ack_sent_at is null and unsubscribed_at is null;
