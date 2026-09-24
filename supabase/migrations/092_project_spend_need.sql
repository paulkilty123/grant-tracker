-- 092: a project says whether it needs capital or revenue funding.
--
-- Ben Rossi (Portland Charity, £22m disability college), 24 Sept 2026: "We
-- have a capital build project launching soon and I'm particularly interested
-- in grant fund opportunities for this." A project carried sectors,
-- beneficiaries and a budget, so its match was the org's match with the
-- project's tags swapped in; nothing said the money was for a building. The
-- matcher already tells capital funds from revenue ones, but it read the need
-- off the organisation profile. This column lets the project say it.

alter table public.projects
  add column if not exists spend_need text
    check (spend_need in ('capital', 'revenue'));

comment on column public.projects.spend_need is
  'What the project needs the money for: capital (building, equipment, one-off) or revenue (running the work). Null = not said. Drives the project match in place of the org''s spend preferences.';
