-- 080: who is signing up, and whether they chose to browse without a profile.
--
-- Paul, 8 September 2026. Onboarding asks "what is your organisation?" and a
-- consultant's honest answer is "which one?". Until Team seats exist the
-- answer is: pick one, or browse the whole catalogue without a profile. Two
-- columns record that choice so nothing in the product has to guess.
--
--   signup_role     'organisation' (default: a charity signing up as itself),
--                   'consultant' (a fundraiser working with several), or
--                   'network' (a membership body). Never branches the product
--                   on its own; it is the number Paul reads in October.
--   profile_skipped true when the person chose to browse without a profile.
--                   The row exists so the app works, but there is nothing to
--                   match against: the dashboard hides the matches card, the
--                   weekly digest leaves them out, and Find Funding shows a
--                   one-line banner. Set back to false the moment a profile is
--                   saved from the wizard.
--
-- Defaults keep every existing row and every ordinary signup byte for byte
-- as before.

alter table organisations
  add column if not exists signup_role text not null default 'organisation'
    check (signup_role in ('organisation', 'consultant', 'network')),
  add column if not exists profile_skipped boolean not null default false;

comment on column organisations.signup_role is
  'What the person said they were at signup: organisation, consultant or network. Recorded, not enforced.';
comment on column organisations.profile_skipped is
  'True when they chose to browse without a profile. Hides matches, excludes from the digest, shows the Find Funding banner.';
