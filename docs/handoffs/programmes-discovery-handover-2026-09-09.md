# Handover: the programmes discovery work

Written 2026-09-09 by grant-tracker-be, closing a day of work on 8 September.
Launch is tomorrow, 10 September. Read `CLAUDE.md` first.

**The short version: discovery is not the lever. Three methods produced one
programme between them. Read Part two before proposing another search.**

---

## Part one: what was tried, and what it yielded

Three methods, one day, one new programme row.

| method | result |
|---|---|
| City-first search across six cities | 6 rows staged, all support services, all rejected by Paul |
| Provider-first search across banks, corporates and tech | 0 new. All 22 providers already held |
| Gemini, prompted for 15 candidates | 0 verified new. 7 already held, quotes fabricated, one fund closed since 2019 |

What did work was looking at providers already in the catalogue. Splitting
Firstport, one row standing in front of five separately paged funds, produced
four new rows in an afternoon with no discovery at all. Three are grants and
one is a programme.

## Part two: why the number is low, and what actually moves it

**The catalogue holds 184 programme rows and shows 18.** That is not a
discovery gap. Programmes run in rounds, so most are legitimately shut on any
given day. Of the 29 held-and-hidden ones, five reopen in March 2027 and six
carry no parseable date, leaving about four genuinely reviewable.

**The provider layer is close to exhausted.** A provider-first dedup over 22
banks, corporates and tech firms found every one already held: Lloyds 11 rows,
Co-op 8, Barclays 6, NatWest 2, Microsoft 4, AWS 4. Key Fund holds 13 rows,
Pilotlight holds one award twice, Big Issue Invest is held twice.

**So the lever is making held funds reappear, not finding new ones.** Across
the catalogue, 273 funds are closed and hidden. Two crons touch this and
neither covers the gap: `expire-grants` reads only live rows, so once a row is
hidden it never looks again, and `check-coming-soon` reads only rows marked
`between_rounds_scheduled`. A row that expired while still marked `published`
is seen by neither. Scope and sizing are in
`paul-programme-research-and-reopening-scope-2026-09-08.md`.

## Part three: rulings made, do not re-litigate

- **No support rows** (Paul, 8 Sept). The council for voluntary service, the
  growth hub, the social enterprise network. There is one in every town, none
  is applied to, and ruling them in would be over a hundred near-identical
  rows. Six were staged and rejected.
- **The qualifying bar that replaced it:** a named intake, something the
  applicant receives, and the organisation applying.
- **One row per programme, not per provider** (Paul, 8 Sept). A grouped row
  averages fields that are then wrong for every fund, and carries no single
  deadline into the pipeline or amount into the matcher. Firstport's front-door
  row said £5,000 to £25,000 where its fund gives up to £5,000, and said social
  enterprises where the fund is for individuals. Crowding is a display problem
  for the funders table and Find Funding grouping, not a reason to flatten data.
- **Type by what the applicant receives, never by what moves a count.** Three
  of Firstport's four funds say "grants" on their own pages, so they are grants
  even though the job existed to grow the programme number. Find Funding splits
  the tabs; a grant filed as a programme is hidden from the people searching
  for it.
- **`is_local` is true for anything geographically restricted**, nations
  included, matching the 54 Scotland rows.
- **Dedup by provider before by fund.** The fund-first query asks whether we
  hold the fund and answers no while we hold the provider all along. It would
  have staged three duplicate sets in one batch.

## Part four: state at handover

Live catalogue: 584 rows, 18 of them programmes.

Went live 8 September, all on Paul's explicit word under the launch freeze:
four Firstport funds (Build It up to £40,000 closing 24 September, the
Community Enterprise Fund, the Social Enterprise Boost Fund, the Social
Innovation Challenge); five Yorkshire community foundation funds; the York
Community Fund split into two rows so the £13,500 tier's 14 September
expression-of-interest gate drives a real deadline instead of sitting in prose.

Retired on Paul's word: the Leeds Community Foundation front-door row, whose
2027 deadline and £20,000 came from two funds no longer on the page, and which
after the Leeds publishes was outranking four correct rows on amount.

Paul also cleared, during the day: the Firstport Start It row (its page is for
individuals resident in Scotland), the six support rows, and the SSE
"All Programmes" front-door row. Macmillan Q Lab is now live.

Parked correctly: Kirklees Community Grants Round 11, opening 21 September,
which reaches the review queue on the next `check-coming-soon` run and needs a
human click because the automatic publish path does not reach new rows.

## Part five: what is worth doing next, in order

1. **Widen the reopening sweep to hidden rows.** Half a day. Fixes the funds
   due to reopen within the month that are still invisible, including one
   opening on 21 September. Post-launch. Whatever is built must be proved by
   making a fund actually reappear: set a reopening date to tomorrow, run the
   sweep, watch it reach the review queue, put it back.
2. **Walk the 44 programme providers.** Brief at
   `provider-walk-2026-09-08.md`. Tier one is nine providers whose row is a
   front door over several funds; five live-and-wrong rows were found in the
   first nine and four have been fixed. Tier two, twelve providers with nothing
   live, is already answered: those rows were hidden by old decisions and seven
   of eight links tested still work, so it is a judgement pile for Paul, not a
   mechanism hunt.
3. **Normalise the funders table** if the provider walk proves useful. 972
   funder name strings, 724 on a single row, so the working set is 248, and
   most of that is research councils and community foundations behaving
   correctly. Half a day for the automatic collapse. Low priority.

**Not worth doing:** more discovery searching, and asking a language model for
candidates.

## Part six: two traps this work produced

**A row count cannot tell a well-run provider from a dead one.** Lloyds Bank
Foundation is 11 rows with 1 live and is the best-maintained provider in the
catalogue: they run one programme at a time and say so. Power to Change is 6
rows with 0 live and has stopped funding altogether, describing itself as a
think-do tank. Identical in a spreadsheet, opposite in meaning. Any health
metric has to read providers, not counts.

**An empty check is a question, not a finding.** Four times in one day a check
reported something absent and was wrong, every time in the direction of the
answer already held: a truncated buffer, a guessed domain, a shell loop that
overwrote its own evidence, and an absence asserted from two pages when the
sentence was on a third. Before concluding a page does not say something,
prove the probe ran, that the buffer holds the whole page, and that it is the
right page.

## Related briefs on main

- `programmes-cohorts-2026-09-08.md` — the qualifying bar and the provider list
- `provider-walk-2026-09-08.md` — the 44 providers, tiered
- `paul-programme-research-and-reopening-scope-2026-09-08.md` — a plain English
  brief for Paul researching by hand, and the reopening scope
- Results: `programmes-cities-results-`, `provider-walk-results-`,
  `cf-yorkshire-results-`, all dated 2026-09-08

---

## Correction, 2026-09-10: the sweep was never too narrow

Part two says `check-coming-soon` reads only rows marked `between_rounds_scheduled`.
It does not; its first pass reads every row with a parsed reopening date,
hidden or live. The rows were still reaching nobody for a different reason:
nearly every reopening date is written by a human (`user_verified:` at trust
70), the cron writes at `system:` (50), so the ladder refused to clear the
badge, and the cron treated that refusal as a reason to skip the row
entirely. Twenty-eight rows were listed as "skipped (admin-pinned)" every
morning, The Elephant Trust and Kirklees Round 11 among them.

Fixed on `fix/reopening-sweep-pinned-rows`: the badge stays, and a hidden row
is still routed to `tagged_awaiting_review`. Rejected and archived rows are now
excluded up front. Live rows are left alone. See
`src/lib/reopening-resurface.ts` and the note at the write site.
