# Handoff: Northern Ireland

Written 2026-09-11 by the orchestrating session, commissioned by Paul the
same evening as the second batch of the catalogue scale plan
(`catalogue-scale-plan-2026-09-11.md`, lever 4). Read `CLAUDE.md` first, all
of it, then `programmes-cohorts-2026-09-08.md` for the budget, citation and
staging rules, then `scotland-2026-09-11.md` and its results file for the
shape of a nation batch and what it taught. All of it applies here
unchanged. Then this.

## Why this job exists

Northern Ireland holds 30 rows and 12 are live. The Community Foundation
for Northern Ireland has 14 rows with 2 live, which is the foundation doing
its job through rounds. Below it: Halifax Foundation for Northern Ireland
with one live row, the Arts Council, Sport NI hidden, and one council row,
Belfast, hidden. The trusts a Belfast or Derry charity would name are
mostly absent, and the eleven councils are absent entirely.

Scotland's lesson, 11 September: the trusts tier gave 8 of 14 leads and the
council tier 3 of 12, because council pages are closed rounds, ward pots
with no named intake, or blocked to fetch. So this brief is trusts first,
councils second, and any council page that fetches as 403 or 404 goes
straight to the results file as `unreadable` for Paul's browser rather
than costing a second attempt.

## The job in one sentence

Find the Northern Ireland trusts, foundations and council funds that a
charity, CIC or social enterprise in Northern Ireland can apply to today or
within 30 days, that the catalogue does not hold, and stage each one hidden
for review.

**Target: 15 staged.** Stop there, or when the provider list is worked
through, or under the budget rule.

## The shape that qualifies

The three tests from the regions brief, unchanged:

1. **A charity, CIC or social enterprise applies.** Individuals-only,
   schools-only or business-only funds are `out_of_scope`. A programme open
   to any business counts when a trading social enterprise could join
   (`feedback_programmes_include_social_enterprises_ltd_by_shares`).
2. **The page states who can apply and what for.** A trust whose only page
   is its Charity Commission for Northern Ireland register entry has no
   applyable route: `no_apply_route`. Do not stage a register page.
3. **Open now, rolling, or opening within 30 days** with a stated date.
   Closed with no reopening date is `closed_no_date`, results only. A
   stated month more than 30 days out is staged as
   `between_rounds_scheduled` with `next_open_date`, as Empower was.

And the May filter: skip signposting services, paid training,
volunteer-only programmes, sunset funders, and any directory entry with no
named programme behind it.

## Where to look, in order

**Dedup first, by funder, against the whole table.** Every name below is a
lead. Run the funder query before opening a page.

**Tier one, trusts and foundations with open programmes.** Halifax
Foundation for Northern Ireland (its Community Grants and any named
programmes beyond the one live row). Community Foundation for Northern
Ireland: check the open-funds page for any named fund open now that the 14
rows do not cover, and no more than that. The Ireland Funds (Small Grants
Round, usually spring; record the month). The Bryson Charitable Group's
funds. The Belfast Charitable Society. The Honourable The Irish Society
(Coleraine and the north west). The Esmée Fairbairn and Henry Smith NI
work is already held nationally; leave it. The Rank Foundation and Lloyds
Bank Foundation NI work: held nationally, leave. Coca-Cola HBC NI Thank
You Fund, Ulster Garden Villages, the Wesleyan Foundation NI, the Hospital
Saturday Fund NI, the Pilgrim Trust NI. Comic Relief's Northern Ireland
delivery is via CFNI; do not duplicate.

**Tier two, place funds.** Belfast City Council (the hidden row first: is
it a fund or a front door; then the Community Grants, Capacity Building
and Summer Scheme grants). Derry City and Strabane District Council
community grants. Lisburn and Castlereagh, Ards and North Down, Antrim and
Newtownabbey, Mid and East Antrim, Causeway Coast and Glens, Fermanagh and
Omagh, Mid Ulster, Newry Mourne and Down, Armagh Banbridge and Craigavon:
each council's community grants page, one search and one fetch each. A
403 or 404 is `unreadable`, recorded, moved past.

**Tier three, sector funds with an NI route.** Sport NI (the hidden row
first), Arts Council of Northern Ireland's open programmes beyond the one
live row, the Department for Communities' Community Support Programme as
an index only, Ulster Community Investment Trust beyond the live row, NI
Screen beyond the live row, Rural Community Network, Supporting
Communities, Volunteer Now's funds. Social Enterprise NI: the hidden row
first; support rows are out under the 8 September ruling.

**grantfinder and the CFNI open-funds page** as the directory of last
resort, one search per tier. Funder's own page as `apply_url` where it
verifies.

## Tagging

`location_tag` is `Northern Ireland` for national funders, the council area
as the funder names it for place funds. `is_local: true` on every row.
`funder_type` as the provider is. Eligible structures exactly as the page
states them; Northern Ireland charities register with the Charity
Commission for Northern Ireland, so `registered_charity` applies, and
constituted community groups are `unincorporated`. Amounts only for a
stated per-applicant figure; read
`feedback_pounds_on_a_page_are_rarely_the_award` first.

## Budget, citations, dedup, staging, results

As `programmes-cohorts-2026-09-08.md` and the Scotland brief: one session,
no fan-out, two page reads per candidate, one search per provider, no
Anthropic spend, batches of ten with a dry run and tsc before each commit.
Quotes only from page text fetched in this session. Page the table with
`.range()` and refuse to dedup against a partial read
(`scripts/scotland-stage-2026-09-11.ts` has the pattern, including the
per-row `pipeline_state` for parked funds).

Stage with `stampNewGrant`, `is_active: false`, `pipeline_state:
'tagged_awaiting_review'` (or `between_rounds_scheduled` with a
`next_open_date`), source `system:northern-ireland-2026-09-11` at trust 50.
Never write `_page_read`.

Results in `docs/handoffs/northern-ireland-results-2026-09-11.json`, the
Scotland results shape: `staged` with tier, id, state and note; `not_staged`
with lead and why; live Northern Ireland count before and after; a verdict
by tier.

## What the orchestrator checks afterwards

Every staged URL opened and tested against the front-door rule; a sample
of staged rows re-read against the three tests; every quote checked against
the page it names; the dedup query re-run over staged titles, hosts and
funders; and confirmation that no existing row's `is_active` or
`pipeline_state` changed.
