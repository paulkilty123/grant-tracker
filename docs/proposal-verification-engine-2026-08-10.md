# Proposal — one verification engine, two entry points

10 August 2026. **Proposal only. Nothing built, nothing written to any row.**
Branch `docs/verification-first-feedback-proposal`.

Supersedes the standalone feedback-verification proposal written an hour
earlier. Paul's change of shape: don't build a feedback feature, build one
machine that fetches a funder's page, extracts facts with a quoted sentence as
evidence, and proposes a change at the appropriate trust for him to approve or
reject. A user flag and a coverage gap are two doors into the same queue.

Section 4 is a real sample of ten, run before writing this. It changed the
design in three places.

---

## 1. Scope

**One unit of work = one row.** A single page fetch answers every question we
have about that row, so the engine asks them all at once rather than once per
gap.

### Entry point A — user flagged (first in the queue)

36 flags carrying a stated reason on a live grant. These come with a *claim* to
check, which makes them the highest-value input and the easiest to verify.

### Entry point B — coverage gap

Here the brief's definition needs correcting, because taken literally it selects
everything:

```sql
select count(*) from scraped_grants where is_active
  and (deadline is null or max_org_income is null or is_invite_only is not true);
-- 742 of 742
```

`is_invite_only is not true` matches 722 live rows, and `false` is simply
**correct** for most funders. Absence is not a gap. The honest discriminator is
provenance — did we ever look?

| Field | Never checked | Checked, correctly holds nothing |
|---|---:|---:|
| `deadline` | 410 | — |
| `is_invite_only` | 237 | — |
| `max_org_income` | 197 | 449 |
| `is_rolling` | 45 | — |
| **Rows with ≥1 never checked** | **636** | |

So the coverage-gap set is **636 rows, not 742**. The other 106 have been looked
at and are right.

This also gives verification a second job worth as much as correcting: when the
page confirms our value, we **stamp the field as checked**. That converts an
unknown-null into a known-null and permanently shrinks the queue. Two of the ten
sampled did exactly that.

---

## 2. The engine

```
   user flag  ─┐
               ├──►  fetch funder page  ──►  extract facts + quotes  ──►  propose  ──►  Paul approves
coverage gap  ─┘         (reader proxy)         (one LLM call)          (trust 70)
```

Per row it returns, for each of deadline / rolling / income cap / invite-only /
still-listed:

- a **value**, or explicitly "not stated"
- the **quoted sentence** it came from
- a **verdict**

No quote, no proposal. A value the model cannot point at in the page is not
evidence.

### Verdicts

| Verdict | Meaning | Proposal |
|---|---|---|
| `confirmed` | Page states it, and it differs from our record | Write the field, citing the quote |
| `already_correct` | Page states it, and it matches our record | Write nothing; **stamp the field checked** |
| `contradicted` | Page states the opposite of a user's claim | Write nothing; record as matcher signal |
| `not_found` | Page does not address it | Write nothing; leave null. **Never** read absence as "no limit exists" |
| `no_longer_listed` | The fund is not on the funder's site | Propose archive, for Paul's decision only |
| `unreadable` | Fetch failed, or the page carries no usable detail | Route to Fix the link |
| `not_a_grant` | The thing described is not funding | Propose removal from the catalogue |

`no_longer_listed`, `unreadable` and `not_a_grant` all came out of the sample.
The last one was not in any earlier design.

---

## 3. What it reuses

Nothing new is invented:

- **Fetching** — `enrich-grant`'s fetch and its `READER_PROXY_URL` path for the
  ~16 hosts that refuse plain requests. juliarausingtrust.org is one: it returned
  401 to a plain fetch today and read fine in a browser.
- **Writing** — `mergeGrantUpdate` at `user_verified` (70), which outranks
  enrichment and does not pin. Built and tested this morning.
- **Evidence** — `mergeGrantUpdate` already accepts a per-field `citations` map
  stamped into `field_provenance`, so the sentence travels with the value.
- **Keying** — `resolveFlagGrant`, id-only, tested against the two "Stronger
  Communities Fund" rows.
- **Recording** — migrations 051 and 052, already applied.
- **Pins** — a proposal against a frozen field must say so before he approves it.

---

## 4. The sample of ten, run before writing this

Five user-flagged, five coverage-gap. **No writes were made.**

| # | Row | What the page actually said | Verdict |
|---|---|---|---|
| 1 | **Bentley Advancing Life Chances** | *"Your organisation must also have an annual income of under £500,000"* | **confirmed** → `max_org_income = 500000`. Also confirms our deadline `2026-09-14` matches "Round 2 closes Mon 14-Sep-26" |
| 2 | **LGBT+ London Fund** | *"Wednesday 12th August 2026 at 12pm noon"* | **confirmed** → `deadline = 2026-08-12`. **That is in two days and we hold no deadline at all.** Income £500k already correct → stamp checked |
| 3 | **Card Factory Local Community Fund** | *"2026 Community Fund Applications Closed"*; *"income of up to £3 million per annum"* | **confirmed closed** (we show it live, undated); income already correct → stamp checked |
| 4 | **We Love MCR Stronger Communities** | No income limit stated anywhere on the apply page | **not_found** → leave null. User's £750k unverified |
| 5 | **Ufi VocTech Trust** | Lists four programmes, states nothing about open/closed | **not_found** → cannot confirm user's "Not open" |
| 6 | **Forever Manchester** | Page is an index; the fetch answered about *Voicescape Community Fund* (closes 27 Aug 2026), not ours | **wrong page** → see failure mode A |
| 7 | **Hyde Foundation** | General team page, no funding detail at all | **unreadable** → fix the link |
| 8 | **Salford CVS** | Index page with a 2024/25 table, no current status | **unreadable** → fix the link |
| 9 | **GMET Renew Community Fund** | Appears only as a past-projects nav link | **no_longer_listed** → propose archive |
| 10 | **FareShare GM Community Membership** | *"the cost for the food from FareShare is on average 80-90% cheaper"* — a paid membership, **explicitly not a grant** | **not_a_grant** → propose removal |

### Honest read of that

**Four of ten produced an evidenced, actionable change** (1, 2, 3, 9). **Two more
confirmed our data was already right** and let us stamp a field checked (2, 3).
**Three were defeated by the URL, not the method** (6, 7, 8). One was a
categorisation error nobody was looking for (10).

That is a genuinely useful hit rate — and note that #2 alone found a live fund
closing in two days that we show with no deadline.

---

## 5. Three failure modes the sample taught

**A. Index pages answer about the wrong fund.** Forever Manchester's funding page
lists several funds; the extraction came back about *Voicescape Community Fund*.
Left unhandled this would write another fund's deadline onto our row. **Fix:** the
prompt must name our fund and the engine must reject any answer that cannot be
tied to it, returning `wrong page` rather than a value.

**B. The model reasons badly about dates.** On the LGBT+ fund it concluded "not
currently open" because the opening date of 17 June 2026 was "a future date". It
is 10 August. **Fix:** extract dates only; never ask the model whether something
is open. Compute status in code from the extracted dates, where it is a
comparison rather than a judgement.

**C. The quality ceiling is the `apply_url`, not the model.** Hyde, Salford and
GMET returned nothing useful because the stored URL points at a general page.
88 live rows carry `url_status = 'unchecked'`. Verification cannot exceed the
quality of the link, so `unreadable` must be a first-class outcome that routes to
Fix the link instead of degrading into a guess.

---

## 6. Cost, with the arithmetic

One page fetch plus one Haiku 4.5 call per row. Input ~4,000 tokens of page text
plus the question; output ~600 tokens of structured facts and quotes.

- input 4,000 × $1/1M = $0.0040
- output 600 × $5/1M = $0.0030
- ≈ **$0.007 per row, about £0.0055**

| Run | Rows | Cost |
|---|---:|---:|
| Entry A — user-flagged | 36 | **£0.20** |
| Entry B — coverage gap | 636 | **£3.50** |
| **Full run over both** | **672** | **about £3.70** |
| Re-run quarterly thereafter | ~670 | ~£3.70/quarter |

Cost is irrelevant at this scale. The real constraints are Paul's approval time
and fetch throughput — 672 fetches at a polite rate is a few hours of wall clock,
which fits an existing daily cron comfortably.

**Effort:** roughly a day, mostly the extraction contract and the approval screen.

---

## 7. Approval screen

One queue, sorted user-flagged first, then coverage gaps by how much they would
change.

```
LGBT+ London Fund                            The LGBT+ Fund      coverage gap
We hold      deadline: none · income cap: £500,000
Page says    "Wednesday 12th August 2026 at 12pm noon"        lgbtfund.org.uk · 10 Aug
Proposed     deadline → 2026-08-12                     income cap already correct ✓
             [ Approve ]  [ Reject ]  [ Edit ]  [ Wrong page ]
```

Every proposal shows what we hold, what the page said, and the change — so the
decision is a read, not an investigation. **Wrong page** is a first-class button
because failure mode A will happen.

No auto-apply. Bulk approve, if built at all, restricted to `already_correct`,
`not_found` and `contradicted`, none of which change a value.

---

## 8. What it deliberately does not do

- Does not re-enrich whole rows or touch `funder_brief`. The Julia Rausing brief
  still says "Open to organisations of all sizes" for a funder accepting no
  applications; that is a re-read job.
- Does not act on the 355 tag-only flags. No claim, nothing to verify.
- Does not dedupe. A B Charitable Trust has two live rows for substantially the
  same money.
- Does not archive or delete anything without approval, including
  `no_longer_listed` and `not_a_grant`.

---

## 9. Decisions

1. **Coverage-gap set: the 636 "never checked", or narrower to start?** A first
   run over the 74 twice-rejected rows would be about £0.40 and would test the
   engine on rows we already suspect.
2. **`already_correct` stamping — agreed?** It writes provenance but no value,
   and it is what stops the queue regenerating itself forever.
3. **`not_a_grant` and `no_longer_listed`: propose-only, or auto-archive on a
   second confirmation?** Both remove a fund from view, so I would keep them
   propose-only.
4. **Wire it into an existing cron, or run on demand at first?** On demand while
   the verdict quality is being judged.
5. **Fix-the-link first?** Three of ten were defeated by the URL. A pass over the
   88 `unchecked` rows would raise the yield of everything after it.
