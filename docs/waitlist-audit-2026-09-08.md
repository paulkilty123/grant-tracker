# Waitlist audit: are the rows that serve the 26 actually correct?

Written 2026-09-08, after the six live-and-wrong fixes. **Read only: nothing was
changed by this pass.**

The coverage check asked whether there were *enough* rows for the waitlist
signups. This asks the better question: are the rows they can reach **correct
and visible**. Gap 1 is why — chasing missing men's funders turned up a
wrongly-rejected fund already in the catalogue.

## Method

All 1,991 rows, paginated so nothing was capped at Supabase's 1,000-row default.
577 live and published after this morning's fixes.

Faults are the patterns this week actually produced, not a guess:

| detector | what it catches |
|---|---|
| `front_door` | apply_url is a bare homepage, or a shallow index that is a strict prefix of another row's URL on the same host. The Firstport and SSE shape |
| `third_party_url` | apply_url points at an aggregator rather than the funder. The SIB shape |
| `duplicate_url` | more than one live row shares an apply_url. The Hull shape |
| `expired_but_live` | live with a deadline already past |
| `hidden_no_reason` | pipeline_state published, hidden, no deadline and no reopening date |
| `no_amount` | live with both amount columns null |

**`no_amount` is not breakage.** The amounts work established that a funder
stating no per-applicant figure is legitimately null. It weakens matching, it is
not an error, and it is reported separately below.

## Headline

**91 of 577 live rows carry a structural signal, 16%.** Broken down:

| signal | live rows |
|---|---:|
| front door, bare homepage | 72 |
| duplicate apply_url | 9 |
| third-party aggregator URL | 9 |
| front door, shallow index | 1 |
| *(separately)* no amount | 152 |
| *(separately)* hidden with nothing explaining it | 12 |
| *(separately)* reopening within 30 days but hidden | 4 |

**Zero live rows are expired-but-live**, which says the expire cron is doing its
job.

## The detectors over-flag, and that is worth knowing before anyone acts

Checked by hand, most flags are not defects:

- **Of four duplicate-URL clusters, only one is a genuine duplicate.** The
  others are sibling funds legitimately sharing one application page, which is
  correct under Paul's one-row-per-programme ruling: Freemasons' Large and Small
  Grants, Clothworkers' Small and Large Capital, and Sussex Community
  Foundation's Main Grants, Lewes Fund and Acting on Climate.
- **A homepage link is not automatically wrong.** Many of the 72 are small
  family trusts whose entire site is one page, where the homepage genuinely is
  the application information. Eranda Rothschild, Gordon Fraser, Aurora Trust
  and BlueSpark are that shape.

So 91 is an upper bound on the work, not a defect count. The real list is
shorter and is below.

### The one genuine duplicate

`8c8418fe` **Arts Council National Lottery Project Grants** and `79b3cc06`
**National Lottery Project Grants** are the same fund: same funder, same URL,
same £100,000 ceiling. One carries pins on deadline and amounts, the other
carries none, so the pinned row is the keeper on the same logic as the Hull
merge.

## The answer for the waitlist

**Most of the 26 are fine.** Seven of the fifteen assessable organisations have
**no structural fault at all** in the rows that reach them.

| organisation | rows reaching them | structurally faulty | worst of it |
|---|---:|---:|---|
| Fresh Futures | 14 | **0** | — |
| The Suit Works | 14 | **0** | — |
| Men in Sheds Hull | 15 | **0** | — |
| Bridlington Cricket | 15 | **0** | — |
| Men Walk Talk | 5 | **0** | — |
| The Resurgence Trust | 4 | **0** | — |
| White Lodge Centre | 1 | **0** | its single Surrey row is sound |
| ACTA Community Theatre | 4 | 1 | John James Bristol Foundation linked to its homepage |
| FareShare South West | 9 | 1 | same John James row |
| NW Pre-hospital Critical Care | 14 | 1 | Manchester Airport Community Trust, homepage |
| Become United | 11 | 1 | same Manchester Airport row |
| IOI London | 42 | 4 | Heritage of London Trust homepage, City Bridge index, a CEF aggregator link |
| The Apex Project | 41 | 5 | as IOI London, plus two more |
| East Sussex Wildlife Rescue | 12 | 5 | Homity Trust and Southover Manor on homepages, a Sussex CF sibling-page flag |
| Swansea Rainbow Counselling | 37 | 6 | Albert Gubay homepage, Coalfields homepage, a Find a Grant aggregator link |

The pattern: **the organisations with the fewest rows have the cleanest ones**,
and the London-reaching organisations have the most faults simply because they
reach the most rows. Nobody's matches are being wrecked by broken data.

So the constraint on the waitlist cohort is **coverage, not correctness** — the
opposite of what gap 1 suggested, and worth knowing before more repair work is
commissioned.

## What is worth doing, and it is short

1. **Merge the Arts Council duplicate** (`8c8418fe` / `79b3cc06`). The one
   genuine duplicate in the live catalogue.
2. **Fix the five homepage rows that waitlist organisations actually reach**:
   John James Bristol Foundation (ACTA, FareShare SW), Manchester Airport
   Community Trust (NWPCC, Become United), Heritage of London Trust (IOI, Apex),
   The Homity Trust and Southover Manor Trust (East Sussex WRAS). Five rows,
   each serving a named signup.
3. **Two aggregator links reaching waitlist organisations**: the Commissioned
   Rehabilitative Services grant on find-government-grants, and the Community
   and Environment Fund. Both should point at the funder's own page, and the
   Men's Health Community Fund this morning showed what happens when they do
   not: the row gets rejected when the listing dies, not when the fund does.
4. **Leave the other 67 homepage rows alone for now.** They need a human to say
   whether the homepage is the application page, which is a judgement per row
   and not urgent.

## Worked, 8 September (see scripts/waitlist-audit-fixes-2026-09-08.ts)

**Done:**

- Arts Council duplicate merged. `79b3cc06` rejected, `8c8418fe` kept because it
  carries the admin pins, the same rule as the Hull merge. Flagged for review
  rather than acted on: the two rows disagreed on the floor, £3,000 on the
  pinned keeper against £1,000 on the rejected one, and Arts Council's page
  returns 403 so the pin was left rather than changed on a guess.
- Four homepage rows relinked to their real application pages and enriched with
  full briefs: John James Bristol Foundation, Heritage of London Trust, The
  Homity Trust and Southover Manor Trust.
- **A real amount error found on the way.** Heritage of London Trust held
  £25,000 where its own grant-scheme page says "Grants of up to £15,000 are
  available for the restoration of historic buildings and monuments". Corrected
  to £15,000. That row serves IOI London and The Apex Project.

**Three of the eight were NOT defects, and the detector was wrong rather than
the data:**

- `373ce8d3` Manchester Airport Community Trust Fund links to
  `magcommunityfunds.smapply.org`, read as a bare homepage because it has no
  path. It is an application portal, which is the right destination.
- `16bfa48f` Commissioned Rehabilitative Services and `5700594e` HS2 CEF/BLEF
  point at find-government-grants. Both are **government** schemes and Find a
  Grant is the government's own official route for them, and both listings
  return 200 today. That is the opposite of the Men's Health Community Fund
  case, where the fund's real home is a charity partner and the listing had
  died. Flagging them as third-party was the detector over-reaching.

So of eight actionable items, five were real and three were my own false
positives. Worth carrying into any future use of these detectors: an
application portal has no path, and for a government scheme the government's
listing is the funder's own page.

## Still outstanding from earlier, unchanged by this pass

- 12 rows hidden with nothing on them explaining the hide.
- 4 rows reopening within 30 days that neither cron will surface, the nearest on
  18 and 21 September.
- 152 live rows with no amount, which is legitimate where the funder states none
  but weakens matching for everyone. Worth sampling to see how many genuinely
  state a figure we have not captured.
