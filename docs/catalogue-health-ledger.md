# Catalogue health ledger

**Every known old-stock issue, its count today, and what closes it.**

Old stock means data problems that already exist. It is deliberately separate
from anything the discovery flow brings in from here, so "is the back catalogue
clean yet" stays answerable while new rows keep arriving.

- **Measured 2026-08-12** against production (`yrndczlqjqtfgissleev`). Every count
  in the Now column is a live query run on that date, not a figure carried
  forward from an earlier document.
- **User-visible** means a fundraiser or an MCP client can see the wrong thing.
  An issue that only costs Paul time, or only misleads an admin screen, is `no`.
- Live-row denominators are **682** (`is_active = true`), of which **630** are
  also `pipeline_state = 'published'`.

> **Numbers that moved.** Four figures in circulation are stale. `198 fixable
> links` is now **138** (the 198 was superseded 75 minutes after it was generated,
> by a re-run on the same day). `54% pinned` is now **50%**. `135 unparseable
> reopen dates` is **128**. `17 attention rows` is the figure **after** the
> eligibility branch merges; today in production it is **58**. Details in the
> notes below each.

---

## The line: what "done for launch" means

**Set by Paul, 2026-08-16. This governs everything below it.**

Four things close the catalogue for launch. When they are done, the catalogue is
done, whatever else is still open in this ledger:

1. **The eligibility requeue.** 668 rows, one pass, with the hop widening on.
2. **The structure disagreements it raises.** On the order of 250 rows where the
   funder's page contradicts our `eligible_structures` tag. Reviewed and decided.
3. **The publishing re-arm.** Two steps, per the standing rule in the merge
   digest.
4. **The dead-zone drain.**

**Everything else in this ledger is post-September.** That includes items still
marked "in tranche 2" in the table above if they are not one of the four. A row
being user-visible does not by itself pull it back into scope; the four are the
scope.

This is a deliberate stop, not an assessment that the rest does not matter. The
reason is attention, not data quality: from 2026-08-17 Paul's is on the design
rollout, Stripe and pricing. **From that date the catalogue reports by digest
only**, and interrupts are for decisions.

> The earlier framing, "the old stock is clean when section A is empty", is now
> the post-September target rather than the launch bar. Section A has 13 items
> and the four above do not empty it.

---

## A. Wrong to a user right now

The rows a fundraiser could act on and be misled by. This is the section that
should reach zero first.

| # | Issue | Now | Visible | What fixes it | When |
|---|---|---:|---|---|---|
| A1 | Live rows with empty `eligible_structures`, rendered as "eligible ✓" | **20** | **yes** | `fix/eligibility-honest-surface` | Pushed, awaiting go |
| A2 | Rows whose page does not describe our fund (`fixable_link`) | **138** | **yes** | Verification engine home, tranche 2 | Proposal in progress |
| A3 | Rows the engine found closed, still live (`round_closed`) | **44** | **yes** | Same | Same |
| A4 | Rows the engine found are not funding (`not_a_grant`) | **38** | **yes** | Same, then archive | Same |
| A5 | Rows the engine found delisted (`no_longer_listed`) | **13** | **yes** | Same, then archive | Same |
| A6 | Live rows asserting "Rolling" with no evidence (`is_rolling = !deadline`) | **380** | **yes** | Verification engine, **explicit goal of its first scheduled runs** | Tranche 2 |
| A7 | Live rows with no timing information at all | **137** | **yes** | Verification engine, highest-risk recheck class | Tranche 2 |
| A8 | Live rows with a brief written from model memory, not the page | **8** | **yes** | Re-enrich; blocked on some by pins (D1) | Not scheduled |
| A9 | Live rows with invite-only language and no `is_invite_only` flag | **~8** | **yes** | Regex floor from the 10 Aug audit, not re-measured. Needs a pass | Not scheduled |
| A10 | Live rows with an income limit in prose and no structured value | **~30** | **yes** | Same audit, same caveat | Not scheduled |
| A11 | Live rows both `deadline` and `is_rolling` set (contradictory) | **8** | **yes** | Trivial data fix | Not scheduled |
| A12 | Live rows with `deadline` pinned to NULL by an unrelated form save | **15** | **yes** | Unpin; part of the D1 cleanup | Not scheduled |
| A13 | Duplicate live rows on title + funder | **2** | **yes** | Manual merge | Not scheduled |

**A2 to A5 note.** These are the 2026-08-11 verification run, after its same-day
re-runs: `reports/verification-combined-2026-08-11.json`, 642 rows, 409 verified.
The frequently quoted **198** is the pre-re-run figure from
`reports/verification-run-2026-08-11.json` and should be retired. The gate-failure
split of the 138 is `wrong_fund` 107, `no_funding_detail` 27, `fetch_failed` 3,
`no_content` 1, so the dominant case is "the URL loads fine, our fund is not on
that page". **These four rows need re-running before they are trusted**: they are
a snapshot from 11 August, and the catalogue has moved since.

**A3 caveat, added 2026-08-16: some of these are not closed.** The
`round_closed` verdict is a **deterministic function of the proposed deadline
falling in the past — 23 rows of 23, no exceptions**. There is no separate "the
page says closed" signal, so any error in resolving the date is inherited whole
by the verdict. A funder page that writes a deadline without a year ("until 28th
August") can have it resolved to a past year and be judged closed while open.

Measured on the rows the engine has read under v1 so far:

| | rows | year stated in full | year inferred |
|---|---:|---:|---:|
| Live, `round_closed` | 10 | 9 | **1** |
| Archived, `round_closed` | 13 | 8 | 5 |

The one live inferred-year row was the Greggs Community Action Fund, open for
another twelve days, now fixed. **A quarter of the class rests on an inferred
year, and that quarter is where every observed false positive sits.**

Two things follow. The **44 in the table above is a 2026-08-11 snapshot on a
different basis** and cannot be split this way: the engine has produced only 29
deadline proposals so far, so the 44 has not been re-read and its inferred-year
share is unknown. And arming `round_closed` for unattended action now carries a
condition set by Paul: **a removal may not act on a deadline the page did not
state in full**. See §12 of `tranche-2-design.md`.

**A6 is the biggest single number in this ledger.** `is_rolling` is set as
`!deadline`, so a parse failure and a genuinely rolling fund are indistinguishable
in the data and identical on screen. 380 of 682 live rows say "Rolling, apply any
time", and an unknown share of them are funds whose deadline we simply failed to
read.

It cannot be resolved by relabelling, because "no deadline stated" is just as
unevidenced as "rolling" and would understate the genuinely rolling funds. It
needs a page read per row: does the funder say applications are open year-round,
or does the page carry a date we missed?

**Standing instruction, 2026-08-12: separating genuinely rolling from unread
deadline, with a quote for each, is an explicit goal of the verification engine's
first scheduled runs.** It is the single largest correctness question in the live
catalogue and the engine is the only thing that can answer it. Not a side effect
of general rechecking; a named objective with its own count in this ledger.

---

## B. Wrong in the admin state, invisible to users

Costs Paul time or hides work, but no fundraiser sees it.

| # | Issue | Now | Visible | What fixes it | When |
|---|---|---:|---|---|---|
| B1 | Published-but-inactive: in no user surface **and** in no admin queue | **173** | no | One-off drain, proposed in the merge digest | **First cleanup** |
| B2 | Live rows carrying a non-published `pipeline_state` | **59** | no | Same | Not scheduled |
| B3 | Archived but still `is_active` | **8** | no | Same | Not scheduled |
| B4 | Rows quarantined with `needs_intervention_reason`, frozen from retry | **34** | no | Clear the reason, re-run the chain | Not scheduled |
| B5 | Rows blocked by "eligibility narrowed" (`tags_changed` critical) | **42** | no | `fix/eligibility-honest-surface` demotes it to info | Pushed, awaiting go |
| B6 | Gate `attention` rows (live and blocking) under today's policy c1 | **58** | no | Falls to **17** when policy c2 merges | Pushed, awaiting go |
| B7 | Gate `hold` rows (never live and blocking) | **43** | no | Verification engine clears the engine-answerable share | Tranche 2 |
| B8 | Rows marked dead by hand, evidence says likely open | **66** | no | `reports/dead-row-triage-2026-07-29-verified.json`, 20 strong + 46 weak. Never actioned | Not scheduled |

**B1 grew.** It was 137, then 169 on 10 August, and is **173** today. Nothing has
ever fixed it; each pass just re-counts it.

Segmented 2026-08-12, which is what makes a drain proposable:

| Destination | Rows | Signal |
|---|---:|---|
| `archived` | 11 | `url_status = 'dead'` from a validator check |
| `between_rounds_scheduled` | 19 | carries reopen information |
| Deadline passed, **recoverable** | 126 | 64 have a `deadline_cycle`, 62 more have `decision_timeline` prose |
| Deadline passed, no recovery signal | 4 | archive |
| No obvious reason, needs a look | 13 | live-shaped but inactive |

**These are not stale rows.** 127 of the 130 deadline-passed rows closed within
the last 90 days, the oldest is 9 April, and none is more than a year old. Nearly
all carry a cycle or timeline, so most should roll to their next round rather
than be archived. The drain is mostly a recovery job, not a clear-out.

**The trap that keeps them there:** `expire-grants` selects `is_active = true`, so
a row that is inactive can never have its deadline rolled. Once a row lands here
its deadline rots in the past permanently.

**Cause not identified, and worth saying so.** None of these rows carries
`pipeline_state` provenance and only 5 carry `is_active` provenance, so the
writes bypassed `mergeGrantUpdate`. The obvious suspect was the
`trg_auto_deactivate_closed_grants` trigger, which sets `is_active := false`
without touching `pipeline_state`: **measured, and it explains none of them.**
Zero rows in the whole table match its twelve phrases, so it is dormant. The rows
are spread across every source, which rules out a single bad scraper. So the
drain proposal includes a detector rather than assuming the feed is closed.

**B5 note.** Demoting the code unblocks the queue; it does not review the tags.
Those 42 rows keep whatever narrowed structure list the re-read produced. That is
the deliberate trade recorded in the merge digest: narrowing under-matches, which
is the recoverable direction, and the classifier can no longer narrow without
evidence.

---

## C. Structure and compound funders

One catalogue row standing for several real funds. Source:
`docs/catalogue-structure-worklist.md` and
`reports/catalogue-structure-2026-08-11.json` (9 rows returned `multiple_funds`).

| # | Funder | State | What is left | When |
|---|---|---|---|---|
| C1 | **Barrow Cadbury Trust** | **Open, blocked** | 6 programmes named on one page with no amounts or deadlines. Splitting now yields rows thinner than the one they replace. Needs per-programme pages, or a decision to accept name-and-brief-only rows | Not scheduled |
| C2 | **School for Social Entrepreneurs** | **Open, blocked** | Same blocker, 6 programmes. Separately: SSE uses both `the-sse.org` (9 rows) and `sse.org.uk` (1 row) after a rebrand, unresolved since 4 May | Not scheduled |
| C3 | **The Bromley Trust** | **Done 11 Aug**, one residual | All 3 rows re-pointed from the philosophy page to `/apply-for-funding/`. Neither programme row has a deadline; the route is a quiz then a form with no stated close. Rolling is likely but unevidenced, so not activatable | Not scheduled |
| C4 | **Somerset Community Foundation** | **Reconciled 11 Aug**, one gap | Not a split. Crisis and Resilience Alliance staged not live; `WCS Pickford Trust Fund` has no row at all (closed, low priority) | Not scheduled |
| C5 | **Ufi VocTech Trust** | Split done, **blocked** | 4 rows created, all verified closed to new applicants, so none is activatable. The generic row stays live meanwhile | Not scheduled |
| C6 | **Baring Foundation** | **Resolved 11 Aug** | Strengthening Civil Society live, other two inactive, generic row archived | Closed |

**Not splits, verified, do not reopen:** The Grocers' Charity (18 past-grantee
categories), Fishmongers' Company (stages of one process), Julia Rausing Trust
(navigation categories).

**Unsourced, do not repeat.** `docs/week-plan-2026-08-11.md` refers to "Somerset's
11 closed funds". No enumeration of those 11 exists anywhere in the repo. The
structure JSON says the page covers 16 programmes; the worklist tables 5 open
ones. Re-measure before acting.

---

## D. Provenance and pinning

| # | Issue | Now | Visible | What fixes it | When |
|---|---|---:|---|---|---|
| D1 | Live rows carrying at least one pinned field | **341 / 682 (50%)** | no | Selective unpin; needs judgement about which pins were real decisions | Not scheduled |
| D2 | Rows pinned by an `admin:<email>` form save rather than a decision | **407** | no | Cause fixed 26 Jul; these are artefacts | Not scheduled |
| D3 | Pinned `deadline` on a live row | **54** | partly | 15 of them pinned to NULL, which is A12 | Not scheduled |
| D4 | No `verified_at` on any field, so "confirmed today" and "written in January" are indistinguishable | all rows | no | Persist-and-verify, part 2 of the lifecycle review | Tranche 2 |

**On the 54%.** Four documents state it, all tracing to one measurement on
2026-07-26 with no query attached. The only pinning figure in the repo with SQL
beside it is 368/742 = 49.6% on 10 August. My measurement today is **341/682 =
50.0%**, using the same definition (a live row with at least one `pinned: true`
entry). The series has been flat at roughly half the catalogue for a month.

---

## E. Signals nothing consumes

Each of these is a working detector whose output goes nowhere.

| # | Issue | Now | Visible | What fixes it | When |
|---|---|---:|---|---|---|
| E1 | Unresolved watchlist alerts | **359** | no | Watchlist reader routes `listing_changed` into review | Tranche 2 |
| E2 | Untriaged user feedback flags | **493** | no | Nothing automated consumes them; triage is a manual button | Not scheduled |
| E3 | Open crawl errors | **144** | no | Threshold warning exists, no triage path | Not scheduled |
| E4 | `grant_closed` URL verdict, times ever persisted | **0** | no | The validator computes it and never writes it | Not scheduled |

**E2 is the sharpest.** 84% of those flags are negative, and the 10 August audit
found a user who left 13 negative flags on 7 August whose grants were all still
live and unchanged three days later. Two sub-bugs make the counts worse than they
look: the feedback admin page mislabels rows because `match_feedback.grant_id`
mixes UUIDs and `external_id`s while the join is on `id` only, and the 7 August
entries have empty `reasons` arrays with populated free text, so the tag counts
understate reality.

---

## F. Link and URL health

| # | Issue | Now | Visible | What fixes it | When |
|---|---|---:|---|---|---|
| F1 | Rows with `url_status = 'dead'` | **615** | no | — | — |
| F2 | — of which manual admin hides (`url_last_checked` null) | **554** | no | Deliberate. Not a defect | n/a |
| F3 | — of which validator verdicts | **61** | no | `rescue-dead-urls` exists, manual only | Not scheduled |
| F4 | Live rows with `url_status = 'unchecked'` | **51** | **yes in the web app**, hidden from MCP | Two surfaces, two contracts. Known and deliberate, worth revisiting | Not scheduled |
| F5 | Live rows scoring `url_quality_score < 60` | **62** | no | Informational at the gate by design | n/a |

**F4 is a real inconsistency**, flagged in `url-validator.ts` and left open: an
unchecked URL hides the row from agents but shows it in the app.

---

## G. Reopen and between-rounds

| # | Issue | Now | Visible | What fixes it | When |
|---|---|---:|---|---|---|
| G1 | Rows with reopen text but no parseable date | **128** | partly | Engine writes `next_open_date_parsed` | Tranche 2 |
| G2 | — of which live | **33** | **yes** | Same | Tranche 2 |
| G3 | `between_rounds_scheduled` rows with no parseable reopen date | **40 / 50** | no | Invisible to both reopen crons until fixed | Tranche 2 |
| G4 | Live rows carrying the "Closed, next round TBC" placeholder | **1** | **yes** | `fix/lifecycle-live-defects` stops new ones; this one predates it and needs a manual sweep | Not scheduled |

---

## H. Crawler yield

Not wrong data, but the volume that everything downstream has to filter.

| # | Source | Rows ever | Live now | Yield | Note |
|---|---|---:|---:|---:|---|
| H1 | `gov_uk` | 243 | **15** | 6% | Refetched and re-upserted twice weekly; no change detection |
| H2 | `ukri` | 198 | **1** | 0.5% | Same |

`fetched` equals `upserted` for every source on every run, so the crawler rewrites
everything it sees each time. Adding change detection is roughly a day and is not
scheduled.

---

## I. Coverage gaps

Absence rather than error, tracked because they bound what the catalogue can
answer.

| # | Gap | State |
|---|---|---|
| I1 | London boroughs with no rows | 15 of 32 at zero as of 12 June, improved from 20. 56 rows were staged the same day to cover them, **`is_active = false`, never published**. Blocked partly by the London Councils directory being dead |
| I2 | City coverage outside London | Near zero |
| I3 | Sector taxonomy drift | `types/index.ts` says 14 sectors, `CLAUDE.md` says 19. Explicitly deferred |
| I4 | `eligible_structures` empty on published rows | ~64 to 72 rows, targeted charity-only marking outstanding |
| I5 | CIC under-tagging | ~78 rows suspected, 50 corrected, residue unaccounted for |

---

## J. Unknown disposition

Recorded as a plan, never as an outcome. Listed so they are not mistaken for
clean.

| # | Item | Note |
|---|---|---|
| J1 | The 2026-04-07 needs-review audit, 96 grants | Split into 2 irrelevant / 16 bad URLs / 7 programme variants / 71 valid. **No document records whether any bucket was actioned.** All five audit files are untracked |
| J2 | Two Ridings amount corrections, 4 rows | Recommended 1 May, no confirmation they were applied |
| J3 | Jack Petchey "Places & Spaces Fund" `amount_max` £2,000,000 | Queued for verification since 22 June |

---

## Scoreboard

| Section | Items | User-visible items | Closed or in flight |
|---|---:|---:|---|
| A. Wrong to a user | 13 | 13 | 1 pushed, 4 in tranche 2 |
| B. Admin state | 8 | 0 | 2 pushed, 1 in tranche 2 |
| C. Structure | 6 | — | 2 closed, 4 open |
| D. Pinning | 4 | 0 | 1 in tranche 2 |
| E. Dead signals | 4 | 0 | 1 in tranche 2 |
| F. Links | 5 | 1 | 0 |
| G. Reopen | 4 | 2 | 3 in tranche 2 |
| H. Crawler yield | 2 | 0 | 0 |
| I. Coverage | 5 | — | 0 |
| J. Unknown | 3 | — | 0 |

**The old stock is clean when section A is empty.** Everything else is either
cost, risk of future error, or absence.

Nothing in this ledger counts rows produced by the discovery flow from
2026-08-12 onward. Those are tracked by the yield line on the Pipeline page.

---

## Maintenance

Update on each merge that closes a row, and re-measure the whole table at each
significant milestone. The counts are cheap: every figure above came from
`scraped_grants`, `publish_gate_decisions`, `cron_runs`, `match_feedback`,
`watchlist_alerts` and `crawl_errors`, in six queries.

Re-run A2 to A5 before trusting them: they are a snapshot of 11 August, and the
verification engine has no home yet, so nothing has refreshed them since.

### Standing priorities

Set by Paul, 2026-08-12, and to be carried forward until closed.

1. **B1, the 173 invisible rows, is the first cleanup.** Drain proposed in the
   merge digest, with a destination per row rather than a bulk state change.
2. **A6, the 380 unevidenced Rolling rows, is priority input for tranche 2.**
   Resolving genuinely rolling against unread deadline, with evidence, is an
   explicit goal of the engine's first scheduled runs, not a by-product.

| Date | Change |
|---|---|
| 2026-08-12 | Ledger opened. All counts measured. Retired the stale 198, 54%, 135 and 17. |
| 2026-08-12 | B1 segmented by destination: 11 archive, 19 between rounds, 126 recoverable, 4 archive, 13 unclear. Trigger hypothesis tested and disproved. B1 and A6 set as standing priorities. |
| 2026-08-16 | Launch scope fixed to four items (see "The line" above). Everything else post-September. Catalogue reports by digest only from 17 Aug. |
| 2026-08-16 | A11 (deadline and is_rolling both set) reduced by one: Greggs Community Action Fund `is_rolling` set false, deadline 2026-08-28 retained. Count to re-measure. |
| 2026-08-16 | A3 needs a caveat before it is trusted: the `round_closed` verdict is a deterministic function of the proposed deadline falling in the past (23 of 23 rows, no exceptions), so a year-less date on the funder's page that resolves to a wrong past year produces a false "closed". Confirmed on the Greggs row, which is open for another 12 days. Bears directly on the §12 auto-act decision. |
