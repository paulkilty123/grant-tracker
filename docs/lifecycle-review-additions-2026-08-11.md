# Lifecycle review — two additions

**Date:** 2026-08-11
**Status:** additions to the lifecycle review brief, to be folded into it

The brief itself was drafted in another session and is not in this repo. This
file records two additions Paul made on 2026-08-11, each with the evidence
behind it, so neither is lost in the handover. Part numbering follows the
brief's.

---

## Part 1 — confirmed rule: enrichment reads the source before a human sees the row

**The rule.** Nothing reaches human review before enrichment has read the
source. Design the flow so the ordering is *enforced*, not habitual — a review
queue that can be reached by a row enrichment has not read is a queue that will
eventually be reached that way.

### The worked example

On 2026-08-11 a manual split of the Ufi VocTech Trust catalogue entry staged
four programme rows for review. Enrichment had not yet run on them. All four
were staged as candidates to activate.

When enrichment did run, it read the four funder pages and disagreed on every
one. Verified afterwards against the live pages:

| Row | What the page actually says |
|---|---|
| VocTech Challenge | "Applications are currently closed." |
| VocTech Together Support Programme | "Applications have closed, but you can still get involved." (closed 20 July) |
| VocTech Activate | "Applications are currently closed." |
| VocTech Ignite | "By invitation only to projects who have previously submitted an unsuccessful application to a Ufi grant funding round." |

None of the four was open. The sweep archived two of them automatically on the
`open_status = 'closed'` signal; the other two survived only because the pages
do not state a status plainly.

### Why it is a flow problem and not a diligence problem

The split itself was correct work — one row per programme is the right shape,
and it was done carefully. What it could not do was know the open status,
because that fact lives on the page and nobody had read the page yet. The
reviewer would have inherited four plausible-looking rows with no signal that
they were closed, and the only thing standing between that and four closed
funds in front of users was the reviewer independently checking four URLs.

That is the failure mode the rule closes: review is being asked to supply a
fact that the pipeline is better placed to supply, and does supply, for free.

### What "enforced" has to mean

Ordering by convention fails the moment someone stages rows by hand, which is
exactly what happened here. Some candidates, cheapest first:

- A row cannot enter the review queue while `funder_brief IS NULL` — the queue
  filters it out and shows it as "awaiting enrichment" instead.
- Staging paths (manual splits, gap-audit inserts, SQL) land in `captured` and
  are *only* promoted to a reviewable state by the enrichment chain.
- The activate action refuses on a row with no evidenced open status (see the
  companion rule Paul set the same day: nothing activates without an evidenced
  open status).

The last of these is the backstop and the other two are the guardrail; the
brief should pick deliberately rather than assume all three.

---

## Part 2 addition — reopen dates that have already slipped

**The case.** VocTech Activate's page advertises its next round as opening
6 January with a Stage 1 deadline of 3 February. Both are **2026** — six months
in the past as of today. A between-rounds watcher that only looks forward treats
this as a scheduled reopen and waits for a date that has already gone.

So the watcher needs to handle a reopen date that is *already past*, not only
one in the future. A slipped reopen is a signal the row needs re-reading, not a
row that is quietly waiting.

### The problem is larger than the watcher, and partly invisible

Measured across the catalogue on 2026-08-11:

| | rows |
|---|---|
| have a `next_open_date` | 178 |
| parses to a future date | 43 |
| **does not parse at all** | **135** |
| parses to a past date | 0 |

The zero is misleading. It is not that no reopen date has slipped — it is that
a slipped date cannot be *seen*, because `next_open_date` is free text and
`next_open_date_parsed` is null for 76% of rows. The watcher's input is missing
for three quarters of the population it is meant to watch.

Of the 135 unparsed, **101 are pure "TBC" variants** ("Closed — next round TBC"
×43, "TBC — between rounds" ×21, "TBC — fund currently closed" ×15). These carry
no date at all, so no watcher can ever fire on them; they need a different
mechanism — a re-read cadence, not a date trigger.

**12 carry a real date that simply failed to parse.** Including ISO strings,
which is its own bug: `2026-07-30` and `2027-01-01` are sitting unparsed.

### Five of them are live to users right now

Rows currently `is_active = true` advertising a reopen date that has already
passed:

| Row | Reopen date shown | Passed |
|---|---|---|
| Community Grant Programme | `2026-07-30` | 12 days ago |
| HAPi & Matched Funding | `16 July 2026 (round 2)` | 26 days |
| Projects for Young People Grants | `16 July 2026 (round 2)` | 26 days |
| Environment & Sustainability Grants | `2 July 2026 (round 2)` | 40 days |
| King Charles III Charitable Fund — Small Grants | `5 August 2026` | 6 days |

Plus `BCG UK Social Enterprise Award`, live, reading "2026 cycle closed
(deadline was 11 May 2026); next round expected to open later in 2026".

This is a user-visible correctness problem today, not only a design gap in a
watcher that does not exist yet. It should be triaged on its own rather than
waiting for the lifecycle review to conclude.

### What the addition asks of the design

1. Treat a **past** reopen date as an active trigger — re-read the page — rather
   than an inert one.
2. Fix the parse before building the watcher, or it runs blind on 76% of rows.
   Start with the ISO strings, which should never have failed.
3. Give the 101 date-free "TBC" rows a re-read cadence, since no date trigger
   can reach them.
4. Decide what a user sees on a row whose reopen date has passed. Showing a date
   that has gone is worse than showing "next round TBC", because it reads as
   current information.
