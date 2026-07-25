-- ═══════════════════════════════════════════════════════════════════════════════
-- Dead-zone reconciliation — 2026-07-25
--
-- ⚠️  NOT RUN. This is a prepared, reviewed script awaiting an explicit go.
--     Run the DRY RUN section first and check the counts match this header.
--     Take a backup before the UPDATE section (see CLAUDE.md → Ops: backups).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FIXES
--
-- Four code paths set is_active=false without going through mergeGrantUpdate, so
-- pipeline_state was never transitioned. The result is 112 rows that are
-- pipeline_state='published' AND is_active=false: invisible to users (every user
-- surface filters is_active) and invisible to admin (every queue keys off
-- pipeline_state, and every triage tab also filters is_active=true). They are
-- reachable only by raw SQL.
--
-- Plus the mirror case: 9 rows are pipeline_state='archived' AND is_active=true,
-- i.e. live to users while labelled archived.
--
-- The code that generated these is fixed in commits c8c37d6 (check-coming-soon),
-- 5194853 (validate-urls) and 67a64bf (sweep Rule 5, flag-grant). This script
-- only cleans up the rows already stranded. Nothing here should recur.
--
-- COHORTS (total 112 + 9 = 121 rows)
--
--   A   11 rows  url_status='dead'                → archived
--                validate-urls killed these; the merger would have said
--                'archived' (is_active=false + url_status='dead').
--
--   B4  75 rows  check-coming-soon fingerprint,   → rejected
--                deadline in the past               + rejection_reason
--                These are EXPIRED. Do not route them to Needs Review — that
--                would add 75 dead items to the queue for no benefit. 'rejected'
--                + 'historical_deadline' is exactly what sweep Rule 5 assigns to
--                a past-deadline row with no cycle.
--
--   B2  12 rows  check-coming-soon fingerprint,   → captured
--   B3   4 rows  no deadline / future deadline      (Needs Review)
--                These are the ones that genuinely need a human: their stated
--                open date arrived, so someone must find the real deadline.
--                This is what check-coming-soon was always supposed to do.
--
--   C   10 rows  none of the above                → LEFT ALONE
--                Deliberately not touched. Listed by the dry run for eyes.
--
--   INV  9 rows  archived AND is_active=true      → published (RECOMMENDED)
--                All 9 have url_status ok/unchecked (not dead), were URL-checked
--                on 2026-07-19, and are real live funders with future or rolling
--                deadlines (Morrisons Foundation, Steel Charitable Trust,
--                American Express Community Giving, The Grocers' Charity, Access
--                Foundation, Happy Days, St Giles & St George, Toy Trust, Gordon
--                Fraser). is_active=true is the operative truth here — users can
--                already see them — so the 'archived' LABEL is the error.
--
--                ⚠️  DECISION NEEDED. If any of these were deliberately hidden,
--                    the correct fix is the opposite (set is_active=false).
--                    Section 5 is commented out by default for that reason.
--
-- Every UPDATE is idempotent: re-running changes nothing once applied.
-- No UPDATE here touches a TRACKED field, so field_provenance and the trust
-- ladder are unaffected.


-- ═══════════════════════════════════════════════════════════════════════════════
-- DRY RUN — run this whole section first. Expect: A=11, B4=75, B2=12, B3=4,
-- C=10, INV=9.
-- ═══════════════════════════════════════════════════════════════════════════════

select 'A  -> archived'  as cohort, count(*) as n from scraped_grants
  where pipeline_state='published' and not is_active and url_status='dead'
union all
select 'B4 -> rejected', count(*) from scraped_grants
  where pipeline_state='published' and not is_active and url_status <> 'dead'
    and next_open_date is null and next_open_date_parsed is null
    and deadline is not null and deadline < current_date
union all
select 'B2 -> captured (no deadline)', count(*) from scraped_grants
  where pipeline_state='published' and not is_active and url_status <> 'dead'
    and next_open_date is null and next_open_date_parsed is null
    and deadline is null
union all
select 'B3 -> captured (future deadline)', count(*) from scraped_grants
  where pipeline_state='published' and not is_active and url_status <> 'dead'
    and next_open_date is null and next_open_date_parsed is null
    and deadline is not null and deadline >= current_date
union all
select 'C  -> left alone', count(*) from scraped_grants
  where pipeline_state='published' and not is_active and url_status <> 'dead'
    and not (next_open_date is null and next_open_date_parsed is null)
union all
select 'INV -> decision needed', count(*) from scraped_grants
  where pipeline_state='archived' and is_active
order by 1;

-- Cohort C in full — these are NOT modified by this script. Eyeball them.
select id, left(title, 60) as title, left(funder, 30) as funder,
       url_status, deadline, is_rolling, next_open_date, url_last_checked
from scraped_grants
where pipeline_state='published' and not is_active and url_status <> 'dead'
  and not (next_open_date is null and next_open_date_parsed is null)
order by deadline nulls last;


-- ═══════════════════════════════════════════════════════════════════════════════
-- UPDATES — only run after the dry-run counts check out and a backup exists.
-- Wrapped in a transaction so all four move together or none do.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- 1. Cohort A (11) — validate-urls killed the URL. Correct state is 'archived'.
update scraped_grants
   set pipeline_state = 'archived'
 where pipeline_state = 'published'
   and not is_active
   and url_status = 'dead';

-- 2. Cohort B4 (75) — expired. Mark rejected, keep out of the review queue.
update scraped_grants
   set pipeline_state   = 'rejected',
       rejection_reason = coalesce(rejection_reason, 'historical_deadline')
 where pipeline_state = 'published'
   and not is_active
   and url_status <> 'dead'
   and next_open_date is null
   and next_open_date_parsed is null
   and deadline is not null
   and deadline < current_date;

-- 3. Cohorts B2 + B3 (16) — genuinely need a human to find the real deadline.
--    'captured' is in the Needs Review predicate
--    ('captured','enriched','tagged','tagged_awaiting_review').
update scraped_grants
   set pipeline_state = 'captured'
 where pipeline_state = 'published'
   and not is_active
   and url_status <> 'dead'
   and next_open_date is null
   and next_open_date_parsed is null
   and (deadline is null or deadline >= current_date);

-- 4. Verify inside the transaction before committing. Both should return 0
--    except cohort C (10), which is intentionally untouched.
select 'remaining published+inactive (expect 10 = cohort C)' as check, count(*) as n
from scraped_grants where pipeline_state='published' and not is_active
union all
select 'newly archived (expect 11)', count(*)
from scraped_grants where pipeline_state='archived' and not is_active and url_status='dead'
   and id in (select id from scraped_grants where pipeline_state='archived');

commit;
-- rollback;  -- swap for the commit above if the numbers look wrong


-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. INVERTED COHORT (9) — COMMENTED OUT, needs a decision first.
--
-- Recommended (label is wrong, grants are genuinely live):
--
--   update scraped_grants
--      set pipeline_state = 'published'
--    where pipeline_state = 'archived'
--      and is_active
--      and url_status <> 'dead';
--
-- Alternative, if these were deliberately hidden and is_active=true is the
-- mistake — note this REMOVES them from user search:
--
--   update scraped_grants
--      set is_active = false
--    where pipeline_state = 'archived'
--      and is_active;
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- POST-RUN VERIFICATION — the dead zone should be gone and stay gone.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- select pipeline_state, is_active, count(*)
-- from scraped_grants group by 1,2 order by 1,2;
--
-- Re-run weekly for a month. If published+inactive starts growing again, a
-- merger bypass has been reintroduced somewhere — grep for
-- `.update({` alongside `is_active` outside src/lib/grant-merge.ts.
