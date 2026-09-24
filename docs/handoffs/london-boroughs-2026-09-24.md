# Handoff: London borough funds, 24 September 2026

Written 2026-09-24 by the orchestrating session, commissioned by Paul the
same evening ("ok can you write them please") after a gap review of the live
catalogue against the org profiles. Read `CLAUDE.md` first, all of it, then
`discovery-week-2026-09-22.md` for the budget, citation and staging rules,
which apply here unchanged. Then this.

## Why this job exists

19 of the 57 organisations on Shoots are in London, a third of everyone.
The live catalogue holds 714 rows and 59 of them are London-ish, 22 of
those tagged just "London". Measured on 24 September, live rows per
borough (by location tag, title or funder name):

| Live rows | Boroughs |
|---|---|
| 0 | Barnet, Brent, Bromley, Ealing, Greenwich, Haringey, Harrow, Havering, Hillingdon, Hounslow, Kensington and Chelsea, Lewisham, Newham, Sutton, Waltham Forest, Wandsworth |
| 1 | Barking and Dagenham, Bexley, Enfield, Kingston, Lambeth, Merton, Redbridge, Tower Hamlets, City of London |
| 2 | Croydon, Hackney, Hammersmith and Fulham, Islington, Richmond, Southwark |
| 4 | Camden, Westminster |

Sixteen boroughs have nothing. Several have rows that are off: Bromley
0 of 4, Greenwich 0 of 4, Hackney 2 of 12, Newham 0 of 3, Sutton 0 of 3,
Ealing 0 of 3. The London Community Foundation is 4 live of 22, City
Bridge 2 of 7, the Mayor of London 1 of 12. Some of those are closed
rounds that will come back on their own; some are dead rows that never
worked.

The London orgs this must serve, so each staged row is scored against
them: Asian Community Concern (Ealing, CIC, women and employment),
Institute of Imagination (Newham, charity, education and creative),
Bikeworks CIC (sport, health, environment), Paws and Pause (Southwark and
Lambeth, CIC, mental health), 2-3 Degrees (employment and education,
company limited by guarantee), Expert Impact, Blue Garage, Unicorn Theatre.
Ids are in the organisations table by name.

## The job in one sentence

Stage up to 60 rows hidden for review: borough-level funds a London
charity, CIC or social enterprise could apply to today, rolling, or dated
within 30 days, that the catalogue does not hold, starting with the
sixteen boroughs at zero.

**Target: 40 to 60 staged.** Paul reviews and publishes.

## Where to look, in yield order

1. **Borough giving schemes and place-based funds.** One per borough where
   it exists, each with its own open rounds: Hackney Giving (held, 1 live,
   check the rest), Islington Giving (held), Camden Giving (held), Lewisham
   Local, Ealing Giving (not held), Kensington and Chelsea Foundation (not
   held), Hammersmith United Charities (held), Wandsworth Grant Fund (held
   but off), Lambeth Wellbeing Fund (held but off), Merton Giving, Sutton
   Community Fund (off), Haringey Giving, Harrow Giving (off), Enfield
   Giving, Barnet Together, Newham Giving, Waltham Forest Giving, Greenwich
   Giving, Bexley Voluntary Service Council grants, Bromley Giving, Havering
   Giving. Not every borough has one; record "none found" so it is not
   looked at again.
2. **Council grant programmes.** Every borough council runs at least one:
   small grants, community grants, neighbourhood CIL (NCIL) funds, ward
   budgets, voluntary sector grants, cost of living funds. Search
   `<borough> council community grants`, `<borough> NCIL`, `<borough>
   voluntary sector grants`. Council pages are the ones most often
   bot-walled; list walled ones for Paul's browser rather than skipping.
3. **Borough-restricted endowed charities.** The old parish and city
   charities: United St Saviour's (Southwark), Southwark Charities, Peter
   Minet Trust (Lambeth and Southwark), Wakefield and Tetley Trust
   (Tower Hamlets, Southwark), Walcot Foundation (Lambeth; held but off),
   Cripplegate Foundation (Islington; held but off), Richmond Parish Lands
   (held), Hampstead Wells and Camden (held), Sir John Cass's Foundation,
   now the Portal Trust (held), Hyde Charitable Trust, Sir Halley Stewart
   (held), St Giles and St George (held), Westminster Foundation (held),
   Kensington and Chelsea Foundation, Hillingdon Community Trust, the
   Mercers' Company (held), the Hackney Parochial Charities, the Newham
   Community Foundation if it still exists, the Lewisham Education Fund.
4. **London-wide funders with borough-named strands.** London Community
   Foundation's named funds (22 rows held, 4 live: check each for its
   current status before adding; a fund that has come off because it closed
   comes back through the reopening cron, not a new row). City Bridge
   Foundation's current programmes (held 2 of 7). The Mayor of London and
   GLA funds (26 live of 84; skip unless a new open round is found).
   Foundation for Future London (Newham, Hackney, Tower Hamlets, Waltham
   Forest; not held). East End Community Foundation (held 2 of 9). Sport
   England and London Sport small grants (held). London Marathon
   Foundation (held).
5. **Housing association and developer community funds by estate or
   borough.** Peabody Community Foundation (held), L&Q Foundation, Notting
   Hill Genesis, Clarion Futures, Southern Housing, Berkeley Foundation
   (not held), Wates Family Enterprise Trust (off), Lendlease and the Elephant
   Park community fund, Battersea Power Station Foundation, King's Cross
   (Argent), Canary Wharf Group, Heathrow Community Fund (Hillingdon,
   Hounslow, Ealing), Gatwick is Sussex not London.

Dedup first: by funder name AND normalised apply URL, against all 2,181
rows, count asserted before any comparison. The results file records held,
staged, reopened or rejected for every candidate, with the reason.

## Rules that decide edge cases

- A held row that is off because the round closed is not a new row. Check
  whether the page now shows an open round or a dated one within 30 days:
  if so, note it in the results file as `reopen` with the id and the date,
  and do not stage a duplicate. Paul or the cron brings it back.
- A held row whose apply URL is dead and whose funder now has a working
  page is fixed in place (`apply_url`, `url_status: 'unchecked'`,
  `pipeline_state: 'tagged_awaiting_review'`, `is_active: false`), as the
  Hospital Saturday Fund was on 24 September. Not a new row.
- Ward budgets and councillor discretionary pots under £1,000 with no
  published process are out. A fund needs a page a fundraiser could apply
  from.
- `location_tag` is the borough name, spelled as the matcher's gazetteer
  has it: "Hammersmith and Fulham" not "Hammersmith & Fulham", "Kensington
  and Chelsea", "Richmond upon Thames", "Kingston upon Thames", "Barking and
  Dagenham", "Tower Hamlets", "City of London". A fund covering several
  boroughs lists them separated by commas, or "London" if it is all of them.
  Never "Greater London".
- The three tests from the Scotland brief: who can apply is stated, what
  for is stated, open now or dated within 30 days.
- Amounts only where the page states a per-applicant figure. A pot, a
  "total of", and a "we gave £X last year" are not awards.
- `eligible_structures` from the page. Most borough funds admit
  unincorporated groups; say so. Council NCIL funds often admit residents'
  associations and not-for-profit companies; read the page.
- Sectors and beneficiaries from what the fund says it is for, not from
  the borough's demographics.

## Staging

As `scripts/international-discovery-stage-2026-09-23.ts`: `stampNewGrant`,
source `system:london-boroughs-2026-09-24`, `is_active: false`,
`pipeline_state: 'tagged_awaiting_review'`, `funder_brief` with `source:
'live_fetch'` and a citation for every figure. Never `admin:` on a staged
row. Results file `docs/handoffs/london-boroughs-results-2026-09-24.json`,
one entry per candidate looked at, staged or not, with the reason.

Before staging, run the scorer (`getAdminDb` from `src/lib/admin/admin-db`, `grants_with_funder`,
`normaliseScrapedGrant`, `computeMatchScore`) against the eight London orgs
named above so each staged row's score for them is in the results file. A
row counts as a new match only at 55 or more. The point of this batch is
that number: if a borough fund scores under 55 for the org in that borough,
something is wrong with the tag and it is fixed before staging.

## Budget

No Anthropic spend from the session: pages by fetch or the keyless reader
proxy (about 20 a minute; walled hosts are listed for Paul's browser).
Briefs written by hand from the page. The overnight verify read (production
key) stamps `_page_read` on staged rows; that is the only model cost, about
60 reads at about a penny each, approved by Paul on 24 September when he
commissioned the brief. No Vercel build: staging is a database write. Do
not commit or push anything to `main`; commit the results file and any
script to a branch `discovery/london-boroughs-2026-09-24`.

## What Paul decides

Publish or reject every row. Whether to fix the off rows that need his
browser.

## When it is done

Report: staged N of M looked at; boroughs still at zero and why; held rows
marked `reopen` (count and ids); for each of the eight London orgs, how many
staged rows score 55+ (the measured number); the rejected, grouped (wrong
applicant, closed, no process, bot wall). Under 300 words; the detail is in
the results file.
