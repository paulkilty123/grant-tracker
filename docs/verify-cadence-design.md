# Re-check cadence: keyed off what the page said, not when we last looked

Design proposal, 2026-08-16. **Nothing here is built.** Written after Paul
rejected the flat 14-day cooldown shipped in migration 055.

> "A flat 14 days is wrong for funders that are genuinely open year-round. Key
> the cadence off what the page said, not when we last looked."

---

## 0. Two corrections before the design

Both change what is worth building, so they come first.

**The watchlist does not run daily, and it does not cover the catalogue.**

| | |
|---|---:|
| `check-watchlist` schedule | **Sundays and Wednesdays**, not daily |
| Active entries | 239 |
| Checked per run | 120 (`BATCH_LIMIT`) |
| Full cycle | **7 days**, with zero headroom |
| Eligible catalogue rows | 963 |
| Rows with an exact-URL watchlist entry | **54 (5.6%)** |
| Rows sharing a host with one | 261 (27%) |
| Watchlist entries mapping to no eligible row | **134 of 239 (56%)** |

There is no foreign key between `funder_watchlist` and `scraped_grants`, and no
code anywhere joins them. The watchlist is a *discovery* instrument, asking
whether a funder's listing page has something new on it. It is not a mirror of
the catalogue and cannot become the primary re-check trigger without being
rebuilt as one.

**The change signal is mostly cosmetic.** Of the 17 `listing_changed` alerts
raised on 16 August, roughly 14 were news carousels, jobs boards, blog lists, a
maintenance banner and one copy typo. At most three were substantive. The
per-run change rate is a steady 12–14%, which is far too high for pages whose
funding offer changes a few times a year. Essex Community Foundation has fired
14 times in 24 cycles: it changes essentially every time it is looked at.

And the feed is unread: **387 alerts, none ever resolved**, growing by ~54 a
week. 211 are `page_down`, 176 `listing_changed`.

So the instinct is right and the wiring is not there yet. The watchlist earns a
place in this design as a **targeted** trigger for one job it is genuinely good
at, not as the general clock replacement.

---

## 1. The three shapes, sized against the live catalogue

| Shape | Rule | Rows today |
|---|---|---:|
| **A. Evidenced always-open** | `is_rolling` confirmed with a quote | **198** |
| **B. Dated** | holds a `deadline`, `next_open_date` or `deadline_cycle` | **474** |
| **C. Silent** | read, and timing came back with no answer | **402** |
| (not yet read) | | 291 |

These overlap deliberately: a row can hold dates *and* be silent on whether it is
rolling. Precedence is **B, then A, then C** — a row with real dates is governed
by its dates whatever else it says, because the dates are the thing users act on.

Only 28 rows have a confirmed `deadline`, against 474 holding one. That gap is
the work, not a reason to distrust the shape.

---

## 2. Shape A — evidenced always-open: twice a year

**Due when** `field_evidence.is_rolling.agrees = true` with a quote, and the
stamp is older than **180 days**.

A fund whose page says it accepts applications at any time is making a durable
claim. Checking it fortnightly buys nothing and costs 26 reads a year per row;
at 198 rows that is 5,148 reads a year to re-confirm a sentence that has not
moved. Twice a year is 396.

The design doc's §10 proposed 120 days for this class. 180 is Paul's "a couple of
times a year" and I would take it, because the failure mode is mild: a fund that
stops being rolling almost always acquires a deadline, and a deadline arriving
moves the row into shape B, which is checked far more often.

**Escape hatch:** if the row's `deadline` or `deadline_cycle` becomes non-null by
any route, it leaves shape A immediately.

---

## 3. Shape B — dated: check around the dates, never on a clock

This is the piece that most repays doing properly, and it is the one a timer
cannot express.

**Due when today falls inside a window around a date we hold**, and the row has
not been read since that window opened:

| Window | Why |
|---|---|
| `[D − 10, D − 1]` before an **opening** date | is it actually going to open? A reopen is the most positive event in a grant's life and we currently discover it by accident. |
| `[D + 1, D + 10]` after a **closing** date | did it close? Is there a next date? This is where a stale deadline becomes a lie. |
| every **180 days** otherwise | long stop, so a row whose dates have all passed cannot go stale for ever. |

Dates come from three places, all of which must be considered:
`deadline`, `next_open_date`, and every entry in `deadline_cycle`.

**`deadline_cycle` carries day and month with no year**, so "within 10 days"
needs the same roll-forward the engine already does. Reuse
`isDeadlineCandidate()` and `isOpeningEntry()` from `src/lib/deadline-cycle.ts`
rather than writing a second copy in SQL — that file exists because two copies
of this maths drifted into the same bug.

Opening versus closing is decided by the entry's label through
`isOpeningEntry()`. An unlabelled entry is treated as a **closing** date, which
is the existing convention and the safer default: it schedules the check after
the date rather than before.

**Cost.** 474 rows, most with one or two dates a year, gives roughly 700–950
windowed checks a year plus the long stops. Comparable to the flat cadence it
replaces, but the reads land where they can actually learn something.

---

## 4. Shape C — silent: back off, and say so

**Due when** the row was read and timing came back with no answer, after a gap
that **doubles each time the page comes back silent again**:

```
14 days → 28 → 56 → 112 → 180 (cap)
```

A page that does not mention timing today will not mention it next fortnight.
Re-reading it 26 times a year to learn the same nothing is the flat cooldown's
real cost, and it is paid by the 402 rows in this shape: 10,452 reads a year to
confirm we still cannot tell.

Under the backoff a permanently silent row costs 5 reads in the first year and 2
a year after that. **Any answer resets the streak to zero** — one substantive read
puts the row back on a short leash.

**Storage.** A `silent_streak` integer on the `_page_read` stamp. The engine
already fetches the row, so it reads the previous streak in JavaScript and writes
`streak + 1`. No SQL logic, no second RPC.

**This shape is a to-do list, not a resting state.** 402 rows where we cannot
establish timing is the single largest honest gap in the catalogue, and backing
off must not be mistaken for resolving it. The count belongs on the Pipeline
line next to `live_unbacked`, so it stays visible while it is being deferred.

---

## 5. The watchlist: one join, one cheap signal, and a classifier worth its cost

Not the general trigger. Three specific things instead, in order of value.

### 5.1 Enrol between-rounds rows, and make a change jump the queue

**This is the missing join and it is the most valuable single item here.**

44 rows sit in `between_rounds_scheduled`. **One of them has a watchlist entry.**
The cause is a split path: the manual admin button
(`urls/page.tsx:1874-1929`) does POST to `/api/admin/watchlist` when Paul marks a
row between rounds, but the automatic route in
`grant-merge.ts:623` promotes any row carrying a `next_open_date` and never
touches the watchlist. Almost all 44 arrived automatically, so almost none is
watched.

Proposal:
1. Enrol on transition into `between_rounds_scheduled`, and backfill the 44.
2. A `listing_changed` on a watched between-rounds row **jumps that row to band 0
   of the verify queue**, ahead of the clock entirely.
3. The engine's existing outcomes already answer the question: a future
   `deadline` with a quote means it reopened, `still_listed: false` means it is
   gone, silence means the change was cosmetic.

This is exactly §5 of the tranche 2 design, which has been waiting for the engine
to exist. It now does.

**Capacity warning:** the watchlist cycles 239 entries in 7 days with no
headroom. Adding 44 makes it 283, which needs a third run or a higher
`BATCH_LIMIT`. Raise `BATCH_LIMIT` to 150 and the cycle stays at 2 runs; the last
two runs finished in 126s and 146s against a 240s budget, so the time is there.

### 5.2 Item-count collapse: the one high-precision signal already stored

Of the 17 changes on 16 August, exactly one was mechanically separable without a
model: **Five Lamps went from 11 heading items to 0.** A fingerprint collapsing
to zero, or dropping by more than half, means the page stopped rendering its
content — a takedown, a redesign, or a wall. That is worth a verify on any row,
watched or not, and it is a `length(string_to_array(snapshot_after, ' || '))`
comparison against `snapshot_before`. No model, no new storage.

### 5.3 Classify the diff, so the other 176 alerts stop being noise

The alerts already store `snapshot_before` and `snapshot_after` in full, so the
set difference is computable today. What is missing is a judgement about whether
a diff matters.

One Haiku call per alert over the added and removed items, returning
`cosmetic | funding_change | page_gone` with the deciding line quoted. 176
alerts to date, ~50 a week. At roughly 300 tokens each that is **pennies a
month**, and it turns a feed with a 12–14% firing rate and ~18% precision into
one where the useful ones are labelled.

Then: `funding_change` or `page_gone` on any row we hold → verify queue, band 0.
`cosmetic` → auto-resolve, so the feed drains instead of growing by 54 a week.

**A caveat I want on the record:** my 14-of-17 cosmetic estimate is a hand
reading of a single run, n=17. It is an order of magnitude, not a measured rate.
The classifier's first week should be checked against a hand sample before its
output is trusted to gate anything.

---

## 6. What this replaces, and what it needs

Replaces the flat `interval '14 days'` in `select_verify_batch`
(migration 055) with a per-row `due_at`, computed from the shape.

**Recommended shape: a generated `verify_due_at` column**, or a small view, so
the ordering stays in SQL. The band logic in 055 stays exactly as it is; only
`due` changes meaning.

**Order of work, and it is deliberately not the order of interest:**

1. **Shape C backoff.** Smallest change, largest immediate saving (402 rows), and
   it needs only the `silent_streak` field.
2. **Shape A at 180 days.** One threshold.
3. **The between-rounds join** (§5.1) plus the `BATCH_LIMIT` raise. Highest value
   per line of code, and it closes a gap that has been open since the automatic
   transition was written.
4. **Shape B windows.** The most code, and it needs the cycle maths reused rather
   than reimplemented.
5. **Item-count collapse** (§5.2).
6. **The diff classifier** (§5.3), with a hand-checked first week.

**Not in this design, and next in the queue after it:** eligibility extraction.
The engine has no eligibility fact at all, so "we do not know who can apply" is
the other claim the surface makes without backing, and it is the gap behind
Charlotte's original complaint. Set by Paul, 2026-08-16.
