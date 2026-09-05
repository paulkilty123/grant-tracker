-- 078: every new organisation starts with fourteen days of Apply access.
--
-- APPLIED to production 2026-09-05.
--
-- Paul's rule for launch (10 September 2026): one signup path, every trial is
-- 14 days on Apply, no card, plan chosen at the end. Until this migration a
-- new organisation had apply_access = false and nothing could change that
-- except a subscription or a hand-set grant, so the first public signups
-- would have landed in a product with the pipeline locked.
--
-- THIS IS A DEFAULT, NOT A NEW MECHANISM. Migration 069 made entitlement a
-- derivation: an organisation has Apply access if a subscription entitles it
-- OR `granted_access_until` is in the future. The triggers that enforce and
-- derive that (075 on money/stripe-foundation, applied) already fire on every
-- insert. So a default on the date column is the whole trial: the AFTER
-- trigger sees the date, derives apply_access = true, and the same sweeper
-- that ends the cohort's access on 2027-03-10 ends the trial on day 15.
--
-- What this buys for free, because it is the same column the cohort uses:
--   - Day 15 is `expire-access-grants`, once that cron is deployed (it lives
--     on money/stripe-foundation today). Until it is, an expired trial stays
--     entitled; the branch merges before the first trial ends on the 24th.
--   - "Extend everyone in flight by a week", the fallback if checkout slips,
--     is one UPDATE on this column. No new code.
--   - The trial emails read this date, so the three-days-left message and
--     the cohort's March warning are the same query with different rows.
--   - A purchase supersedes it: expected_apply_access checks the grant first
--     and the subscription second, so a paid org stays entitled when the
--     fourteen days pass.
--
-- Deliberately a column default rather than an application write. There are
-- three signup paths today (/signup, /apply, /cohort-signup-7k9m2x) plus admin
-- tooling, and a default cannot be forgotten by the fourth. The cost is that a
-- cohort member joining through /apply after launch also gets fourteen days
-- until an admin sets their cohort date, which is the right failure: they see
-- the product rather than a locked one.
--
-- Interval, not a timestamp: `now()` is evaluated per row at insert time, so
-- the clock starts when the organisation is created, which is when the
-- product first has something to entitle. An account that never builds a
-- profile has no organisation and therefore no ticking clock, correctly.
--
-- Existing rows are untouched. The default applies to inserts only; the 43
-- organisations already present keep whatever `granted_access_until` says.

alter table public.organisations
  alter column granted_access_until set default (now() + interval '14 days');

comment on column public.organisations.granted_access_until is
  'Apply access until this moment, from a grant rather than a subscription. '
  'Null = no grant, infinity = permanent comp. DEFAULTS to now() + 14 days: '
  'that default IS the trial (migration 078). The cohort''s shared date is '
  '2027-03-10. The sweeper expire-access-grants ends access when it passes; '
  'expected_apply_access() reads it first, before any subscription.';
