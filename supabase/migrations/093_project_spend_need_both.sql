-- 093: a project can need both capital and revenue.
--
-- Paul, 24 Sept 2026, on seeing the two pills: "it might be both a capital
-- and revenue project". Ben's skills centre is a building AND the staff to
-- run it. Both pills can be on; the row stores 'both'; the match asks for
-- either kind of fund.

alter table public.projects drop constraint if exists projects_spend_need_check;
alter table public.projects add constraint projects_spend_need_check
  check (spend_need in ('capital', 'revenue', 'both'));

comment on column public.projects.spend_need is
  'What the project needs the money for: capital (building, equipment, one-off), revenue (running the work), or both. Null = not said. Drives the project match in place of the org''s spend preferences.';
