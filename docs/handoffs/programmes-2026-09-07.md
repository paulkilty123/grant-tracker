# Handoff: programmes discovery

Written 2026-09-07 by the orchestrating session for an Opus 5 session to run.
Read `CLAUDE.md` first, all of it, then the timing and amounts briefs in this
folder and their results files: every rule and trap there applies. Then this.

## The job in one sentence

Find programmes that a UK charity, CIC or social enterprise can apply to and
that the catalogue does not yet carry, and stage each one hidden for Paul to
review, with the page that describes who can apply and what they get.

A programme here means something a fundraiser applies to that is not a plain
grant: training and leadership schemes, accelerators and incubators, cohort
programmes with a grant, prize or investment attached (Visa CatalyseHer is the
shape), fellowships for organisations, pro bono and in-kind offers with an
application route, match-trading and investment-readiness schemes, social
investment funds that take open applications. `funding_type` is one of
`programme`, `in_kind`, `investment`; `funding_subtypes` says which kind.
The vocabulary is in `src/lib/classify.ts`.

Non-grant rows are the catalogue's differentiator and there are 114 live. The
baseline of every non-grant row the catalogue has ever held, live or not, is
`docs/handoffs/programme-rows-2026-09-07.json`. A candidate that matches one
of those by funder and programme name is not new, even if the old row is
rejected or archived: report it as `already_held` with the old row's id and
state, and Paul decides whether it comes back.

## The bar a candidate has to clear

State it as a sentence about the user: "a fundraiser at a UK charity, CIC or
social enterprise landing on this page could apply, today or on a stated
date, and would get something worth applying for." Four tests, all four:

1. **Open to organisations.** A programme for individual founders, students,
   artists or young people, with no route for the organisation, is out
   (SWEF, Andy Fanshawe, Family Fund all came off live this week for this).
   Women-founder or under-represented-founder programmes are IN when the
   applicant is a registered business or social enterprise, as CatalyseHer is.
2. **Open, or opening on a stated date.** Invitation only, nomination only,
   "we do not accept unsolicited applications", or a cohort with no next date
   is out. Report it as `no_open_route` with the sentence.
3. **Gives something.** Training, money, investment, mentoring, free services,
   a place on a cohort. A directory, a membership body, a conference, a
   consultancy selling a service, or a page asking the reader to GIVE (the
   Donate Computers case) is out.
4. **The page says who can apply.** If nothing on the funder's site states
   eligibility, the candidate is not ready to stage; report it as
   `eligibility_unstated` with the URL, and Paul can decide to chase it.

A candidate that fails any test is reported, not staged. When unsure, report.

## Where to look

Work from sources, not from memory. Every candidate needs the programme's own
page on the provider's site, read today. Places that list programmes:

- the providers already in the catalogue: many run more than one programme
  (School for Social Entrepreneurs, UnLtd, Social Enterprise UK, the Big
  Issue group, Power to Change, Access Foundation, Big Society Capital's
  investees, the community foundations' non-grant offers)
- corporate foundations with skills or pro bono programmes (the banks, the
  big four, law firms, the telcos and tech firms)
- the national infrastructure bodies for the sector and the nations (NCVO,
  SCVO, WCVA, NICVA, Locality, NAVCA, Clinks, Homeless Link, Youth Sector
  bodies, the arts councils' development programmes)
- university and council enterprise hubs with a social enterprise track
- funders' own "beyond grants" pages: capacity building, leadership, digital

`WebSearch` is allowed for finding candidates; the provider's page is what
gets cited. No Anthropic API spend: no `@anthropic-ai/sdk`, no
`/api/admin/enrich-grant`. Read pages with node's fetch and a browser user
agent; a 403 or an empty body is `unreadable`, not "no programme".

Aim for breadth across regions and sectors rather than depth in one place:
regional coverage outside London, Scotland, Suffolk and Sussex is thin, and
the whole catalogue leans on the arts, youth and environment.

## Dedup before drafting

Before writing a candidate into a staging script, check it in SQL against the
whole table, not only the baseline file: by `apply_url` host and path, and by
title words against `title` and `funder`. The rule from CLAUDE.md is that
dedup is enforced in SQL before staging JSON is drafted, because a duplicate
row costs Paul a review and can split a user's pipeline.

```sql
select id, title, funder, funding_type, is_active, pipeline_state
from scraped_grants
where apply_url ilike '%<host>%' or title ilike '%<distinctive word>%' or funder ilike '%<funder>%';
```

## How a row is staged

Follow `scripts/newsletter-batch-2026-09-04.ts` exactly: `stampNewGrant` with
a `system:programmes-2026-09-07` source, `is_active: false`,
`pipeline_state: 'tagged_awaiting_review'`. Tracked fields written at
`system:` trust so a Re-enrich in review can still overwrite them. Never
`admin:`, never `user_verified:` on a staged row: nobody has reviewed it yet.

Each staged row carries: `title` (provider and programme, in the catalogue's
own words, no dashes), `funder`, `funder_type`, `funding_type`,
`funding_subtypes`, `apply_url` (the programme's own page, not the provider's
homepage), `location_tag` and `is_local`, `eligible_structures` only where the
page names legal forms (otherwise leave it for the review gate), `deadline`
or `is_rolling` or `next_open_date` per the timing brief's four states,
`amount_min`/`amount_max` only for a per-applicant figure per the amounts
brief, `impact_sectors`, `target_beneficiaries`, `description` (two or three
plain sentences), and a `funder_brief` with `who_can_apply`, `what_they_fund`,
`how_to_apply`, `exclusions` where the page states them, and `_citations`
with a verbatim quote and `source_url` for every field that came from the
page. Eligibility is never omitted where the page states it.

One script per batch, `scripts/programmes-batch-NN-2026-09-07.ts`, dry run
by default, `--apply` to stage. Batches of ten candidates. After each batch,
print the count of `tagged_awaiting_review` rows with this source and check
it equals the rows staged so far.

## Results file

`docs/handoffs/programme-results-2026-09-07.json`, a dict with `batches` and
a closing `summary`:

```json
{ "batch": 1,
  "staged": [{ "id": "…", "title": "…", "funding_type": "…", "url": "…" }],
  "report": [{ "title": "…", "url": "…", "why": "already_held|individuals_only|no_open_route|gives_nothing|eligibility_unstated|unreadable", "quote": "…", "held_id": "…" }] }
```

## What the orchestrating session checks afterwards

A sample of staged rows re-read against their pages for the four tests; the
staged count re-derived; a dedup query over the staged titles and hosts
against the whole table. Anything that fails the audience test is rejected
before Paul sees it. Paul activates from the review queue; nothing in this
job goes live.

Stop after 60 candidates have been staged or the sources run dry, whichever
comes first, and send the totals with the summary.
