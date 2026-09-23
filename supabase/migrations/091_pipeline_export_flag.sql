-- 091: pipeline export is per organisation, off by default.
--
-- Paul, 23 Sept 2026, on the pipeline Download button shipped for Ruth Davey
-- the day before: "take this off for everyone apart from Ruth. It's ok for
-- cohort members. Realised that it means they can take what they stored
-- before they even pay." A trial user who exports the pipeline has taken the
-- one thing that makes them stay. So the button is a grant, not a feature:
-- on for Unicorn Theatre and for cohort members Paul names, off otherwise.
-- Nothing in the row data changes; the CSV builder stays as it is.

alter table public.organisations
  add column if not exists pipeline_export boolean not null default false;

comment on column public.organisations.pipeline_export is
  'Shows the pipeline Download (CSV) button. Off by default; Paul turns it on for cohort members and paying orgs.';

update public.organisations
   set pipeline_export = true
 where id = 'a33c3512-7931-4c76-b75b-0ccc86095ff9';  -- Unicorn Theatre, Ruth Davey
