-- 056 — the re-check cadence is keyed off what the page said, not when we last
-- looked.
--
-- APPLIED TO PROD 2026-08-16, immediately before this file was committed.
--
-- Set by Paul, 2026-08-16, rejecting the flat 14-day cooldown shipped in 055:
--
--   "A flat 14 days is wrong for funders that are genuinely open year-round. Key
--    the cadence off what the page said, not when we last looked."
--
-- The full proposal is docs/verify-cadence-design.md. In short, three shapes:
--
--   dated        474 rows holding a real date → read around the date, not on a
--                clock: ten days ahead of an opening, the day after it opens,
--                the day after a closing.
--   always_open  198 rows whose page states year-round AND where we hold the
--                quote → twice a year. Fortnightly cost 5,148 reads a year to
--                re-confirm a sentence that had not moved.
--   silent       401 rows read and still unknown → 14, 28, 56, 112, 180 days,
--                doubling on each consecutive silence, reset by any answer.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE DATE IS COMPUTED IN TYPESCRIPT AND ONLY STORED HERE
--
-- The dated shape needs `deadline_cycle`'s label classification — is this entry
-- an opening, a closing, or the day outcomes go out — and that classification
-- lives in src/lib/deadline-cycle.ts. It exists as a shared module precisely
-- because it had been copied twice and both copies carried the same bug, so a
-- third copy written in SQL is the one thing this cannot afford. The engine
-- computes `verify_due_at` with the same functions the nightly roll-forward uses
-- and stores the answer; this migration only orders by it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE TRIGGER IS THE ESCAPE HATCH, AND IT IS WHY THIS IS NOT A GENERATED COLUMN
--
-- A stored due date is computed from the row's dates AS THEY WERE AT THE READ.
-- If a date arrives afterwards — from the crawler, an admin edit, enrichment, a
-- raw SQL fix — the stored answer is stale, and the row would serve out a nap
-- earned under different facts. Paul named this as a condition:
--
--   "Shape A needs its own escape hatch: if an always-open row's page later
--    shows dates, it must leave shape A immediately rather than waiting out its
--    180 days."
--
-- So any change to a timing column clears `verify_due_at`, and a null due date
-- means due now. A trigger rather than a line in `mergeGrantUpdate` because
-- `mergeGrantUpdate` is only one of the write paths into this table: the
-- crawlers, the admin UI and hand-run SQL all reach it directly, and a guard
-- that only covers the polite callers is not a guard.
--
-- The in-process half — a date outranking a confirmed rolling flag at the moment
-- of the read — is tested in verify-cadence.test.ts. The DB half is proved below.

-- ── The columns ──────────────────────────────────────────────────────────────

alter table public.scraped_grants
  add column if not exists verify_due_at timestamptz;

comment on column public.scraped_grants.verify_due_at is
  'When this row is next worth reading against the funder page. Computed by the verification engine from what the page said (see src/lib/verification/verify-cadence.ts) and cleared by trigger whenever a timing column changes. NULL means due now.';

-- Something outside the schedule says this row changed and should be read next,
-- ahead of the clock. Written by check-watchlist, cleared by the engine.
--
-- It is a separate column from `verify_due_at` because "when" and "why now" are
-- different facts and collapsing them loses the reason: a row made due by a
-- changed listing page and a row made due by its cooldown expiring want the same
-- treatment from the scheduler and very different treatment from a reviewer.
alter table public.scraped_grants
  add column if not exists verify_flag text;

comment on column public.scraped_grants.verify_flag is
  'Why this row jumped the verification queue: watchlist_change, listing_collapsed. NULL normally. Set by check-watchlist, cleared by verify-rows after the read.';

-- The queue reads (verify_flag, verify_due_at) on every selection.
create index if not exists scraped_grants_verify_due_idx
  on public.scraped_grants (verify_due_at nulls first)
  where apply_url is not null and apply_url <> '';

create index if not exists scraped_grants_verify_flag_idx
  on public.scraped_grants (verify_flag)
  where verify_flag is not null;

-- ── The escape hatch ─────────────────────────────────────────────────────────

create or replace function public.clear_verify_due_on_timing_change()
returns trigger
language plpgsql
as $$
begin
  -- `is distinct from` rather than `<>` so a change to or from NULL counts. A
  -- deadline being SET is the case this exists for, and `null <> '2026-09-30'`
  -- is null, not true, so the naive comparison would miss exactly it.
  if new.deadline       is distinct from old.deadline
  or new.next_open_date is distinct from old.next_open_date
  or new.deadline_cycle is distinct from old.deadline_cycle
  or new.is_rolling     is distinct from old.is_rolling
  then
    new.verify_due_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists scraped_grants_clear_verify_due on public.scraped_grants;

create trigger scraped_grants_clear_verify_due
  before update on public.scraped_grants
  for each row
  execute function public.clear_verify_due_on_timing_change();

-- ── The queue ────────────────────────────────────────────────────────────────
--
-- The bands from 055 are unchanged in meaning and numbering. Only `due` changes:
-- it was "last checked more than 14 days ago" and is now "the row's own due date
-- has arrived".
--
-- Band 0 gains one member: a row something outside the schedule says has
-- changed. That is not a widening of "risk", it is the same claim about a user's
-- exposure arriving by a different route — a funder's listing page changing
-- under a row we publish is exactly as urgent as a claim we cannot back, and it
-- has the advantage of being evidence that something actually happened rather
-- than evidence that time has passed. `flagged` is counted separately below so
-- the band 0 number does not quietly change meaning.

create or replace function public.select_verify_batch(limit_n int default 60)
returns table (
  id                  uuid,
  oldest_checked_at   timestamptz,
  band                int
)
language sql
stable
as $$
  with scored as (
    select g.id,
           g.is_active,
           g.verify_flag,
           (g.is_rolling is true or g.deadline is not null)              as asserts_timing,
           -- Backed only by a fresh, quoted agreement, matching isConfirmed().
           (   (g.field_evidence #>> '{deadline,agrees}')   = 'true'
               and coalesce(g.field_evidence #>> '{deadline,quote}', '') <> ''
            or (g.field_evidence #>> '{is_rolling,agrees}') = 'true'
               and coalesce(g.field_evidence #>> '{is_rolling,quote}', '') <> ''
           )                                                             as timing_backed,
           e.oldest,
           -- The cadence, in one line. A row that has never been read has no due
           -- date and is due; so is one whose stored date has arrived.
           (g.verify_due_at is null or g.verify_due_at <= now())         as due
      from public.scraped_grants g
      left join lateral (
        select min((v.value->>'checked_at')::timestamptz) as oldest
          from jsonb_each(coalesce(g.field_evidence, '{}'::jsonb)) v
      ) e on true
     where g.apply_url is not null
       and g.apply_url <> ''
       and (g.pipeline_state is null
            or g.pipeline_state not in ('rejected', 'archived'))
       and coalesce(g.needs_intervention_reason, '') = ''
  )
  select id, oldest,
         case
           -- Something told us this row changed. Better than a timer, and the
           -- only signal here that is evidence rather than the absence of it.
           when verify_flag is not null                                   then 0
           -- A claim a user can see today, with nothing behind it.
           when is_active and asserts_timing and not timing_backed and due then 0
           -- In front of users and never looked at.
           when is_active and oldest is null                              then 1
           -- The same unbacked claim, waiting to publish into the same wrongness.
           when asserts_timing and not timing_backed and due              then 2
           else 3
         end as band
    from scored
   where verify_flag is not null or due   -- nothing is re-read before it is due
   -- Within band 0, a flagged row leads: it is the only entry whose urgency
   -- comes from something having happened rather than from time having passed,
   -- and `oldest nulls first` would otherwise sort a recently-read flagged row
   -- behind every never-read one.
   order by band, (verify_flag is null), oldest nulls first, id
   limit greatest(limit_n, 0);
$$;

comment on function public.select_verify_batch(int) is
  'Verification queue ordered by RISK, gated by each row''s own verify_due_at. Band 0: flagged by an outside signal, or a live row asserting timing with no quoted confirmation. Then live-and-never-read, then the same claim not yet public, then everything else oldest-first. See supabase/migrations/056_verify_cadence.sql.';

-- ── The counts ───────────────────────────────────────────────────────────────
--
-- DROP first: Postgres will not let `create or replace` change a function's
-- return type, and this one gains two columns. Safe because the only caller is
-- the verify-rows route, deployed from the same commit.
drop function if exists public.verify_batch_counts();

create or replace function public.verify_batch_counts()
returns table (
  eligible          bigint,
  never_checked     bigint,
  band0             bigint,
  excluded          bigint,
  live_unbacked     bigint,
  live_unbacked_due bigint,
  -- Shape C. Rows we have read where the page still does not tell us when, or
  -- whether, anyone can apply.
  --
  -- ON THE LINE FROM DAY ONE, AS A CONDITION. Set by Paul, 2026-08-16: "Shape
  -- C's count goes on the Pipeline line beside live_unbacked from day one, so a
  -- deferred gap never reads as a closed one." Backing off is the right response
  -- to a page that will not answer and it is not the question being settled;
  -- 401 rows is the single largest honest gap in the catalogue and it must stay
  -- visible while it is deferred.
  timing_unknown      bigint,
  timing_unknown_live bigint,
  flagged             bigint
)
language sql
stable
as $$
  with scored as (
    select g.is_active,
           g.verify_flag,
           (g.is_rolling is true or g.deadline is not null) as asserts_timing,
           (   (g.field_evidence #>> '{deadline,agrees}')   = 'true'
               and coalesce(g.field_evidence #>> '{deadline,quote}', '') <> ''
            or (g.field_evidence #>> '{is_rolling,agrees}') = 'true'
               and coalesce(g.field_evidence #>> '{is_rolling,quote}', '') <> ''
           ) as timing_backed,
           -- Mirrors `timingAnswered()` in verify-cadence.ts: a quoted verdict
           -- either way, on any of the three timing fields, is an answer. A
           -- contradiction counts — the page IS talking about timing, and the
           -- row goes back on a short leash rather than continuing to back off.
           (   (g.field_evidence #>> '{deadline,agrees}')       in ('true','false')
               and coalesce(g.field_evidence #>> '{deadline,quote}', '') <> ''
            or (g.field_evidence #>> '{is_rolling,agrees}')     in ('true','false')
               and coalesce(g.field_evidence #>> '{is_rolling,quote}', '') <> ''
            or (g.field_evidence #>> '{deadline_cycle,agrees}') in ('true','false')
               and coalesce(g.field_evidence #>> '{deadline_cycle,quote}', '') <> ''
           ) as timing_answered,
           coalesce(g.field_evidence ? '_page_read', false) as page_read,
           e.oldest,
           (g.verify_due_at is null or g.verify_due_at <= now()) as due,
           (g.apply_url is not null and g.apply_url <> ''
            and (g.pipeline_state is null
                 or g.pipeline_state not in ('rejected', 'archived'))
            and coalesce(g.needs_intervention_reason, '') = '') as eligible
      from public.scraped_grants g
      left join lateral (
        select min((v.value->>'checked_at')::timestamptz) as oldest
          from jsonb_each(coalesce(g.field_evidence, '{}'::jsonb)) v
      ) e on true
  )
  select count(*) filter (where eligible),
         count(*) filter (where eligible and oldest is null),
         count(*) filter (where eligible
                                and (verify_flag is not null
                                     or (is_active and asserts_timing
                                         and not timing_backed and due))),
         count(*) filter (where not eligible),
         -- Every live unbacked claim, cooldown or not: this is the number that
         -- says what the product can honestly assert, and it must not shrink
         -- just because a row is resting.
         count(*) filter (where eligible and is_active and asserts_timing
                                and not timing_backed),
         count(*) filter (where eligible and is_active and asserts_timing
                                and not timing_backed and due),
         count(*) filter (where eligible and page_read and not timing_answered),
         count(*) filter (where eligible and is_active and page_read and not timing_answered),
         count(*) filter (where eligible and verify_flag is not null)
    from scored;
$$;

revoke all on function public.select_verify_batch(int) from public, anon, authenticated;
revoke all on function public.verify_batch_counts() from public, anon, authenticated;
grant execute on function public.select_verify_batch(int)  to service_role;
grant execute on function public.verify_batch_counts()     to service_role;

-- ── Proof: the escape hatch actually fires ───────────────────────────────────
--
-- A check that cannot fail is not a check. This one starts from a row whose
-- `verify_due_at` is six months out — the always-open nap — and asserts that
-- setting a deadline clears it. If the trigger were missing, or matched with
-- `<>` instead of `is distinct from`, the second assertion fails and the
-- migration aborts.
--
-- PROVED FALSE-FIRST, 2026-08-16. The same assertion was run again with the
-- trigger temporarily disabled and it failed, as it must. A probe whose value is
-- already true passes instantly and means nothing, so the failing run is the
-- half that gives the passing run its weight.

do $$
declare
  probe_id uuid;
  due_after timestamptz;
begin
  -- An archived, invisible row. The whole block is one transaction so no other
  -- session could see the intermediate state anyway, but a probe that writes a
  -- deadline onto a row a user might be looking at is not a probe worth the
  -- risk, and picking a dead row costs nothing.
  select id into probe_id
    from public.scraped_grants
   where deadline is null and next_open_date is null
     and is_active is not true
     and pipeline_state = 'archived'
   limit 1;

  -- Not `return` — a proof that quietly declines to run is the failure mode
  -- this whole tranche exists to remove.
  if probe_id is null then
    raise exception 'no archived dateless row to probe with; escape-hatch proof could not run';
  end if;

  -- Park it on a 180-day nap, the way shape A would.
  update public.scraped_grants
     set verify_due_at = now() + interval '180 days'
   where id = probe_id;

  select verify_due_at into due_after from public.scraped_grants where id = probe_id;
  if due_after is null then
    raise exception 'setup failed: verify_due_at did not take (%)', probe_id;
  end if;

  -- A date arrives. It must not serve out the remaining 180 days.
  update public.scraped_grants set deadline = '2099-12-31' where id = probe_id;

  select verify_due_at into due_after from public.scraped_grants where id = probe_id;
  if due_after is not null then
    raise exception 'ESCAPE HATCH BROKEN: a deadline arrived and verify_due_at survived (% on %)',
      due_after, probe_id;
  end if;

  -- Put the probe row back exactly as it was.
  update public.scraped_grants set deadline = null, verify_due_at = null where id = probe_id;

  raise notice 'escape hatch proved on %', probe_id;
end;
$$;
