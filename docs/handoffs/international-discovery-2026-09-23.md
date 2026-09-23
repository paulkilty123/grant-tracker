# Handoff: international development funders, 23 September 2026

Written 2026-09-23 by the orchestrating session, commissioned by Paul the
same afternoon ("run the brief") after Julia Krepska of Our Sansar wrote
that her results were all UK funders. Read `CLAUDE.md` first, all of it,
then `discovery-week-2026-09-22.md` for the budget, citation and staging
rules, which apply here unchanged. Then this.

## Why this job exists

Our Sansar (org id 9e7c5a10, registered charity, Brighton, income £250k to
£500k, target £10k to £70k) delivers in Nepal: freeing children from child
labour and trafficking, a safe house for girls, shelter and education.
Sectors international, education, women, young people; beneficiaries
children, women and girls, people in poverty. Her trial runs to 8 October.

The matcher was fixed this morning (commit fe794511) so UK-only funds now
sit at 44 for her. What is left at the top is thin: the catalogue holds 17
international-tagged rows and most are global in-kind tools (Canva, Zoom,
Slack, Google Ad Grants). The real overseas funders it holds are Allan &
Nesta Ferguson, Comic Relief International Development, Network for Social
Change, Sigrid Rausing (invitation only) and The Maypole Fund. Tibet Watch
and Oxfam GB have the same shape and the same gap.

## The job in one sentence

Stage up to 25 rows hidden for review by Friday 26 September: UK-registered
charities' funders that fund development, child protection, anti-trafficking,
girls' education or livelihoods work delivered overseas, with South Asia and
Nepal first, every one open today, rolling, or dated within 30 days, that the
catalogue does not hold.

**Target: 20 to 25 staged.** Paul reviews and publishes over the weekend.

## Where to look, in yield order

1. **UK trusts that fund overseas work by UK charities.** Check each against
   the catalogue by funder name AND apply URL before drafting; several may be
   held under a UK-only programme with a separate international strand.
   Souter Charitable Trust, The Evan Cornish Foundation, Marr-Munning Trust,
   The Beatrice Laing Trust, Tudor Trust (paused?), The Allan Charitable
   Trust, Charles Hayward Foundation (Overseas), The Waterloo Foundation
   (World Development strand; "UK & Global" row exists, check whether it is
   the whole foundation or one programme), The Ashden Trust, Sir Halley
   Stewart (held, projects may be international; no row needed), The
   Hilden Charitable Fund (overseas), The Fulmer Charitable Trust, The
   Zochonis Charitable Trust, The Gilchrist Educational Trust, The Lorimer
   Trust, The Sylvia Adams Charitable Trust (children under 5, overseas),
   The Jephcott Charitable Trust, The Rufford Foundation (conservation
   only; skip unless Nepal-relevant), The Bryan Guinness Charitable Trust,
   The Ericson Trust, The Anglo-Nepalese trusts if any exist (Britain Nepal
   Medical Trust is a delivery charity, not a funder).
2. **Child protection and anti-trafficking funders.** Freedom Fund (grants
   to frontline organisations; check whether UK charities delivering abroad
   can apply), Comic Relief strands beyond International Development, BBC
   Children in Need is UK-only (skip), The Big Give Christmas Challenge
   (match funding, dated opening: record the date), Global Fund for
   Children, Oak Foundation (invitation?), Stars Foundation (closed?),
   Fondation Botnar (Nepal is not a focus country; skip unless open).
3. **Girls' education and women's funds open to UK-registered applicants.**
   Malala Fund (invitation?), Global Fund for Women, Mama Cash, With and
   For Girls (Purposeful), Foundation for a Just Society, EMpower.
4. **UK government and multilateral small grants.** FCDO Small Charities
   Challenge Fund (closed since 2021, check), UK Aid Match (dated rounds;
   record the date), Nepal-specific: the British Embassy Kathmandu has no
   open fund; skip unless found.
5. **In-kind for overseas delivery** only if genuinely new: Cranfield
   Trust and Reach are held.

Dedup first. For each candidate funder, the results file records held,
staged, or rejected with the reason.

## Rules that decide edge cases

- The applicant must be a UK-registered charity, CIC or social enterprise.
  A funder that takes applications only from organisations registered in
  the country of delivery is out of scope: record it as such so it is not
  looked at again.
- Invitation-only funders are staged with `invite_only: true` if that
  column exists on the row; otherwise rejected with the reason. The search
  page hides invite-only rows since 22 Sept.
- The three tests from the Scotland brief: who can apply is stated, what
  for is stated, open now or dated within 30 days.
- Amounts only where the page states a per-applicant figure. A pot, a
  "total of", match funding and money raised are not awards.
- Tags: `international` is the first sector on every row here. The
  beneficiary list is who the money is for (children, women and girls,
  people in poverty), `general_public` first only for open funds.
- `location_tag`: use `International` for a fund that pays for work
  abroad, never `UK`, even when the applicant must be UK-registered. The
  matcher reads International, Global and Worldwide as the lift.
- `eligible_structures` from the page. Most of these funders say
  "registered charities"; include CICs only when the page admits them.

## Staging

As `scripts/lipman-miliband-stage-2026-09-17.ts`: `stampNewGrant`, source
`system:international-discovery-2026-09-23`, `is_active: false`,
`pipeline_state: 'tagged_awaiting_review'`, `funder_brief` with
`source: 'live_fetch'` and a citation for every figure. Never `admin:` on a
staged row. Results file
`docs/handoffs/international-discovery-results-2026-09-23.json`, one entry
per candidate looked at, staged or not, with the reason.

Before staging, run the scorer (`loadAdminDb`, `grants_with_funder`,
`normaliseScrapedGrant`, `computeMatchScore`) against Our Sansar, Tibet
Watch (id prefix from the organisations table) and Oxfam GB so each staged
row's score for them is in the results file. A row counts as a new match
only at 55 or more.

## Budget

No Anthropic spend from the session: pages by fetch or the keyless reader
proxy (about 20 a minute; Cloudflare-walled hosts are listed for Paul's
browser). Briefs written by hand from the page. The overnight verify read
(production key) stamps `_page_read` on staged rows; that is the only model
cost, about 25 reads, and Paul approved it on 23 September. No Vercel
build: staging is a database write. Do not commit or push anything to
`main`; commit the results file and any script to a branch
`discovery/international-2026-09-23`.

## What Paul decides

Publish or reject every row.

## When it is done

Report: staged N of M looked at; for each of the three orgs, which staged
rows score 55+ (the measured number); the ones rejected and why, grouped
(wrong applicant, closed, invitation only, bot wall). Keep the report under
300 words; the detail is in the results file.
