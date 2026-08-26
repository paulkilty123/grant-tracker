-- Feedback: replace an unreachable status with a reply that a person writes.
--
-- `feedback.status` has four values in the app's STATUS_CONFIG (received, in
-- review, actioned, shipped) and exactly one of them is reachable: nothing in
-- the codebase has ever set it to anything but the 'received' default. All 12
-- rows on 2026-08-26 read 'received'. A chip that only ever shows one value is
-- not a status, it is decoration implying a triage process that does not exist.
--
-- Rather than build the state machine, we give the row a reply. A status tells
-- you your message was filed; a reply tells you it was read. One column, no
-- state machine, and the submitter sees an actual answer.
--
-- `status` itself is left in place: it is NOT NULL with a default, nothing
-- reads it any more, and dropping a column with live rows buys nothing here.

alter table feedback
  add column if not exists response       text,
  add column if not exists response_label text,
  add column if not exists responded_at   timestamptz;

comment on column feedback.response is
  'Reply written by a human admin, shown to the submitter on /dashboard/feedback.';
comment on column feedback.response_label is
  'Optional short kicker above the reply, e.g. "Added to the catalogue". Falls back to a generic label when null.';
comment on column feedback.responded_at is
  'When the reply was written. Null means no reply yet.';

-- The existing "Users can view own feedback" select policy already covers the
-- new columns, so a submitter reads their own reply and nobody else's. Writes
-- go through the admin API on the service role, so no new policy is needed.
