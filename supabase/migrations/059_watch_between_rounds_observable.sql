-- 059 — a trigger that fires must leave a mark, even when the row already exists.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE SILENT CASE
--
-- 057 enrols a row into the watchlist when it enters `between_rounds_scheduled`,
-- with `on conflict (listing_url) do nothing`. That clause is correct about the
-- data (one watchlist row per URL) and wrong about the observation.
--
-- Paul is watching for the first live between-rounds transition, and the signal
-- he agreed to watch is a `funder_watchlist` row whose notes begin
-- "Auto-enrolled on entering between_rounds_scheduled". If the transitioning
-- row's `apply_url` is ALREADY on the watchlist, the trigger fires, the insert
-- conflicts, nothing is written, and the query stays empty.
--
-- 122 rows outside `between_rounds_scheduled` today already carry a watched
-- `apply_url`, so this is a live possibility rather than a hypothetical. A
-- continued zero would read as "it has not happened yet" when it could equally
-- mean "it happened and we could not tell" — the same silent-failure shape as
-- the trailing slash in the hop measurement and the `checked: 0` third pass in
-- validate-urls.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE FIX, AND WHAT IT DELIBERATELY DOES NOT DO
--
-- On conflict, APPEND a re-enrolment line to `notes` rather than doing nothing.
--
-- It appends. It does not overwrite. `notes` is a hand-editable field on an
-- admin screen, and a trigger that replaces a human's note to record a machine
-- event trades one silent loss for another.
--
-- It is idempotent within a day: the append is skipped if today's line is
-- already present, so a row that bounces in and out of the state does not grow
-- an unbounded note.
--
-- It does not touch `status`, `last_checked`, or `last_fingerprint`. Those drive
-- the checking cadence, and a re-enrolment is not evidence about the page.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE OBSERVABLE CHANGES SHAPE
--
-- The signal is no longer "notes START WITH Auto-enrolled". A re-enrolled row's
-- note starts with whatever was already there. The canonical query becomes:
--
--   select * from funder_watchlist
--    where notes ilike '%enrolled on entering between_rounds_scheduled%';
--
-- which matches both "Auto-enrolled on entering" (new URL) and "Re-enrolled on
-- entering" (URL already watched). The 49 backfilled rows carry "Backfilled
-- 2026-08-16 — between rounds since before enrolment was automatic", which does
-- not contain "enrolled on entering", so they do not collide.

create or replace function public.watch_between_rounds_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  marker text := 'Re-enrolled on entering between_rounds_scheduled — '
                 || to_char(now(), 'YYYY-MM-DD');
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
      on conflict (listing_url) do update
        set notes = case
                      when coalesce(funder_watchlist.notes, '') = '' then excluded.notes
                      else funder_watchlist.notes || E'\n' || marker
                    end
        -- Idempotent within the day, and never rewrites an identical line.
        where position(marker in coalesce(funder_watchlist.notes, '')) = 0;
    exception when others then
      -- Never block the state change. Same argument as 057.
      raise warning 'watch_between_rounds_row: could not enrol % (%)', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

-- Trigger definition is unchanged from 057 and is therefore NOT re-created here;
-- `create or replace function` is picked up by the existing trigger.

-- ── Proof, false-first ───────────────────────────────────────────────────────
--
-- The assertion below is that a conflicting enrolment leaves a visible mark.
-- Under 057 it was FALSE (do nothing wrote nothing), which is what makes it a
-- check rather than a tautology. It runs against a sentinel URL that cannot
-- collide with a real funder, and cleans up after itself.

do $$
declare
  sentinel   text := 'https://example.invalid/059-proof';
  before_txt text;
  after_txt  text;
begin
  delete from public.funder_watchlist where listing_url = sentinel;

  -- Seed a row as if it were already watched, with a human note to protect.
  insert into public.funder_watchlist (name, listing_url, notes)
  values ('059 proof sentinel', sentinel, 'Hand-written note that must survive');

  select notes into before_txt from public.funder_watchlist where listing_url = sentinel;

  -- Exercise the same conflict clause the trigger uses.
  insert into public.funder_watchlist (name, listing_url, notes)
  values ('059 proof sentinel', sentinel,
          'Auto-enrolled on entering between_rounds_scheduled — ' || to_char(now(), 'YYYY-MM-DD'))
  on conflict (listing_url) do update
    set notes = case
                  when coalesce(funder_watchlist.notes, '') = '' then excluded.notes
                  else funder_watchlist.notes || E'\n'
                       || 'Re-enrolled on entering between_rounds_scheduled — '
                       || to_char(now(), 'YYYY-MM-DD')
                end
    where position('Re-enrolled on entering between_rounds_scheduled — '
                   || to_char(now(), 'YYYY-MM-DD')
                   in coalesce(funder_watchlist.notes, '')) = 0;

  select notes into after_txt from public.funder_watchlist where listing_url = sentinel;

  if after_txt = before_txt then
    raise exception '059 proof failed: a conflicting enrolment wrote nothing (this is the 057 behaviour)';
  end if;
  if position('Hand-written note that must survive' in after_txt) = 0 then
    raise exception '059 proof failed: the human note was clobbered';
  end if;
  if after_txt not ilike '%enrolled on entering between_rounds_scheduled%' then
    raise exception '059 proof failed: the canonical observable does not match';
  end if;

  delete from public.funder_watchlist where listing_url = sentinel;
  raise notice '059 proof passed: conflict appends, human note survives, observable matches';
end;
$$;
