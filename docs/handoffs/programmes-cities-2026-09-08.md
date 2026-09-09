# Handoff: city programmes in six cities

Written 2026-09-08 by the orchestrating session (grant-tracker-be) for one
other session to run. Read `CLAUDE.md` first, all of it. Then
`docs/handoffs/programmes-2026-09-07.md`, which this brief narrows rather than
replaces: its four tests, its staging shape, its results shape and its rules
all apply here word for word. Then this.

## The job in one sentence

Find programmes that a UK charity, CIC or social enterprise can apply to in
Brighton, London, Bristol, Manchester, Edinburgh and Glasgow, anchored in
those cities rather than national schemes, and stage each one hidden for Paul
to review with the page that says who can apply and what they get.

Nothing goes live. Launch is Thursday and the freeze means every publish is
Paul's click from the review queue, each time.

## The gap, measured today

Non-grant rows are the catalogue's differentiator. There are **112 live**: 18
`programme`, 48 `in_kind`, 46 `investment`. Against that, 58 of them are
tagged `UK` and almost none are tagged to a city:

| city | live non-grant rows | live grants |
|---|---:|---:|
| London | 3 | 26 |
| Manchester (incl. Greater Manchester) | 1 | 7 |
| Brighton | 0 | 5 |
| Bristol | 0 | 2 |
| Edinburgh | 0 | 0 |
| Glasgow | 0 | 2 |

Five of the six cities carry no city-level programme at all, and Edinburgh has
nothing of any kind. That is the gap this job exists to close.

**Target: 40 staged candidates**, spread across the six cities, roughly six to
eight each rather than thirty from London. Stop at 40, or when the source list
below is worked through, whichever comes first.

## Budget: one session, sequential, no fan-out

This is the rule Paul set for this job and it overrides any instinct to go
faster.

1. **Do not launch subagents.** No Agent or Task calls, no Workflow, no
   parallel research fleet. One session, working the city list in order. A
   dozen agents reading the same council websites is how a cheap job becomes an
   expensive one.
2. **At most two page reads per candidate**: the programme's own page, plus one
   linked eligibility or guidance page if the first is silent. If you cannot
   find the programme page within two hops from a lead, report it as
   `not_found` and move on. Do not crawl a site.
3. **One web search per source lead, not per candidate.** Search to find the
   provider's programme list, then read from that list. Re-searching the same
   provider in different words is the loop to avoid.
4. **No Anthropic API spend at all.** No `@anthropic-ai/sdk`, no
   `/api/admin/enrich-grant`, nothing touching `api.anthropic.com`. Read pages
   with node's fetch and a browser user agent; a 403, a bot interstitial or an
   empty body is `unreadable`, not "no programme". The Chrome browser tools are
   the fallback, and no third-party reader proxy.
5. **Batches of ten.** Dry run, `npx tsc --noEmit`, commit, push, then message
   grant-tracker-be with the batch's counts before starting the next. If a
   batch yields under three candidates, say so and stop rather than pressing on
   through a dry seam.

## What counts as a city programme

The four tests from the programmes brief are the bar, unchanged: open to
organisations, open or opening on a stated date, gives something, and the page
says who can apply. A candidate failing any of them is reported, not staged.

On top of those, one test specific to this job:

**The programme has to be anchored in the city.** Either it is only open to
organisations in that city or region, or it is a national programme with a
named local cohort, hub or round that a local organisation applies to
separately. A UK-wide programme that happens to have London participants is
already covered by the 58 rows tagged `UK`, and staging it again as a London
row is a duplicate in everything but the tag.

Shapes that usually pass: council and combined-authority enterprise or
voluntary-sector support programmes, local social enterprise networks running
cohorts, university and city innovation hubs with a social venture track,
community foundation non-grant offers, local capacity-building and
digital-inclusion programmes, city-level social investment readiness schemes,
pro bono panels run by local firms.

Shapes that usually fail: a membership body (gives nothing), a business
directory, a conference, a consultancy selling a service, a programme for
individual founders or students with no route for the organisation, and a
"register your interest" page with no round and no date.

## Where to look, city by city

Every name below is a **lead to verify, not a fact**. Some will have closed,
some will turn out to be individuals-only, and some will not exist in the shape
the name suggests. Confirm each on the provider's own page, read today, and
report the ones that fail with the sentence that failed them.

- **All six cities:** the city council's own grants and business support pages,
  the local council for voluntary service, the local community foundation's
  non-grant offers, and the nearest university's enterprise or social venture
  hub.
- **Brighton:** Sussex Community Foundation beyond its grants, Brighton and
  Hove City Council, the local CVS, Plus X Innovation, the universities'
  enterprise support.
- **London:** London Plus, Cripplegate and the other borough-anchored
  foundations' non-grant work, Impact Hub locations, UnLtd's London cohorts,
  the City bodies' pro bono panels, borough council enterprise programmes.
  London is over-represented in the catalogue already, so hold it to the
  city-anchor test hardest.
- **Bristol:** Voscur, Bristol City Council, Bristol and Bath Regional Capital,
  SETsquared, the West of England Combined Authority.
- **Manchester:** GMCVO, Greater Manchester Combined Authority, the Growth
  Company, Manchester City Council, the universities' social enterprise work.
- **Edinburgh and Glasgow:** SCVO, Firstport, Social Enterprise Academy,
  Business Gateway, Scottish Enterprise, the city-level social enterprise
  networks, Edinburgh and Glasgow city councils. Scotland is the thinnest of
  the six for non-grant rows and the most likely to pay.

Existing catalogue providers often run more than one programme, and a second
programme from a provider we already carry is cheaper to verify than a new
provider. Check what we hold for each city before searching outward.

## Dedup before drafting, in SQL

The CLAUDE.md rule: dedup is enforced in SQL before staging JSON is drafted. A
duplicate costs Paul a review and can split a user's pipeline. Check by host,
by title words and by funder, against the whole table and not only the live
rows, because a match that is archived or rejected is `already_held` and Paul
decides whether it returns.

```sql
select id, title, funder, funding_type, is_active, pipeline_state
from scraped_grants
where apply_url ilike '%<host>%' or title ilike '%<distinctive word>%' or funder ilike '%<funder>%';
```

The baseline of every non-grant row the catalogue has ever held is
`docs/handoffs/programme-rows-2026-09-07.json`.

## How a row is staged

Exactly as the programmes brief says: `stampNewGrant` in the shape of
`scripts/newsletter-batch-2026-09-04.ts`, `is_active: false`,
`pipeline_state: 'tagged_awaiting_review'`, source
`system:programmes-cities-2026-09-08` (trust 50, so a Re-enrich in review can
still overwrite). Never `admin:`, never `user_verified:` on a row nobody has
reviewed.

Two fields matter more than usual in this job:

- **`location_tag`** takes the city, matching the strings already in use:
  `London`, `Bristol`, `Manchester`, `Greater Manchester`, `Brighton and Hove`,
  `Edinburgh`, `Glasgow`. Use the existing string, not a new spelling. Where the
  programme covers a region rather than the city, tag the region and say so.
- **`is_local: true`** for anything city or region bound. This is what makes
  the row findable for a local fundraiser rather than lost among the 239 rows
  tagged `UK`.

`funding_type` is one of `programme`, `in_kind`, `investment`, with
`funding_subtypes` from `src/lib/funding-subtypes.ts` (`accelerator`,
`incubator`, `support_programme`, `training`, `fellowship`, `cohort_grant`,
`includes_grant`, and for in-kind `pro_bono_consulting`, `mentoring`,
`office_space` and the rest). Amounts only where a per-applicant figure is
stated, per the amounts brief: a programme's total budget is not an award.
Eligibility is never omitted where the page states it.

## Results file

`docs/handoffs/programmes-cities-results-2026-09-08.json`, in the programmes
brief's shape, with the city on every entry:

```json
{ "batch": 1,
  "staged": [{ "id": "…", "title": "…", "city": "Bristol", "funding_type": "programme", "url": "…" }],
  "report": [{ "title": "…", "city": "…", "url": "…",
               "why": "already_held|not_city_anchored|individuals_only|no_open_route|gives_nothing|eligibility_unstated|unreadable|not_found",
               "quote": "…", "held_id": "…" }] }
```

Close with a summary carrying the staged count per city, the live non-grant
count before and after, and any city that came up dry with what you tried.

## What grant-tracker-be checks afterwards

A sample of staged rows re-read against the four tests plus the city-anchor
test; the staged count re-derived in SQL; a dedup query over every staged title
and host against the whole table; and confirmation that no staged row is active
and none carries an `admin:` or `user_verified:` source. Anything failing the
audience test is rejected before Paul sees it.
