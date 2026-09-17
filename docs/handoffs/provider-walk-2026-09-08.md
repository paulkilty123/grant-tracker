# Handoff: walk the 44 programme providers

Written 2026-09-08 by the orchestrating session (grant-tracker-be).
**Post-launch work. Do not start before Paul says so.**

Read `CLAUDE.md` first, all of it, then `programmes-cohorts-2026-09-08.md` and
`programmes-2026-09-07.md` for the staging shape and the qualifying tests.
Every rule in those applies here. Then this.

## Why this job exists

Two briefs of discovery searching produced one new programme row. Twenty-two
of twenty-two banks, corporates and tech providers were already held. The
provider layer is close to exhausted, so searching outward has stopped paying.

What has not been done is looking properly at the providers we already hold.
Firstport was one row standing in front of five separately paged funds, and
that one row was wrong about both its audience and its amount. Fixing it added
four funds in an afternoon with no discovery at all.

This job repeats that for the other 43 providers. It cannot come back empty,
because the to-do list is the catalogue's own contents.

## The job in one sentence

For each provider below, open its own funding page, list every fund and
programme it runs, and reconcile that list against the rows we hold: relink
the front-door rows, stage the funds we are missing, and report the rows that
should not be live.

## The ruling on one row or many

**Paul, 8 September: one row per programme, and solve crowding in the display
rather than in the data.**

A programme gets its own row when it has its own page and its own deadline,
eligibility or amount. That is the default and it will be almost every case.

A single provider row is right only when the provider runs one continuously
open offer, with one route and one eligibility and no rounds.

The reasoning, so you can apply it to edge cases. A row that stands for
several funds has to average their fields, and the average is wrong for every
one of them: Firstport's row said £5,000 to £25,000 where its fund gives up to
£5,000, and said social enterprises where the fund is for individuals. Beyond
that, a saved row carries one deadline into the user's pipeline and one amount
into the matcher, and a grouped row has neither. The community foundation
convention already works this way.

Do not group rows to keep the catalogue tidy. If one provider crowds the
results, that is a display job for the funders table and the Find Funding
grouping, not a reason to lose information here.

## The providers

Priority order. Work down it and stop when Paul says or the list ends.

**Tier one, front-door rows over several funds.** These are the Firstport
shape: a row whose `apply_url` is a funding index, with more funds behind it
than we carry. Highest yield, do these first.

| provider | rows | live | index-style urls |
|---|---:|---:|---:|
| Key Fund | 13 | 6 | 6 |
| School for Social Entrepreneurs | 13 | 4 | 1 |
| Social Investment Business | 8 | 3 | 2 |
| Ufi VocTech Trust | 7 | 0 | 1 |
| Lloyds Bank Foundation (both name forms) | 11 | 1 | 6 |
| Power to Change | 4 | 0 | 1 |
| Rank Foundation | 3 | 0 | 1 |
| Fredericks Foundation | 3 | 2 | 1 |
| Bethnal Green Ventures | 3 | 1 | 1 |

**Tier two, providers with nothing live at all.** We hold them and a
fundraiser cannot see any of it. Find out whether that is right.

UnLtd (7 rows), Ufi VocTech Trust (7), Power to Change (4), Social Business
Trust (3), Rank Foundation (3), Bridges Fund Management (2), Better Society
Capital (2), Unity Trust Bank (2), Impetus (2), Social Finance (2), TERN (2),
Access Foundation (2 of its 5).

UnLtd is the striking one: seven rows, none live, and it is one of the
best-known providers in the sector.

**Tier three, the rest.** Big Issue Invest (8 rows), Resonance (5), Charity
Bank (4), Microsoft (4), LawWorks (3), Triodos (3), Amazon Web Services (3),
Charity Digital (3), CAST (3), Pro Bono Economics (2), NCVO (2), The Law
Society (2), Pilotlight (2), Reach Volunteering (2), TechSoup UK (2).

**Out of scope for this job.** Two Ridings Community Foundation and Foundation
Scotland are community foundations and follow their own settled convention;
leave them. Arts Council of Wales and Creative Scotland are large grant-makers
with their own indexes and are a separate job, not this one. The Greater
London Authority rows are already with Paul as holds.

**One trap in the list.** The "Zoom" row and one TechSoup row both point at
`techsoup.uk/partners`, which the verdicts job on 7 September found to be an
empty shell that returns a 200. Do not treat that page as evidence of
anything.

## Name variants to merge as you go

Four providers appear twice under different spellings. Merge them onto one
name as part of the work, and say in the results which name you kept.

- School for Social Entrepreneurs / School for Social Entrepreneurs (SSE)
- Social Investment Business / Social Investment Business (SIB)
- Lloyds Bank Foundation / Lloyds Bank Foundation for England and Wales
- Access — The Foundation for Social Investment / Access – The Foundation for
  Social Investment (these differ only by em dash versus en dash)

## What to do for each provider

1. **Open the provider's own funding or programmes page.** Not a directory,
   not a news item. List every fund it currently runs, with each fund's own
   URL.
2. **Pull our rows for that provider in SQL**, including archived and rejected
   ones, before deciding anything.
3. **Reconcile the two lists.** Four outcomes per fund, all recorded:
   - **relink**: we hold the fund but point at an index or the wrong page.
     Correct `apply_url` and the fields that page contradicts.
   - **stage**: the provider runs it, we do not hold it. Stage hidden, with a
     full brief from the page, for Paul's review.
   - **already correct**: we hold it and it points at its own page. Say so and
     move on.
   - **report**: we hold it and the page says it should not be live. Do not
     change state, that is Paul's.
4. **Check the rows that have no fund.** A row for a fund the provider no
   longer lists is either finished or renamed. Report it either way with the
   sentence that shows it.

## Rules that are not optional

1. **Nothing changes state.** No `is_active`, no `pipeline_state`, no
   `rejection_reason`. Staged rows are `is_active: false`,
   `pipeline_state: 'tagged_awaiting_review'`, source
   `system:provider-walk-2026-09-08` at trust 50. Never `admin:`, never
   `user_verified:` on a row nobody has reviewed. A relink to a page you read
   today is `user_verified:provider-walk-2026-09-08`.
2. **A quote comes only from page text you fetched in this session.** Not a
   search summary, not a proxy render, not a news line. And before concluding
   a page does not say something, prove your buffer holds the whole page: a
   truncated read reports true text as absent, which caught two sessions on
   8 September.
3. **Type by what the applicant receives**, never by what moves a count. A
   page that says it gives grants is `funding_type: 'grant'` even when the
   provider calls it a programme. Find Funding splits the tabs.
4. **`is_local` is true for anything geographically restricted**, nations
   included.
5. **Dedup by provider before by fund**, against the whole table including
   archived and rejected rows. That is the lesson this whole job rests on.
6. **Admin-held fields are reported, not overwritten.** If the page
   contradicts a pin, that is a hold for Paul with both sentences.
7. **No Anthropic API spend.** Fetch with node and a browser user agent, then
   the Chrome browser, then `unreadable`. No third-party reader proxy.
8. **One session, sequential, no subagents and no fan-out.** Two page reads
   per fund, two hops maximum, one search per provider.
9. **Dry run, `npx tsc --noEmit`, commit per provider batch**, push, and
   message grant-tracker-be with counts before the next batch.

## Results file

`docs/handoffs/provider-walk-results-2026-09-08.json`, one block per provider:

```json
{ "provider": "Key Fund",
  "funding_page": "…",
  "funds_on_page": 7,
  "rows_held": 13,
  "outcomes": [
    { "fund": "…", "url": "…", "action": "relink|stage|already_correct|report",
      "id": "…", "quote": "…", "note": "…" }
  ],
  "rows_with_no_fund": [{ "id": "…", "title": "…", "why": "…", "quote": "…" }],
  "name_merged_to": "School for Social Entrepreneurs" }
```

Close with a summary: providers walked, funds found, rows relinked, rows
staged, rows reported, and the live non-grant count before and after.

## What grant-tracker-be checks afterwards

Every relinked URL opened and tested against the front-door rule; a sample of
staged rows re-read against the qualifying tests; every quote checked against
the page it names; the dedup query re-run over staged titles and hosts; and
confirmation that no row's `is_active` or `pipeline_state` changed.
