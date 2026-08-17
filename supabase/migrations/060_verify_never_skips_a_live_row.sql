-- 060 — a row a user can see is never excluded from verification.
--
-- APPLIED TO PROD 2026-08-17, immediately before this file was committed.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WAS WRONG
--
-- 054 gated the verification queue on three conditions, and two of them ask a
-- question about the ADMIN QUEUE rather than about the USER:
--
--     and (g.pipeline_state is null
--          or g.pipeline_state not in ('rejected', 'archived'))
--     and coalesce(g.needs_intervention_reason, '') = ''
--
-- Both are sound as a spending rule — do not pay to read a row nobody will see,
-- and do not pay to re-read a row a human has to fix by hand. Neither is sound
-- when the row is ALSO `is_active`, because then it is on the site.
--
-- On 2026-08-17 that was true of 29 live rows, and all 29 had never been read:
--
--   21  `needs_intervention_reason` set AND `pipeline_state = 'published'`.
--       Every one of the notes is a staging line from the July gap audits —
--       "Review & activate", "Confirm and publish once reviewed". Paul reviewed
--       and published them; nothing cleared the note. So the note stopped
--       meaning "awaiting a human" and started meaning, silently, "never check
--       this again".
--
--    8  `is_active = true` AND `pipeline_state = 'archived'`. The two columns
--       disagree outright: the admin queue believes the row is gone, the site
--       shows it. Morrisons Foundation, Steel Charitable Trust, Toy Trust,
--       American Express Community Giving among them.
--
-- The effect is the worst shape a gap can take. "637 of 670 live rows read" was
-- reported repeatedly as coverage approaching complete, and the residue was
-- taken for a queue still draining. It was not draining. Those rows were not in
-- the queue and no run would ever have picked them up, so the number could never
-- reach the total and nothing said why.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE RULE
--
-- The gate on verification is "can a user see this", not "what does the admin
-- queue think of it". `apply_url` stays a hard requirement in both branches —
-- there is no page to read without one — and no live row lacks one today.
--
-- This does not repair either desync. It stops them hiding: the engine now reads
-- these rows, and the evidence is what a decision about them can rest on.
-- Choosing between `is_active` and `pipeline_state` on the 8 is Paul's call and
-- is user-visible, so it is not made here.
--
-- Cost: 29 rows enter the queue once, ~35p at the measured per-row rate, on the
-- existing four-runs-a-day cadence. No hand-fired pass.

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
           (g.verify_due_at is null or g.verify_due_at <= now())         as due
      from public.scraped_grants g
      left join lateral (
        select min((v.value->>'checked_at')::timestamptz) as oldest
          from jsonb_each(coalesce(g.field_evidence, '{}'::jsonb)) v
      ) e on true
     where g.apply_url is not null
       and g.apply_url <> ''
       -- Live, or not excluded on admin grounds. Never both questions of a row
       -- the public can reach.
       and (g.is_active
            or ((g.pipeline_state is null
                 or g.pipeline_state not in ('rejected', 'archived'))
                and coalesce(g.needs_intervention_reason, '') = ''))
  )
  select id, oldest,
         case
           when verify_flag is not null                                   then 0
           when is_active and asserts_timing and not timing_backed and due then 0
           when is_active and oldest is null                              then 1
           when asserts_timing and not timing_backed and due              then 2
           else 3
         end as band
    from scored
   where verify_flag is not null or due
   order by band, (verify_flag is null), oldest nulls first, id
   limit greatest(limit_n, 0);
$$;

comment on function public.select_verify_batch(int) is
  'Verification queue ordered by RISK, gated by each row''s own verify_due_at. A row a user can see is never excluded on admin grounds (see 060). Band 0: flagged by an outside signal, or a live row asserting timing with no quoted confirmation. Then live-and-never-read, then the same claim not yet public, then everything else oldest-first.';

-- ── The counts ───────────────────────────────────────────────────────────────
--
-- `eligible` moves in step with the selector — the two disagreeing is how this
-- kind of hole stays invisible.
--
-- One new column. `live_state_conflict` counts rows admitted ONLY because they
-- are live: on the site while the admin queue calls them archived, rejected, or
-- awaiting a human. It is 29 today and it is not meant to be a number that
-- passes. A count that is zero by construction proves nothing; this one falls as
-- the desyncs are settled and rises the moment a new one appears.

drop function if exists public.verify_batch_counts();

create or replace function public.verify_batch_counts()
returns table (
  eligible            bigint,
  never_checked       bigint,
  band0               bigint,
  excluded            bigint,
  live_unbacked       bigint,
  live_unbacked_due   bigint,
  timing_unknown      bigint,
  timing_unknown_live bigint,
  flagged             bigint,
  live_state_conflict bigint
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
            and (g.is_active
                 or ((g.pipeline_state is null
                      or g.pipeline_state not in ('rejected', 'archived'))
                     and coalesce(g.needs_intervention_reason, '') = ''))) as eligible,
           (g.is_active
            and (g.pipeline_state in ('rejected', 'archived')
                 or coalesce(g.needs_intervention_reason, '') <> '')) as state_conflict
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
         count(*) filter (where eligible and is_active and asserts_timing
                                and not timing_backed),
         count(*) filter (where eligible and is_active and asserts_timing
                                and not timing_backed and due),
         count(*) filter (where eligible and page_read and not timing_answered),
         count(*) filter (where eligible and is_active and page_read and not timing_answered),
         count(*) filter (where eligible and verify_flag is not null),
         count(*) filter (where state_conflict)
    from scored;
$$;

revoke all on function public.select_verify_batch(int) from public, anon, authenticated;
revoke all on function public.verify_batch_counts() from public, anon, authenticated;
grant execute on function public.select_verify_batch(int)  to service_role;
grant execute on function public.verify_batch_counts()     to service_role;

-- ── Proof ────────────────────────────────────────────────────────────────────
--
-- PROVED FALSE-FIRST, 2026-08-17. This exact assertion was run against the OLD
-- function on production before the replacement above and returned 0, which is
-- the defect it is written to catch. It now asserts the same set is non-empty.
--
-- It also checks the two functions agree, because the failure this migration
-- fixes is precisely a selector and a counter that had drifted apart.

do $$
declare
  admitted    bigint;
  conflicting bigint;
  counted     bigint;
begin
  select count(*) into conflicting
    from public.scraped_grants
   where is_active
     and apply_url is not null and apply_url <> ''
     and (pipeline_state in ('rejected', 'archived')
          or coalesce(needs_intervention_reason, '') <> '');

  if conflicting = 0 then
    raise notice 'no live rows in a conflicting admin state; nothing for the proof to bite on';
  else
    select count(*) into admitted
      from public.select_verify_batch(5000) b
      join public.scraped_grants g on g.id = b.id
     where g.is_active
       and (g.pipeline_state in ('rejected', 'archived')
            or coalesce(g.needs_intervention_reason, '') <> '');

    if admitted = 0 then
      raise exception
        'LIVE ROWS STILL SKIPPED: % live rows are in a conflicting admin state and the queue admits none of them',
        conflicting;
    end if;

    raise notice 'queue now admits % of % live rows in a conflicting admin state', admitted, conflicting;
  end if;

  -- The selector and the counter must describe the same population.
  select live_state_conflict into counted from public.verify_batch_counts();
  if counted is distinct from conflicting then
    raise exception 'COUNTER DRIFTED FROM SELECTOR: counter says %, direct count says %',
      counted, conflicting;
  end if;

  raise notice 'selector and counter agree on % live state conflicts', counted;
end;
$$;
