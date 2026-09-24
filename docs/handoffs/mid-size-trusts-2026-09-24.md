# Handoff: mid-size grants, £25,000 to £100,000, 24 September 2026

Written 2026-09-24 by the orchestrating session, commissioned by Paul the
same evening ("ok can you write them please") after a gap review of the live
catalogue against the org profiles. Read `CLAUDE.md` first, all of it, then
`discovery-week-2026-09-22.md` for the budget, citation and staging rules,
which apply here unchanged. Then this. Run it after
`london-boroughs-2026-09-24.md`.

## Why this job exists

The organisations that pay for Shoots sit in the £100,000 to £1 million
income band (the paying heartland memory, and 31 of the 57 profiles are in
it). What those orgs want is £25,000 to £100,000, often unrestricted or
multi-year. The live catalogue, measured 24 September:

| Ceiling | Live rows |
|---|---|
| £5,000 or under | 183 |
| £5,001 to £25,000 | 142 |
| £25,001 to £100,000 | 73 |
| over £100,000 | 110 |
| no amount stated | 206 |

The band they need is the thinnest. The named trusts that give in it are
mostly held, but as one row each, and many are off:

| Funder | Live / held | Note |
|---|---|---|
| Lloyds Bank Foundation | 0 / 11 | between rounds; check the 2027 programme dates |
| Tudor Trust | 0 / 2 | paused its grant-making in 2024; check whether it has reopened |
| Baring Foundation | 0 / 4 | arts and older people, international; check open strands |
| Power to Change | 0 / 6 | stopped open grants; skip unless a new fund is open |
| Nationwide Foundation | 0 / 5 | housing; check |
| Rank Foundation | 0 / 3 | Pebble grants and the Time to Shine placements; check |
| Pears Foundation | 0 / 1 | mostly invitation; check |
| Lankelly Chase | 0 / 1 | wound down; skip |
| Garfield Weston | 1 / 4 | one general row; the Weston Culture Fund and any dated strand missing |
| Henry Smith | 4 / 12 | the Improving Lives and Strengthening Communities strands are the mid-size ones; check they are live |
| Esmée Fairbairn | 7 / 8 | good |
| Paul Hamlyn | 4 / 6 | check the open strands: Ideas and Pioneers, Arts Access and Participation |
| John Ellerman | 1 / 1 | the one row says up to £60,000; fine |
| Trust for London | 2 / 2 | check the current funding guidelines for named strands |
| Wolfson | 1 / 4 | capital only live; check the others |
| Clothworkers | 3 / 6 | good |
| Mercers | 2 / 2 | good |

Not held at all: Clore Duffield, Sobell Foundation, Peter Cundill,
Segelman Trust, Leverhulme (research; probably out), Julia and Hans
Rausing Trust, Tuixen Foundation, Persula Foundation, Lord Leverhulme,
Batchworth Trust, Monument Trust (closed), Garrick Charitable Trust,
Radcliffe Trust, Ballinger Charitable Trust, Millfield House Foundation,
Sir George Martin Trust, Liz and Terry Bramall Foundation, Charles Plater
Trust, Emmandjay, Jane Hodge Foundation, Haberdashers, Vintners,
Berkeley Foundation, Taylor Wimpey, Bellway, Barratt, Kier, Balfour Beatty,
Enovert, WREN and FCC Communities Foundation (landfill funds; capital,
£25k to £100k, region-restricted), Tarmac, Ibstock Enterprise, Cory
Environmental Trust.

## The job in one sentence

Stage up to 50 rows hidden for review: grants a UK charity, CIC or social
enterprise with income £100,000 to £1 million could apply to today,
rolling, or dated within 30 days, whose stated ceiling is £25,000 or more,
that the catalogue does not hold as a live, correctly described row.

**Target: 30 to 50 staged.** Paul reviews and publishes.

## Where to look, in yield order

1. **The held-but-off funders in the table above.** Each is one page
   read. Three outcomes: the fund is open again (note `reopen` with the id
   and date, no new row); the funder now runs a different named programme
   (stage it); the funder has stopped (note `closed` with the evidence so
   it is not looked at again). Lloyds, Henry Smith, Garfield Weston, Paul
   Hamlyn and Rank are the five most likely to yield.
2. **Strands of held funders.** A funder held as one "Grants" row often
   runs three or four named programmes with different ceilings and dates.
   Each open strand with its own page, criteria and deadline is its own row
   (the Waterloo and Oak rows from 23 September are the pattern). Check
   Esmée Fairbairn, Henry Smith, Paul Hamlyn, Garfield Weston, Wolfson,
   Baring, Rank, Nationwide, National Lottery Community Fund (23 live of
   28; Reaching Communities and Partnerships held), Comic Relief (3 of 9),
   Barrow Cadbury, Joseph Rowntree, Postcode (5 of 11).
3. **The not-held family trusts** listed above, in that order. Most are on
   the Association of Charitable Foundations' member list and the 360Giving
   GrantNav top 100 by grants made; read each funder's own site. A trust
   that says "we do not accept unsolicited applications" is rejected with
   that reason, not staged as invite-only, unless it publishes a route in.
4. **Livery companies and City charities.** Haberdashers, Vintners,
   Fishmongers (off), Grocers (off), Skinners (off), Ironmongers (off),
   Leathersellers (off), Goldsmiths (off), Drapers (1 of 2), Cripplegate
   (off). Several of these are London-only and belong to the borough batch
   if found there first; dedup against that batch's results file.
5. **Landfill and infrastructure community funds.** FCC Communities
   Foundation, Enovert, Veolia (held), Biffa (off), Suez (off), Tarmac,
   Cory. Capital grants of £25,000 to £100,000 within a radius of a site.
   `location_tag` is the region or county the fund names, or "Selected
   areas" where it is a list of sites.
6. **Corporate foundations with mid-size strands.** Aviva (held), Barclays
   (held), NatWest (off), Santander (off), John Lewis (off), Co-op (off),
   Virgin Money (held), Bank of Scotland (held), Yorkshire, Skipton and
   Leeds building societies (off), Greggs (off), Asda (1 of 6), Tesco
   (2 of 8). Check each for the current open programme; many run one
   dated round a year.

Dedup first: by funder name AND normalised apply URL, against all 2,181
rows, count asserted before any comparison. The results file records held,
staged, reopened, closed or rejected for every candidate, with the reason.

## Rules that decide edge cases

- The ceiling test is on what one applicant can receive, stated on the
  page. "Grants of £25,000 to £100,000" qualifies. "We made grants
  totalling £2m" does not; stage the row only if some other stated figure
  clears £25,000, else stage it with `amount_undisclosed: true` and no
  numbers.
- Multi-year: record the total and say "over three years" in
  `typical_award`. `amount_max` is the total, not the annual figure, and
  the brief says which.
- A funder that reads applications only from organisations it has
  invited, with no published route in, is rejected. A published letter of
  inquiry or expression of interest is a route in and the row is staged
  with the route described in `how_to_apply`.
- Income limits go in `min_org_income` and `max_org_income` where the page
  states them. Many of these funders cap at £1m, £2m or £5m and some floor
  at £100k; the matcher reads both.
- `funding_subtypes` from the page: `core_costs`, `multi_year`,
  `unrestricted`, `capital`, `project`. Unrestricted and core are what the
  heartland orgs are searching for; do not guess them.
- The three tests from the Scotland brief: who can apply is stated, what
  for is stated, open now or dated within 30 days.
- `location_tag` is "UK" for a UK-wide fund, or the nations it names, or
  "England & Wales" style; never the funder's office town.
- `eligible_structures` from the page. Most trusts say "registered
  charities"; include CICs only when the page admits them, and say so in
  `who_can_apply`.

## Staging

As `scripts/international-discovery-stage-2026-09-23.ts`: `stampNewGrant`,
source `system:mid-size-trusts-2026-09-24`, `is_active: false`,
`pipeline_state: 'tagged_awaiting_review'`, `funder_brief` with `source:
'live_fetch'` and a citation for every figure. Never `admin:` on a staged
row. Results file `docs/handoffs/mid-size-trusts-results-2026-09-24.json`,
one entry per candidate looked at, staged or not, with the reason.

Before staging, run the scorer (`loadAdminDb`, `grants_with_funder`,
`normaliseScrapedGrant`, `computeMatchScore`) against six heartland orgs:
Institute of Imagination (Newham), Learning with Parents (Bristol), Mizen
Foundation, Common Ground Kitchen CIC (Manchester), Mercury Theatre
(Colchester), Bikeworks CIC. Ids are in the organisations table by name;
where a name appears twice use the row with an income band set. Each
staged row's score for them goes in the results file. A row counts as a
new match only at 55 or more.

## Budget

No Anthropic spend from the session: pages by fetch or the keyless reader
proxy (about 20 a minute; walled hosts are listed for Paul's browser).
Briefs written by hand from the page. The overnight verify read (production
key) stamps `_page_read` on staged rows; that is the only model cost, about
50 reads at about a penny each, approved by Paul on 24 September when he
commissioned the brief. No Vercel build: staging is a database write. Do
not commit or push anything to `main`; commit the results file and any
script to a branch `discovery/mid-size-trusts-2026-09-24`.

## What Paul decides

Publish or reject every row. Whether a funder marked `closed` should have
its held rows archived.

## When it is done

Report: staged N of M looked at; held rows marked `reopen` (count and
ids) and `closed` (names); how many staged rows have a stated ceiling of
£25,000 or more (the number this batch exists for); for each of the six
orgs, how many staged rows score 55+; the rejected, grouped (invitation
only, closed, under £25k, wrong applicant, bot wall). Under 300 words; the
detail is in the results file.
