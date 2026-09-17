# Handoff: national funders for the four sectors the launch signups need

Written 2026-09-09 by the orchestrating session, commissioned by Paul the same
evening after a match test over the 26 launch-waitlist organisations. Read
`CLAUDE.md` first, all of it, then `programmes-cohorts-2026-09-08.md` for the
budget, citation and staging rules, which apply here unchanged. Then this.
The companion brief `regions-cf-2026-09-09.md` covers the geographic gaps;
do not stage a place-based fund from here.

## Why this job exists

Of 585 live rows, 383 are national. Counting national grant rows where the
sector is the main focus (two sectors at most, ignoring `community`):

| Sector | Focused national grant rows | Who is waiting |
|---|---|---|
| Older people | 1 (Rayne Foundation) | Men in Sheds Hull, Sue Ryder |
| Food and food poverty | 4 | FareShare South West |
| Employment and ex-offenders | 6 | The Suit Works, The Apex Project |
| Young people as the focus | 9 | Fresh Futures, IOI London, DofE, Bridlington Cricket Foundation |
| Disability | 10 | White Lodge Centre |

Two beneficiary groups are thin as well: ethnic minorities (28 rows name them)
for Become United, and LGBTQ (6) for Swansea Rainbow. Men's mental health has
one row that names men, for Men Walk Talk. Environment, creative, health,
justice and sport are well covered; stage nothing there.

## Revive before you stage

The gap is partly rows we already hold and have hidden. Query
`scraped_grants` where `is_active = false` for these funders before searching
anything, and for each one read the funder's page and report whether it is a
closed round (then `between_rounds_scheduled` with a `next_open_date` is the
fix, not a new row), a fund that ended, or a row that was wrongly hidden:

Lloyds Bank Foundation (6 rows, 0 live), Clothworkers Foundation (2, 0), John
Lewis Partnership Foundation (3, 0), Youth Futures Foundation (1, 0), Greggs
Foundation (1, 0), Baily Thomas Charitable Fund (2, 0), Pilgrim Trust (2, 0),
Walcot Foundation (1, 0), Edward Gostling Foundation (1, 0), Peter Harrison
Foundation (1, 0), Dunhill Medical Trust (1, 0), Rank Foundation (1, 0),
Esmée Fairbairn (1 of 6 hidden), Nesta (3, 0), Power to Change (2, 0: it
stopped funding, see `feedback_row_counts_are_not_a_provider_health_signal`,
so leave it).

A revived row counts toward the target. Reviving is a state change on a live
funder and needs its own line in the results file with the quote that
justifies it.

## The job in one sentence

Find national funders whose open programmes a UK charity, CIC or social
enterprise can apply to for work with older people, food and food poverty,
employment and ex-offenders, or young people, that the catalogue does not
hold, and stage each one hidden for review.

**Target: 25 staged or revived**, about six a sector. Stop there, or when
the list is worked through, or under the budget rule.

## Where to look, in order

Every name is a lead to verify, not a fact. Confirm on the funder's own page,
read today, and report what fails with the sentence that failed it.

**Older people.** Dunhill Medical Trust (revive first), Independent Age
grants, Abbeyfield, the Mercers' older people programme (held: one live row,
check for siblings), Hospital Saturday Fund, the Eranda Rothschild Foundation,
the Barchester Foundation, the Sobell Foundation, the Tudor Trust (held, one
live), Age UK's local grant schemes only if national, Nationwide Community
Grants if reopened (its foundation says no unsolicited applications; that is
a different body), Ageing Better's legacy funds, the Zurich Community Trust.

**Food and food poverty.** Trussell Trust grants to member food banks, Feeding
Britain, Asda Foundation's food programmes (one live row, check siblings),
FareShare's own membership offers are in-kind and held for Greater
Manchester only (stage the national one), the Bakerdays or Greggs Foundation
breakfast club funding (revive Greggs first), Sustain's grants, the Waitrose
Community Matters (revive John Lewis first), the Alexandra Rose Charity, the
Felix Project as an in-kind row, Kellogg's breakfast clubs (held, check
state).

**Employment and ex-offenders.** Youth Futures Foundation (revive first),
City and Guilds Foundation (one row, check state), the Worshipful Company
funds for employment, Barrow Cadbury criminal justice (held), the Prison
Reform Trust and Clinks funding pages as indexes, the Monument Trust, the
Lloyds Bank Foundation programmes (revive first), the Bromley Trust, the
Hadley Trust, the Rank Foundation (revive), the Sir Halley Stewart Trust
(revive), Trust for London (held, one), UnLtd's awards for founders with
lived experience (seven rows held, none live; the provider-walk brief owns
UnLtd, so report rather than stage).

**Young people.** BBC Children in Need (two live, check the third), Paul
Hamlyn Youth Fund (held), Youth Music (revive), the Peter Harrison Foundation
(revive), the Jack Petchey Foundation, the Sylvia Adams Charitable Trust, the
Ragdoll Foundation, the Triangle Trust 1949 Fund (one row, check), the
Blagrave Trust, the Sports Council Trust, Sport England's youth programmes,
the Ernest Cook Trust, the Andy Fanshawe Memorial Trust for young people's
outdoor projects.

**Beneficiary gaps, if the sector list finishes under budget.** Ethnic
minorities: the Baobab Foundation, Ubele's funds, the Runnymede-linked
programmes, Comic Relief's Global Majority funds. LGBTQ: the Consortium's
funds, the Proud Trust's grants, Gilead's UK community grants. Men's mental
health: the Movember Foundation's UK grants, the Mental Health Foundation's
funds if open.

## Tagging

`location_tag: 'UK'` or the nation, `is_local: false`. `impact_sectors` lead
with the sector this brief is staging for, never `community` alone.
`target_beneficiaries` never `['general_public']` alone: the whole point of
these rows is that they name who they are for, and a row tagged general
public will sit in "Needs reading" for `beneficiaries_generic_only`. Eligible
structures as the page states them. Amounts only for a stated per-applicant
figure.

## Budget, citations, dedup, staging, results

As `programmes-cohorts-2026-09-08.md`: one session, no fan-out, two page reads
per candidate, one search per provider, no Anthropic spend, batches of ten
with a dry run and tsc before each commit. Quotes only from page text fetched
in this session. Dedup in SQL by host, title words and funder against the
whole table including archived and rejected rows; the revive list above
exists because that query will hit.

Stage with `stampNewGrant`, `is_active: false`, `pipeline_state:
'tagged_awaiting_review'`, source `system:sectors-national-2026-09-09` at
trust 50. Staged rows land under "Needs reading" until the 01:00 engine reads
them; that is correct, never write `_page_read`.

Results in `docs/handoffs/sectors-national-results-2026-09-09.json`, the
usual shape, with `why` values from the programmes brief plus `revived`,
`closed_no_date` and `ended`. Close with staged and revived counts per
sector and the focused national grant row count per sector before and after,
using the query in this brief's first table.

## What the orchestrator checks afterwards

The five sector counts re-derived in SQL; a dedup query over every staged
title and host; no staged row active, none at `admin:` or `user_verified:`
trust; every revived row's quote checked against its page; and the match test
(`scripts/waitlist-match-test-2026-09-08.ts`) re-run to show the not-universal
Good match count for Men in Sheds Hull, FareShare South West, The Suit Works,
The Apex Project and White Lodge before and after.
