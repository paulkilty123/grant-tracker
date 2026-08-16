-- 057 — a row that goes between rounds gets watched, whichever route took it there.
--
-- APPLIED TO PROD 2026-08-16, immediately before this file was committed.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SPLIT PATH
--
-- 50 rows sit in `between_rounds_scheduled`. ONE of them has a watchlist entry.
--
-- The cause is that enrolment lives in the admin UI. `markBetweenRoundsAndWatch`
-- in dashboard/admin/urls/page.tsx makes two calls — update the grant, then POST
-- to /api/admin/watchlist — so a row Paul marks by hand gets watched. The
-- automatic route does not: `transitionPipelineState` promotes any row written
-- with `is_active:false` and a `next_open_date` (grant-merge.ts:623), which is
-- how expire-grants moves a closed round, and nothing there touches the
-- watchlist. Almost all 50 arrived automatically, so almost none is watched.
--
-- The consequence is the one Paul named: we have a state that means "this fund
-- will come back and we do not know when", and no mechanism watching for it
-- coming back. A between-rounds row is the single case where a changed listing
-- page is almost certainly the thing we are waiting for.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY A TRIGGER AND NOT A LINE IN THE ROUTE
--
-- Same argument as 056's escape hatch. `between_rounds_scheduled` is reachable
-- from expire-grants, the admin sweep, update-grant, and hand-run SQL, and the
-- last of those is how several of these 50 got there. A guard that covers the
-- polite callers is not a guard. This fires on the state itself, so there is no
-- route left to forget.
--
-- Failures are swallowed on purpose: enrolment is a nicety and the state change
-- is the point. A watchlist insert that cannot land must not roll back a
-- pipeline transition — that would turn a missing convenience into a row stuck
-- published after its round closed, which is the harm this whole area exists to
-- prevent.

create or replace function public.watch_between_rounds_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pipeline_state = 'between_rounds_scheduled'
     and (tg_op = 'INSERT' or old.pipeline_state is distinct from new.pipeline_state)
     and new.apply_url is not null and new.apply_url <> ''
     and coalesce(new.title, '') <> ''
  then
    begin
      insert into public.funder_watchlist (name, listing_url, notes)
      values (
        left(new.title, 200),
        new.apply_url,
        'Auto-enrolled on entering between_rounds_scheduled — ' || to_char(now(), 'YYYY-MM-DD')
      )
      on conflict (listing_url) do nothing;
    exception when others then
      -- Never block the state change. See the note above.
      raise warning 'watch_between_rounds_row: could not enrol % (%)', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists scraped_grants_watch_between_rounds on public.scraped_grants;

create trigger scraped_grants_watch_between_rounds
  after insert or update of pipeline_state on public.scraped_grants
  for each row
  execute function public.watch_between_rounds_row();

-- ── Backfill the rows that arrived before the trigger existed ────────────────

insert into public.funder_watchlist (name, listing_url, notes)
select left(g.title, 200), g.apply_url,
       'Backfilled 2026-08-16 — between rounds since before enrolment was automatic'
  from public.scraped_grants g
 where g.pipeline_state = 'between_rounds_scheduled'
   and g.apply_url is not null and g.apply_url <> ''
   and coalesce(g.title, '') <> ''
on conflict (listing_url) do nothing;

-- ── Proof, false-first ───────────────────────────────────────────────────────
--
-- Assert every between-rounds row with a URL is now watched. This assertion was
-- false before the backfill above — 1 of 50 — so it is a check that can fail.

do $$
declare unwatched int;
begin
  select count(*) into unwatched
    from public.scraped_grants g
   where g.pipeline_state = 'between_rounds_scheduled'
     and g.apply_url is not null and g.apply_url <> ''
     and coalesce(g.title, '') <> ''
     and not exists (select 1 from public.funder_watchlist w where w.listing_url = g.apply_url);

  if unwatched > 0 then
    raise exception 'backfill incomplete: % between-rounds rows still unwatched', unwatched;
  end if;
  raise notice 'every between-rounds row with a URL is watched';
end;
$$;
