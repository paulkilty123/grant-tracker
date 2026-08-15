-- 054 — which rows the verification engine reads next.
--
-- APPLIED TO PROD 2026-08-15, immediately before this file was committed.
--
-- WHY THIS IS A FUNCTION AND NOT A .order() CALL.
--
-- "Oldest evidence first" is an ordering over the CONTENTS of a jsonb column —
-- the minimum `checked_at` across every stamp on the row. supabase-js cannot
-- express that, and the alternative is to pull a window of rows and sort them in
-- JavaScript. That pattern has produced silent wrong answers in this codebase
-- more than once: `.limit(N)` then `.filter()` in JS quietly returns whatever
-- happened to be in the first N, and looks exactly like a correct empty result.
-- Push the ordering to the database or do not claim it.
--
-- ORDERING, in three bands:
--
--   0  never checked, live, and ASSERTS ITS TIMING (rolling, or a deadline)
--   1  never checked, anything else
--   2  checked before — oldest stamp first
--
-- Band 0 exists because of §6 of the tranche 2 design: the single largest
-- correctness question in the catalogue is 396 live rows claiming Rolling with
-- nothing behind the claim. Straight oldest-first would reach them eventually;
-- this reaches them first, without needing a separate one-off script that then
-- has to be kept in step with the engine.
--
-- Within a band the tiebreak is `id`, so the order is total and a run cannot
-- return the same row twice or starve one forever.
--
-- WHAT IS EXCLUDED, and it is counted rather than hidden:
--
--   - no apply_url          nothing to read
--   - rejected / archived   already out of view on a decision
--   - quarantined           the enrichment chain gave up; every other cron skips
--                           these too, and a row whose processing failed should
--                           be fixed rather than re-read on a schedule
--
-- The engine reports the excluded count in its run summary. A filter that drops
-- rows without saying how many is how "checked 0" read as "nothing to do" for
-- the entire time validate-urls' review-queue pass was starving.
--
-- `pipeline_state` is a Postgres ENUM, not text, so `coalesce(state, '')` is a
-- runtime error rather than a null guard: it tries to cast '' into the enum and
-- the whole function fails to create. The null branch is spelled out for that
-- reason. No row currently holds a null state, but the column permits one.

create or replace function public.select_verify_batch(limit_n int default 60)
returns table (
  id                  uuid,
  oldest_checked_at   timestamptz,
  band                int
)
language sql
stable
as $$
  select g.id,
         e.oldest,
         case
           when e.oldest is null
                and g.is_active
                and (g.is_rolling is true or g.deadline is not null) then 0
           when e.oldest is null then 1
           else 2
         end as band
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
   order by band, e.oldest nulls first, g.id
   limit greatest(limit_n, 0);
$$;

comment on function public.select_verify_batch(int) is
  'Verification engine work queue, oldest-evidence-first, with rows that assert their own timing and have never been checked promoted to the front. See supabase/migrations/054_verify_batch_selection.sql for the bands.';

-- Counts for the same population, so a run can report what it skipped instead of
-- reporting a smaller number and letting it read as "nothing to do".
create or replace function public.verify_batch_counts()
returns table (
  eligible      bigint,
  never_checked bigint,
  band0         bigint,
  excluded      bigint
)
language sql
stable
as $$
  with scored as (
    select g.is_active, g.is_rolling, g.deadline, e.oldest,
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
         count(*) filter (where eligible and oldest is null and is_active
                                and (is_rolling is true or deadline is not null)),
         count(*) filter (where not eligible)
    from scored;
$$;

revoke all on function public.select_verify_batch(int) from public, anon, authenticated;
revoke all on function public.verify_batch_counts() from public, anon, authenticated;
grant execute on function public.select_verify_batch(int)  to service_role;
grant execute on function public.verify_batch_counts()     to service_role;
