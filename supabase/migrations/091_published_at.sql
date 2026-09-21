-- 091: when did a row go live?
--
-- APPLIED to production 2026-09-21.
--
-- WHY
--
-- Paul asked on 21 Sept how many grants were published since Thursday, and
-- the honest answer was "nine rows first seen since then are live, and
-- nothing records when an older staged row was published". first_seen_at is
-- when the row entered the table; pipeline_state says where it is now; the
-- moment it flipped to published was nowhere.
--
-- WHAT
--
--   published_at       first time the row was live: published AND active.
--                      Set once, never overwritten. "New to the catalogue."
--   last_published_at  every time it goes live, including a return from
--                      between_rounds_scheduled or a manual reactivation.
--                      "Went live again" is a different count and is kept
--                      separately so neither inflates the other.
--
-- Set by trigger, not by the writers: publish happens from the review queue,
-- the publish gate cron, the between-rounds sweep and the odd script, and a
-- stamp that depends on each of them remembering is the kind of alarm that
-- reports zero.
--
-- Existing rows are left null. A backfill from first_seen_at would be a
-- guess presented as a fact; the count starts honest from today.

alter table scraped_grants
  add column if not exists published_at timestamptz,
  add column if not exists last_published_at timestamptz;

create or replace function stamp_published_at() returns trigger
language plpgsql as $$
declare
  live_now  boolean := new.pipeline_state = 'published' and new.is_active;
  live_before boolean := tg_op = 'UPDATE' and old.pipeline_state = 'published' and old.is_active;
begin
  if live_now and not live_before then
    new.last_published_at := clock_timestamp();
    if new.published_at is null then
      new.published_at := clock_timestamp();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_published_at on scraped_grants;
create trigger trg_stamp_published_at
  before insert or update of pipeline_state, is_active on scraped_grants
  for each row execute function stamp_published_at();

comment on column scraped_grants.published_at is 'First moment the row was published and active. Trigger-set, never overwritten. Null for rows live before 2026-09-21.';
comment on column scraped_grants.last_published_at is 'Most recent moment the row went live, including returns from between rounds. Trigger-set.';
