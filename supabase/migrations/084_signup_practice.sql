-- 084: who the consultant is, when the profile they build belongs to a client.
--
-- APPLIED to production 2026-09-09.
--
-- Paul, 9 September 2026. On the consultant or network path with "set up a
-- profile for one organisation", the organisation row is the client's, and
-- the person setting it up vanished from the record. Their own name or
-- practice, website and client count now sit beside the role.

alter table organisations
  add column if not exists signup_practice_name text,
  add column if not exists signup_practice_website text;

comment on column organisations.signup_practice_name is
  'Consultant or network path with a client profile: the person''s own name or practice. The organisation row is the client''s.';
comment on column organisations.signup_practice_website is
  'Consultant or network path with a client profile: their own website, if any.';
