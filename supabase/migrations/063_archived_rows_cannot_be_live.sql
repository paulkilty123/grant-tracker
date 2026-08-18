-- A row cannot be archived and live to users at the same time.
--
-- `transitionPipelineState` already states the rule the app believes in
-- (grant-merge.ts:612): "Admin un-archive / approve: is_active=true takes the
-- row to published regardless of previous state." Every code path that writes
-- 'archived' writes is_active:false in the same statement -- GrantDetail.tsx,
-- the admin sweep, validate-urls. So the pair is only ever separable by a write
-- that skips the state machine, which is to say raw SQL or a direct .update().
--
-- Eight rows had done exactly that, found 2026-08-18. The damage was not what
-- users saw -- all eight were live and mostly fine -- it was that 'archived'
-- takes a row out of EVERY admin queue, so they were live to fundraisers and
-- invisible to review at the same time. Morrisons Foundation sat there telling
-- users it was between rounds while its funder had a live application button,
-- and nothing on any admin screen could find it. That is the failure mode this
-- guards: not a bad value, an unreviewable one.
--
-- WHY IT PUBLISHES RATHER THAN HIDES. Either direction makes the pair
-- consistent, and hiding would be the more cautious-looking choice. It is the
-- wrong one. An archive that forgot to set is_active is already leaving the row
-- in front of users today, so hiding on their behalf would silently withdraw
-- funds nobody decided to withdraw, and the eight found here were mostly good.
-- Publishing matches what the state machine above already says out loud, keeps
-- the user-visible position unchanged, and moves the row back into the queues
-- where a person can actually judge it.
--
-- WHY THE RULE STAYS THIS NARROW. `tagged_awaiting_review` + is_active=true
-- looks like the same defect and is not: 31 rows are in that state on purpose,
-- and the review queue counts them as "live to users". A general "state must
-- agree with visibility" rule would break intended behaviour. Only 'archived',
-- which means removed from the catalogue, actually contradicts being live.
--
-- WHY A TRIGGER AND NOT A CHECK CONSTRAINT. A constraint would reject the write
-- and surface the bug more loudly, which is tempting. But scraped_grants is
-- written by crawlers and crons on a schedule, and a rejected write there fails
-- a whole batch for a bookkeeping mismatch that is trivially resolvable. The
-- same reasoning as migration 062: correct it beside the data.
--
-- Applied to production 2026-08-18, before this file was committed, per the
-- house convention. Proof: 8 rows in the bad state before, 0 after, and 862
-- correctly archived rows untouched.

create or replace function resolve_archived_but_live()
returns trigger
language plpgsql
as $$
begin
  -- Reached only via the WHEN clause below, so no second test is needed.
  new.pipeline_state := 'published';
  return new;
end;
$$;

drop trigger if exists trg_archived_cannot_be_live on scraped_grants;

create trigger trg_archived_cannot_be_live
before insert or update on scraped_grants
for each row
when (new.pipeline_state = 'archived' and new.is_active is true)
execute function resolve_archived_but_live();

comment on function resolve_archived_but_live() is
  'Moves a row to published if it would be left archived while still live to users. Archived removes a row from every admin queue, so the combination is live-to-fundraisers and invisible-to-review at once. Added 2026-08-18 after 8 rows were found in that state.';
