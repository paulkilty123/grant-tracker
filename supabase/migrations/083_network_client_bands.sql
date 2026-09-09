-- 083: a network supports hundreds of organisations, not "6 or more".
--
-- APPLIED to production 2026-09-09.
--
-- Paul, 9 September 2026, testing the browse path as a network. The bands
-- for a consultant (1-2, 3-5, 6+) are the wrong scale for a membership body,
-- so networks get their own (<20, 20-100, 100+) and the check accepts both.

alter table organisations drop constraint if exists organisations_client_count_band_check;
alter table organisations add constraint organisations_client_count_band_check
  check (client_count_band in ('1-2', '3-5', '6+', '<20', '20-100', '100+'));

comment on column organisations.client_count_band is
  'Roughly how many organisations they work with. Consultants: 1-2, 3-5, 6+. Networks: <20, 20-100, 100+. Browse-without-a-profile path only.';
