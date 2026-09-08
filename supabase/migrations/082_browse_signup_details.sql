-- 082: what a consultant or network tells us when they browse without a profile.
--
-- APPLIED to production 2026-09-08.
--
-- Paul, 8 September 2026. The browse path (migration 080) collected a name and
-- nothing else. Two small facts make the Team conversation easier and tell
-- Paul who these people are before consultant onboarding is built in October.

alter table organisations
  add column if not exists client_count_band text
    check (client_count_band in ('1-2', '3-5', '6+')),
  add column if not exists example_client text;

comment on column organisations.client_count_band is
  'Roughly how many organisations a consultant or network works with. Asked on the browse-without-a-profile path only.';
comment on column organisations.example_client is
  'One organisation they work with, in their own words. Asked on the browse-without-a-profile path only.';
