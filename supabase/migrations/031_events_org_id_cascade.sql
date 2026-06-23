-- 031_events_org_id_cascade.sql
-- Make events.org_id ON DELETE CASCADE so the in-app "Delete org" button works.
--
-- Previously events_org_id_fkey was ON DELETE NO ACTION, which blocked deleting
-- ANY org that had accumulated telemetry in `events` — i.e. effectively every
-- org that had been used at all (deleteOrganisation() in src/lib/organisations.ts
-- threw a FK violation). Telemetry should follow the org it describes, so CASCADE
-- is the correct rule here.
--
-- The other org_id FKs (projects, applications, org_core_content) are left as
-- NO ACTION deliberately — those are real user content and should block a
-- delete rather than silently disappear.

alter table public.events drop constraint if exists events_org_id_fkey;
alter table public.events
  add constraint events_org_id_fkey
  foreign key (org_id) references public.organisations(id) on delete cascade;
