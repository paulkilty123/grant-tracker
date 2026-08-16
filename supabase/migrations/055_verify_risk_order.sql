-- 055 — the verification queue is ordered by RISK, not by age.
--
-- APPLIED TO PROD 2026-08-16, immediately before this file was committed.
--
-- Set by Paul, 2026-08-16:
--
--   "Prioritise by risk, not by queue age. The rows I care about are live ones
--    where the surface asserts something the page never said. A silence on
--    amount renders as absent and is harmless; a silence on timing renders as
--    'Rolling', which is a claim."
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT 054 GOT WRONG
--
-- 054 promoted rows that had NEVER BEEN CHECKED and asserted their timing. That
-- was right for a first pass and wrong the moment the first pass finished,
-- because it treats "checked" as the goal. It is not. The goal is "backed".
--
-- The worst row in the catalogue is not an unchecked one. It is a LIVE row that
-- says Rolling, that the engine has already read, and that came back silent —
-- because that row now carries a `_page_read` stamp, which under 054 sends it to
-- the very back of the queue behind every unread row. The single most misleading
-- row in the catalogue was being sorted last, precisely because we had looked at
-- it and learned nothing.
--
-- So risk is not the absence of a check. It is an ASSERTION WITHOUT A
-- CONFIRMATION, on a row a user can see today.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT COUNTS AS BACKED
--
-- A timing claim is backed when `field_evidence` carries `agrees: true` WITH a
-- quote for `deadline` or `is_rolling`. Deliberately strict, and it mirrors
-- `isConfirmed()` in src/lib/field-evidence.ts:
--
--   agrees: null   the page was read and said nothing. NOT backing. This is the
--                  case that matters most, and 054 could not express it.
--   agrees: false  the page contradicts us. Worse than unbacked: known wrong.
--                  Stays high priority so the correction gets re-read and can be
--                  proposed again.
--   no quote       no verdict. Same as null.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE COOLDOWN, WHICH IS NOT OPTIONAL
--
-- A live row that asserts Rolling and whose page simply never mentions timing
-- will come back silent every single time it is read. Under a pure risk order it
-- would sit at the front of the queue for ever, being re-read four times a day
-- at real cost, and starving everything behind it. That is the same defect as
-- the `_page_read` stamp fixed for failed gates, arriving from the other
-- direction.
--
-- So a risky row is only DUE if it has never been checked, or was last checked
-- more than 14 days ago. Between those it waits. 14 days is short enough that a
-- funder opening a round is noticed within a fortnight, and long enough that an
-- unresolvable row costs ~26 reads a year rather than 1,460.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS CANNOT DO YET
--
-- Paul named eligibility alongside timing. The engine has no eligibility fact:
-- `Extraction` in verify-row.ts covers deadline, deadline_cycle, is_rolling,
-- max_org_income, is_invite_only, still_listed and is_grant, and nothing reads a
-- funder's who-can-apply rules into a comparable value. Ordering by an
-- eligibility risk we cannot then resolve would move rows to the front of a
-- queue that has no answer for them. It is named here so the gap is on the
-- record rather than silently dropped, and it belongs with the extraction work.

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
           (g.is_rolling is true or g.deadline is not null)              as asserts_timing,
           -- Backed only by a fresh, quoted agreement, matching isConfirmed().
           (   (g.field_evidence #>> '{deadline,agrees}')   = 'true'
               and coalesce(g.field_evidence #>> '{deadline,quote}', '') <> ''
            or (g.field_evidence #>> '{is_rolling,agrees}') = 'true'
               and coalesce(g.field_evidence #>> '{is_rolling,quote}', '') <> ''
           )                                                             as timing_backed,
           e.oldest,
           (e.oldest is null or e.oldest < now() - interval '14 days')   as due
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
           -- A claim a user can see today, with nothing behind it.
           when is_active and asserts_timing and not timing_backed and due then 0
           -- In front of users and never looked at.
           when is_active and oldest is null                              then 1
           -- The same unbacked claim, waiting to publish into the same wrongness.
           when asserts_timing and not timing_backed and due              then 2
           else 3
         end as band
    from scored
   where (oldest is null or due)          -- nothing is re-read inside its cooldown
   order by band, oldest nulls first, id
   limit greatest(limit_n, 0);
$$;

comment on function public.select_verify_batch(int) is
  'Verification queue ordered by RISK: a live row asserting timing with no quoted confirmation comes first, then live-and-never-read, then the same claim not yet public, then everything else oldest-first. A 14-day cooldown stops an unresolvable row being re-read four times a day for ever. See supabase/migrations/055_verify_risk_order.sql.';

-- Counts for the same population, so `?peek` can answer "how many live claims
-- are unbacked" without fetching anything.
--
-- DROP first: Postgres will not let `create or replace` change a function's
-- return type, and this one gains two columns. Dropping is safe because the only
-- caller is the verify-rows route, which is deployed from the same commit.
drop function if exists public.verify_batch_counts();

create or replace function public.verify_batch_counts()
returns table (
  eligible          bigint,
  never_checked     bigint,
  band0             bigint,
  excluded          bigint,
  live_unbacked     bigint,
  live_unbacked_due bigint
)
language sql
stable
as $$
  with scored as (
    select g.is_active,
           (g.is_rolling is true or g.deadline is not null) as asserts_timing,
           (   (g.field_evidence #>> '{deadline,agrees}')   = 'true'
               and coalesce(g.field_evidence #>> '{deadline,quote}', '') <> ''
            or (g.field_evidence #>> '{is_rolling,agrees}') = 'true'
               and coalesce(g.field_evidence #>> '{is_rolling,quote}', '') <> ''
           ) as timing_backed,
           e.oldest,
           (e.oldest is null or e.oldest < now() - interval '14 days') as due,
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
         count(*) filter (where eligible and is_active and asserts_timing
                                and not timing_backed and due),
         count(*) filter (where not eligible),
         -- Every live unbacked claim, cooldown or not: this is the number that
         -- says what the product can honestly assert, and it must not shrink
         -- just because a row is resting.
         count(*) filter (where eligible and is_active and asserts_timing
                                and not timing_backed),
         count(*) filter (where eligible and is_active and asserts_timing
                                and not timing_backed and due)
    from scored;
$$;

revoke all on function public.select_verify_batch(int) from public, anon, authenticated;
revoke all on function public.verify_batch_counts() from public, anon, authenticated;
grant execute on function public.select_verify_batch(int)  to service_role;
grant execute on function public.verify_batch_counts()     to service_role;
