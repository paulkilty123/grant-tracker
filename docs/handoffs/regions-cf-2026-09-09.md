# Handoff: the four regions the launch signups live in and the catalogue does not

Written 2026-09-09 by the orchestrating session, commissioned by Paul the same
evening after a match test over the 26 launch-waitlist organisations. Read
`CLAUDE.md` first, all of it, then `programmes-cohorts-2026-09-08.md` for the
budget, citation and staging rules, which apply here unchanged. Then this.

## Why this job exists

Fifteen of the 26 waitlist organisations are identifiable charities and CICs.
Every one gets at least four Good matches today, so nobody lands on an empty
page. But the matches are national trusts that match almost anyone (Cuthbert
Horn, Cadbury, Yapp, Joseph Rank), and the local layer underneath is missing
for four of them:

| Region | Live local rows | Who is waiting |
|---|---|---|
| Cheshire | 0 | North West Pre-hospital Critical Care (regional, health) |
| Wales | 1 (Social Investment Cymru) | Swansea Rainbow Counselling Centre |
| Bristol | 2 (Quartet Express, John James Community Grants) | ACTA, FareShare South West |
| Cornwall | 2 | Men Walk Talk |

For comparison London has 26, Sussex 8, Greater Manchester 10. Sheffield is
being fixed by the three SYCF rows in review. Devon (2) and Surrey (1) are
also thin but nobody on the list needs them yet; take them only if the four
above finish under budget.

## The job in one sentence

For Cheshire, Wales, Bristol and Cornwall, find the community foundation, the
council and the place-based funders whose funds a local charity, CIC or social
enterprise can apply to today or within 30 days, that the catalogue does not
hold, and stage each one hidden for review.

**Target: 20 staged, about five a region.** Stop there, or when the provider
list is worked through, or under the budget rule.

## The shape that qualifies

The community foundation convention (`project_cf_cataloguing_convention`)
governs: **one row per community foundation, plus a separate row for any
dated fund that is open now or opens within 30 days.** A foundation's "all our
funds" page is one row with `funding_index_url` banked; a named fund with its
own page, its own deadline and its own criteria is its own row.

A candidate qualifies when all three hold:

1. **A local charity, CIC or social enterprise applies.** Individuals-only,
   schools-only or business-only funds are `out_of_scope`.
2. **The page states who can apply and what for.** A homepage that says "we
   fund good causes in Cheshire" and nothing else is a front door, and a
   front door is fine as the foundation's one row, but it is not a fund row.
3. **Open now, rolling, or opening within 30 days** with a stated date.
   Closed with no reopening date goes to the results file as
   `closed_no_date`, not to staging.

## Where to look, in order

**Cheshire.** Cheshire Community Foundation (all funds; the Cheshire
Community Fund and any Crewe, Chester, Warrington or Halton named funds).
Cheshire East and Cheshire West councils' community grants. Warrington
Voluntary Action and Halton's community fund pages. The Westminster
Foundation's Chester work. The critical care charity is regional health, so
also check whether any Cheshire hospital charity or the North West
Ambulance Charity runs an open grants scheme; if it does not, say so.

**Wales.** Community Foundation Wales (all funds; it runs many named
regional funds and the Fund for Wales). Moondance Foundation. The Waterloo
Foundation's Wales programme. Swansea Council's community grants. The
Welsh Government's Third Sector funding page as an index only. Lloyds Bank
Foundation's Wales-specific work is already held (10 live rows mention
Wales; dedup carefully). For Swansea Rainbow specifically, check the
Swansea Council for Voluntary Service funding page as an index.

**Bristol.** Quartet Community Foundation: the Express Grant is held, the
main grants programme and any named funds (Bristol Impact Fund, Nisbet
Trust, Society of Merchant Venturers funds via Quartet) are not. Bristol City
Council's Community Resilience Fund and cultural grants. The John James
Bristol Foundation is held. St Monica Trust community grants. For FareShare
South West, food-sector funders are the national brief's job, not this one.

**Cornwall.** Cornwall Community Foundation (all funds; the Resilience Fund
row exists, check whether it is the foundation's row or a named fund).
Cornwall Council's Community Chest and councillor grants. Cornwall
Voluntary Sector Forum funding page as an index. Men Walk Talk is men's
mental health: check whether the foundation has a mental health or Cornwall
Wellbeing named fund.

Every name is a lead to verify, not a fact. Confirm on the funder's own page,
read today.

## Tagging

`location_tag` is the county or nation as the funder names it (`Cheshire`,
`Wales`, `Bristol`, `Cornwall`); a fund that names a town gets the town.
`is_local: true`. `funder_type: 'community_foundation'` for CF rows,
`'local_authority'` for councils. Eligible structures exactly as the page
states them, never the full list by default. Amounts only for a stated
per-applicant figure, and read `feedback_pounds_on_a_page_are_rarely_the_award`
first: a foundation's annual giving is not an award.

## Budget, citations, dedup, staging, results

As `programmes-cohorts-2026-09-08.md`: one session, no fan-out, two page reads
per candidate, one search per provider, no Anthropic spend, batches of ten
with a dry run and tsc before each commit. Quotes only from page text fetched
in this session. Dedup in SQL by host, title words and funder against the
whole table including archived and rejected rows.

Stage with `stampNewGrant`, `is_active: false`, `pipeline_state:
'tagged_awaiting_review'`, source `system:regions-cf-2026-09-09` at trust 50.
Staged rows land under "Needs reading" until the 01:00 engine reads them;
that is correct, never write `_page_read`.

Results in `docs/handoffs/regions-cf-results-2026-09-09.json`, the usual shape,
with `why` values from the programmes brief plus `closed_no_date` and
`front_door_only`. Close with staged count per region and the live local row
count per region before and after.

## What the orchestrator checks afterwards

The four regional counts re-derived in SQL; a dedup query over every staged
title and host; no staged row active, none at `admin:` or `user_verified:`
trust; every quote checked against the page it names; and the match test
(`scripts/waitlist-match-test-2026-09-08.ts`) re-run to show the four
organisations' local Good matches before and after.
