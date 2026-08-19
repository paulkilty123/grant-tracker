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


## 2026-08-18 — Re-read will never correct an amount, and the flag that replaces it reads pots as ceilings

Groundwork's Grassroots Grants was stored at £500–£10,000. The page states one
figure, once: "unrestricted funding of up to £2,000 to 700 small, local
organisations in England". Neither stored number appears anywhere on it. Both
came from `scraper:young_camden_foundation` — 73 rows across 72 different
funders, i.e. a third-party funding directory, not the funder's own page.

Re-reading did not fix it, and could not. `enrich-grant`'s amount policy is
**gap-fill only**: it writes a derived figure when the field is null and never
overwrites an existing one, raising a flag instead. That was a deliberate call on
2026-07-25 after the extractor disagreed with 18 of 60 live rows and was itself
wrong on several. The policy is right. What is missing is the other half — a way
for a human to accept the derived figure in one press. The card prints the
correct number inside a sentence and offers no way to apply it.

Row corrected by hand: `amount_max` 2,000, `amount_min` null, pinned, with the
page quote in `field_evidence`.

**The flag population is 32 rows, 23 live — and it does not mean what it says.**

- `amount_under_stated` (24 rows, 16 live) is **mostly false**. It fires when the
  derived figure is 2× the stored one, and what it is nearly always reading is
  the fund's total pot: Access £5,000,000, Co-op Belong £7,000,000, NHS Charities
  Together £1,400,000, City Bridge £22,000,000, MRC Equip £14,000,000, Asda
  £1,255,314. The stored values on those rows are right and the flag is wrong.
- `amount_pot_suspected` (8 rows, 6 live) is the useful direction, and is where
  Grassroots Grants sat.
- **3 live flags are stale** — Football Foundation Grass Pitch, Lloyds Specialist
  Programme, Oxfordshire Thriving in Nature. The amount was corrected, the flag
  was never re-evaluated, and each now warns about a disagreement with itself
  (3,200 vs 3,200; 200,000 vs 200,000; 500,000 vs 500,000). Nothing clears a flag
  when the underlying value is fixed. Same shape as the tag diffs fixed earlier
  today: a stored record of a past event, never reconciled against the row.

This is the house rule again. The check is "the derived figure differs by 2×",
which is a sentence about two numbers. The sentence about the user is "the amount
we show is not what one applicant can ask for" — and a fund's total pot passes
the first test while saying nothing about the second.


### Both fixed, same day

**The flag now requires a per-grant cue.** `extractGrantAmounts` reports
`max_cued`, and only a cued figure may dispute a stored amount. The asymmetry is
deliberate and worth keeping straight: `amount_pot_suspected` needs no cue,
because a pot read as the derivation makes that ratio *smaller*, never larger.
Understating is the only direction a stray pot can fake.

Three extractor faults found by looking at the survivors rather than the counts,
each now a test with its real string:

| Row | Was | Now | Cause |
|---|---|---|---|
| Fishmongers' Company | £5,000,000 | £90,000 | "applicant annual income must be between £250,000 and £5,000,000" is eligibility, not a grant |
| Jerwood Annual Round | £2,000,000 | £200,000 | "award up to £2m annually in one open round" — the round, not the grant |
| Beinneun Community Fund | £500,000 | none | "the fund has up to £500,000 available annually" — *available* belongs to the fund |
| Crowdfunder Match Funding | £1 | none | "every £1 raised from the public is doubled" |

`grant-amounts.ts` had **no test file**, which is how a regex tuned against a
dozen named production cases could be edited with the suite green. It has one
now, covering the legacy cases (Havering, Sterry, Adint, Stronger Futures,
Trusthouse, Change Makers, Heritage in Need, Consumer Led Flexibility, Nesta) as
well as the four above.

**Migration 062 clears an amount flag when the amount changes.** In SQL, not in a
handler: `scraped_grants` has several write paths and fixing the one in front of
us is what left the others to rot. Proven both directions — an amount write takes
the flag 1 → 0, a non-amount write leaves it at 1.

**Re-derived: 32 flags → 11, of which 6 live.** No amount was changed by the
script; it only adds, keeps or drops the warning. The six live survivors are
genuine judgement calls, Morrisons (stored £10,000, text says £25,000) most
likely a real error.

**The card can now apply the figure.** Stored on the flag as a number rather than
left inside the sentence, with a "Use £2,000" button on the chip that raised it.
The warning clears itself on the write.

**Both £2 rows closed, 18 August, and they were two different bugs.** Read the
pages rather than guessing, as the entry above required. The 17 other sub-£100
rows are deliberate £0 in-kind entries (pro-bono legal, volunteer matching) and
remain correct.

*International Tree Foundation* was the rhetorical-figure class after all, but
one step further out than Crowdfunder: `ai_extract:amounts:v1` read the unit
price out of our own description ("max £1.95/tree equivalent") and stored it as
the size of the award. The funder's June 2026 guidelines give the real mechanic
— "Projects to range from 100 - 10,000 trees planted per year, with a maximum
price equivalent to £2.15/tree" — so the ceiling is 10,000 × £2.15 = **£21,500**,
pinned with the quote. `amount_min` left null deliberately: £2.15 is a *maximum*
price per tree, not a fixed one, so the 100-tree floor guarantees no £215 award.
The description was stale in three further ways and was rewritten from the same
document at `system:` trust, not `admin:`, so enrichment can still improve it:
the per-tree rate had moved £1.95 → £2.15, the community-orchard provision is
gone from the 2026 round, and the two-stage EOI process is now a single portal
application.

*DBIST's AI Growth Lab* was not a rhetorical figure at all. Its page says twice
that "Participants will not receive funding", and the £2 was a **schema
placeholder**: gov.uk's Find a Grant requires numeric minimum and maximum award
fields, so a department with no award to state enters the smallest legal pair,
1 and 2. The £6.9m in the same record is the scheme total, not a per-applicant
award. `amount_max` is now null and agrees with `prog_includes_funding`, which
was already false.

**The placeholder had a fix already, wired to one field of two.**
`normaliseGovUkAward` in `crawl.ts` has stripped the £1 minimum since July,
after the BFI rows were hand-fixed on 23 June and re-imported by the crawl on
14 July. `amount_max` was never routed through it and copied gov.uk verbatim.
Now both go through, with floors of 1 and 2. **The floors stay tight on
purpose:** of 249 gov.uk rows, 82 carry the £1 minimum placeholder and exactly
one carried the £2 maximum, with nothing between £3 and £99 — so a wider net
buys no coverage and would start nulling genuine micro-grants.

> Worth naming, because it is the second time this shape has cost us a row: the
> helper was correct, complete and well commented, and the bug was that one
> caller did not use it. Tests over the helper alone would all have passed. The
> new `crawl-award.test.ts` therefore drives the real AI Growth Lab record
> through `normaliseFindAGrant`, and was confirmed to fail against the old
> wiring before the fix was restored.

**Then the same row's deadline and link, on Paul's go.** Reading the guidelines
to fix the amount surfaced two more defects on the Tree Foundation row, both
from the same unevidenced discovery-feed import.

*It advertised a rolling deadline and had none.* The guidelines set a hard end:
open from 29 June, first assessment round 1 October 2026, then first come first
served while funds remain, closing **11 December 2026**. Now `deadline`
2026-12-11 with `is_rolling` false.

*Its apply link was a bare login wall.* `grantplatform.com` 403s to any
non-browser fetch, which is why the engine could never read it and had already
flagged the row `fixable_link: wrong_fund`. Re-pointed to the funder's own
`/uk-grants`, checked first against the three tests the gate actually applies:
it names this fund, it carries application detail (land-access eligibility, the
guidelines PDF, a Start application link), and it covers one fund not several.
Stored in canonical `www` form because the apex 301s.

**The two writes were given deliberately different trust, and the reason
generalises.** `apply_url` is `admin:` and pinned — the right front door does
not expire, and nothing should revert it to the login wall. `deadline` is
`manual_extract:` (50) and **not** pinned, because this date dies with the round
and pinning it would block enrichment from ever moving it. Trust 50 still
outranks the crawl (40) and the discovery feed (25) that put the wrong value
there, so it cannot silently revert. Per `grant-merge.ts`: "Confirming a
correction is not the same as deciding it must never improve."

> Migration 056's trigger was confirmed working in passing: writing the deadline
> set `verify_due_at` to null by itself, so the row is queued for the engine to
> re-read rather than waiting for its 30 August slot. `_page_read` was moved off
> `fixable_link: wrong_fund` (the only string that raises the critical
> `page_describes_different_fund` reason) to `admin_relinked`, which clears the
> now-false flag without claiming a machine verification that never ran.

## Archived and live at the same time, 2026-08-18

Eight rows held `pipeline_state = 'archived'` with `is_active = true`. The harm
was not what users saw, since all eight were live and mostly fine. It was that
`archived` removes a row from **every** admin queue, so they were in front of
fundraisers and unreachable by review simultaneously. Paul hit this from the
other end, asking how to find Morrisons in the review queue: the answer was that
no search would ever have found it.

**Reading the pages reversed two of the three hides I proposed from metadata.**
Worth recording, because the proposals looked sound and were built on the verify
engine's own verdicts.

| Row | Proposed from metadata | What the page said | Outcome |
|---|---|---|---|
| American Express | hide, `wrong_fund` | US corporate sustainability reporting, no UK grant route | **Hidden.** Verdict correct. |
| Steel Charitable Trust | hide, `wrong_fund` | Link was fine: two real programmes with apply routes. But closed to new applicants for 2026 | **Hidden, different reason.** Between rounds, reopens 1 Oct 2026. |
| Morrisons Foundation | hide, between rounds | Live "Start Your Application" button on the funder's page | **Kept live.** The row's own claim was wrong. |

Morrisons is the one to learn from. The row said "TBC, between rounds", which
shows users a closed fund, and that claim was unevidenced and contradicted by
the funder's application page. Acting on our own stored field would have
withdrawn an open fund from the catalogue. The `next_open_date` is cleared and
left unpinned.

**Paul then settled the amount and the link the same day:** £20,000, pointing at
`/connecting-communities-grant-request` rather than the homepage. Both applied.
Two things followed from the page rather than from the instruction. `amount_min`
was cleared, because the page states no minimum and the stored £5,500 came from
`scraper:young_camden_foundation` — the same third-party directory that produced
the wrong £500 to £10,000 on Groundwork Grassroots Grants that morning. Two bad
floors from one directory in one day is a pattern worth watching, not a
coincidence. And the new link is what the gate wants anyway: the homepage
carries both Morrisons programmes, which is why the engine kept returning
`multiple_funds` on this row.

**Dropping the typical-award line found the real defect.** Paul asked for the
"£5,500 to £25,000" line to go, since it sat under a £20,000 ceiling. Opening the
brief to remove it showed the brief was a snapshot of **15 January 2026** that
told users, in three separate fields, that the fund was shut:

- `open_status: between_rounds`
- `how_to_apply`: "Applications are currently closed. The funder is undergoing a
  digital upgrade and will reopen with a new website and application process."
- `decision_timeline`: "currently temporarily closed for applications pending a
  digital upgrade"

The digital upgrade has since happened. The site is a rebuilt app with a live
Start Your Application button, so every one of those statements is now false,
and this is where the phantom "between rounds" on the row came from in the first
place. A fundraiser reading the card was told three times not to bother.

So the brief was refreshed against the funder's current page rather than just
having the one line deleted: status open, a real how-to-apply, and the
exclusions completed from "non-registered charities" to the funder's actual
list, which bars CICs, exempt or excepted charities, religious or political
messaging, animal welfare, late or qualified accounts, and **any charity funded
by them in the last two years**. That last one decides whether an application is
possible at all and was missing entirely, which is what house rule 6 exists to
prevent.

> Written at `user_verified` trust (70), not `admin` (100), on purpose. Admin
> auto-pins, and pinning would freeze the whole brief against all future
> enrichment. This brief went stale in seven months and telling the catalogue it
> must never improve again is the opposite of what it needs. 70 still outranks
> `ai_enrich` (60), so a routine re-enrich cannot silently revert it.

**The general lesson:** a stale brief is not evenly stale. The line Paul spotted
was cosmetic; the fields nobody was looking at were telling people a live fund
was closed. Freshness on `funder_brief` should be judged by its `last_enriched`
date, not by whether anything on the card looks wrong.

**Migration 063 stops the pair separating again**, and publishes rather than
hides, because that is what `transitionPipelineState` already says out loud:
`is_active=true` takes a row to published regardless of previous state. Hiding
would have looked more cautious and would silently withdraw funds nobody decided
to withdraw. The rule stays narrow on purpose: `tagged_awaiting_review` + live
is 29 rows of intended behaviour, not the same defect. Proven in a rolled-back
transaction, all three directions, including that a legitimate archive still
archives.

**Untouched and bigger:** 181 rows are `published` while hidden from users. That
is the other half of the same desync and it wants its own pass.

**Still thin on this row:** `who_can_apply` and `exclusions` are both empty, so
it reads "See funder site for eligibility criteria." The guidelines carry all of
it (community-based organisation, bank account in the applicant's name, signed
landowner permission, public or publicly accessible land, indigenous species).
Not filled, as it was outside what was asked.

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
| A3 | Rows the engine found closed, still live (`round_closed`) | **2** | yes | **Engine armed 2026-08-17. 8 acted, 2 held by the abstain rule** | **Done bar the 2** |
| A4 | Rows the engine found are not funding (`not_a_grant`) | **0** | — | Verdict reworded out of existence; no live row carries it | **Closed** |
| A5 | Rows the engine found delisted (`no_longer_listed`) | **2** | yes | **Engine armed 2026-08-17. 8 archived, 2 held** | **Done bar the 2** |
| A6 | Live rows asserting "Rolling" with no evidence (`is_rolling = !deadline`) | **380** | **yes** | Verification engine, **explicit goal of its first scheduled runs** | Tranche 2 |
| A7 | Live rows with no timing information at all | **137** | **yes** | Verification engine, highest-risk recheck class | Tranche 2 |
| A8 | Live rows with a brief written from model memory, not the page | **8** | **yes** | Re-enrich; blocked on some by pins (D1) | Not scheduled |
| A9 | Live rows with invite-only language and no `is_invite_only` flag | **~8** | **yes** | Regex floor from the 10 Aug audit, not re-measured. Needs a pass | Not scheduled |
| A10 | Live rows with an income limit in prose and no structured value | **~30** | **yes** | Same audit, same caveat | Not scheduled |
| A11 | Live rows both `deadline` and `is_rolling` set (contradictory) | **2** | **yes** | Per row, not a bulk fix | **2 cleared 18 Aug. Of the 2 left, 1 is correct and 1 unverified — see below** |
| A12 | Live rows with `deadline` pinned to NULL by an unrelated form save | **15** | **yes** | Unpin; part of the D1 cleanup | Not scheduled |
| A13 | Duplicate live rows on title + funder | **2** | **yes** | Manual merge | Not scheduled |

**A3 to A5 superseded, 2026-08-17.** The engine was armed on the removal classes
and the figures above are now live counts, not the 11 August snapshot. 25 rows
were corrected in the first pass: 8 archived, 8 sent out of view and onto the
watchlist, 9 rolling flags unset. 25 more were held by the abstain rule, four of
them cases where acting would have been wrong — Greggs is still live. The
actions, their quotes and the reversal ledger are in the merge digest and
`reports/removals-2026-08-17.json`.

**A4 is closed for a different reason than it looks.** The `not_a_grant` verdict
was reworded after 25 of the original 38 turned out to be `investment` rows, which
the catalogue carries deliberately. No live row carries the verdict today, so
there is nothing to act on and nothing to review.

**A11 re-measured 2026-08-18: four rows, not eight, and the rule mis-describes
them.** Read row by row against `field_provenance`, "both fields set" turns out to
cover three different situations, only two of which are the contradiction the line
claims:

| Row | Funder | Deadline | What it actually is |
|---|---|---|---|
| HPC Community Fund Small Grants | Somerset Community Foundation | 24 Aug 2026 | **Correct, not a defect.** The cited page reads *"Open year-round. Next deadline is Monday 24 August 2026, by 5pm. Decisions made every 2 months."* Both flags are true of this fund. If a user sees only "Rolling" and not the cut-off, the fault is in the card, not the data |
| One Stop Community Partnership Programme | Groundwork / One Stop | 1 Sep 2026 | **Worse than A11, and live.** The 11 Aug citation reads *"currently closed for applications and will re-open on Tuesday 1 September 2026"* — a re-open date stored in `deadline`. A user reads that as a closing date and applies to a fund that is shut. Needs a decision |
| Skinners' Company Charity Programme | The Skinners' Company | 21 Aug 2026 | **The real A11.** Deadline verified 11 Aug against the funder's page; `is_rolling` untouched since `scraper:hcvs_funding_2026-04-30`. A stale flag on a fund 3 days out |
| Happy Days Children's Charity | Happy Days Children's Charity | 30 Nov 2026 | Both fields written by one `scraper:young_camden_foundation` backfill on 1 May and never revisited. Unverified rather than known-wrong |

This is the proxy problem from `CLAUDE.md` in miniature. "Both fields are set" is a
sentence about the row; the sentence that matters is "could a user read this and be
misled". One of the four is fine, one is a different and more dangerous bug in the
opposite direction, and the count was double the truth.

**Acted 2026-08-18, Paul's go.** Skinners' and One Stop both had `is_rolling` set
false through `mergeGrantUpdate` with source `user_verified:paul-review-2026-08-18`
and the funder's quote attached. Deliberately **not** `admin:`, which auto-pins at
trust 100 and would have frozen the flag against any future page read; and not
`system:` (50), which loses to the existing `user_verified` (70) on One Stop's
deadline. Neither row is pinned. A11 now stands at 2: HPC Small Grants, which the
evidence says is correct, and Happy Days, which is unverified rather than wrong. On
the current reading the class has **no confirmed defects left**.

**One Stop needed a second write the first fix missed.** The reopen-date correction
cleared `deadline` and moved the row between rounds but left `is_rolling = true`.
Invisible while the row is inactive, and wrong the moment it matters:
check-coming-soon hands the row back on 1 September, and it would have returned
asserting Rolling with no deadline, which is A6. A fix that changes a row's timing
state has to sweep the sibling timing fields, not just the one that was wrong.

**How big the reopen-date class is, and the query that hid it**, are recorded once
in section G rather than twice here. The short version: one real row out of the 22
whose deadline carries a citation, with 136 more that no query of this kind can see.

**On Somerset specifically, asked 2026-08-18.** The Somerset row once described as
"live and wrong to users" was `Stronger Communities Fund`, live while the funder's
page read "Closed. Expected to re-open: Autumn 2026". It was corrected on 11 August
and is now `between_rounds_scheduled` and inactive, re-verified 18 August. Its
record sits in `docs/catalogue-structure-worklist.md` under the Somerset
reconciliation, which is where it went rather than out of this ledger. C4 has
carried the funder since the ledger opened on 12 August, unchanged. Section A names
issue classes with counts and never named funders, so no Somerset line was ever
removed from it.

**Noted 2026-08-17, not scheduled: 18 rows carry leading or trailing whitespace
in `title`.** All from `scraper:gov_uk`, three with a leading tab that renders on
the card. Two are live. The fix belongs in the scraper, not in the data — a
one-time SQL trim is overwritten by the next crawl, which this repo has already
learned once. Post-September.

**Noted 2026-08-17, not scheduled: the cycle filter misses post-decision dates.**
`verify-row.ts:1311` filters opening entries out of a page's cycle before
concluding it runs in rounds, but not the dates trustees meet. Drapers'
Charitable Fund and William A Cadbury are rolling funds whose committee diaries
were read as application deadlines; the removal actuator guards against it, so
nothing acted on them, but the extractor still records the wrong thing.
`isPostDecisionEntry` in `deadline-cycle.ts` already exists for exactly this one
level down. Post-September.

**A2 note.** This is the 2026-08-11 verification run, after its same-day
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
| C7 | **Sport Wales** | **Resolved 18 Aug** | Not a split: the three funds the generic row stood for were already in the catalogue. `Sport Wales — Revenue Grants` rejected as a duplicate of the funding index; A Place for Sport already live and rolling; Be Active Wales Fund brought back live; Energy Saving Grant closed for 2026 and now watched | Closed |

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
| D5 | Live rows where at least one field **cannot be corrected from inside the product** | **353 / 642 (55%)** | partly | An unpin affordance, and a reviewed-correction path that writes THROUGH the ladder rather than around it | Not scheduled |
| D6 | — of which the frozen field is `deadline`, **and it is empty** | **48** | **yes** | Same. Nothing automated can put a date on these rows | Not scheduled |

**On the 54%.** Four documents state it, all tracing to one measurement on
2026-07-26 with no query attached. The only pinning figure in the repo with SQL
beside it is 368/742 = 49.6% on 10 August. My measurement today is **341/682 =
50.0%**, using the same definition (a live row with at least one `pinned: true`
entry). The series has been flat at roughly half the catalogue for a month.

### D5: a field an admin has touched has no route back

**Found 2026-08-18, and it is the reason D1 matters rather than a restatement of
it.** D1 counts pins. This counts fields that no automated or reviewed pass can
change, which is a different and larger set, because `mergeFieldUpdate` has TWO
independent gates and only one of them is pinning:

- **Case 3, pinned:** a `pinned` field refuses every non-`admin:` write outright.
- **Case 4, trust:** a lower-trust source is refused regardless of pinning. So an
  `admin:<email>` field at trust 100 blocks everything below it **even with
  `pinned: false`**.

Either gate ends the same way: the value stays until a human retypes it in the
form. There is no in-product path for a verified correction, because every
automated source is below 100 by construction.

**The worked example is Westminster, tonight.** Its `deadline` held 27 March 2026,
the closing date of one scheme on a page listing eighteen, stamped
`admin:paulkilty1@gmail.com` by a form save. A full re-enrichment ran against the
live page, rewrote the brief, and **left the wrong date exactly where it was, with
no error**. Raw SQL was the only thing that could move it. That is the argument in
one row: the correction had to bypass the ladder, so the provenance record now
says `system:` for a value a human decided, on precisely the field most likely to
be wrong.

**Measured today**, 642 active rows, blocking defined as `pinned` OR a real
`admin:` source that is not `backfilled`:

| | |
|---|---:|
| active rows | 642 |
| carry at least one blocking field | **353 (55%)** |
| carry a real `admin:<email>` field | 346 |
| **`deadline` blocked** | **93** |
| **`deadline` blocked AND empty** | **48** |
| `apply_url` blocked | 27 |

The 48 are the sharp end and they are user-visible: a live row whose deadline box
is frozen empty, which nothing automated can ever fill. D3 puts that figure at 15
because it counts only `pinned: true` and misses the unpinned-admin route, which
is the majority of it.

**32 of the 48 are live right now asserting "Rolling".** Blocked deadline,
deadline empty, `is_rolling = true`, `is_active = true`. The card tells a
fundraiser the fund takes applications at any time; that assertion is true only
because the deadline field is empty; and the field cannot be filled by anything
automated. The claim and the thing that makes the claim unfalsifiable are the same
emptiness. Found by the second session, 2026-08-18, and re-derived here.

**This makes D5 a dependency of A6, but only for a ninth of it.** A6 is a standing
priority and the stated goal of the engine's first scheduled runs. Measured today:

| | |
|---|---:|
| live rows asserting Rolling | 351 |
| — with no deadline (the A6 population) | 349 |
| — the engine can read the page and write the date | **317** |
| — **the engine can read the page and the write will be refused** | **32** |

So re-reading drains 317 of them however the engine is tuned, and cannot drain the
other 32 however many passes it makes. A6 can be made much better without the
unpin route and cannot be closed without it. Worth knowing which of those two
things launch needs.

**Three figures in circulation and none of them is this.** `grant-merge.ts:175`
says 392 of 720 (54%) with 53 deadlines pinned to NULL, from 26 July. D3 above
says 54 and 15, from 12 August. Today the pinned count is 336 of 642 (52%) with 15
nulls, and the *blocking* count, which is the one that matters, is 353 with 48
empty deadlines. Quote the definition or the number means nothing.

**And `admin:legacy` blocks nothing.** `trustOf` drops backfilled `admin:legacy`
to 35, below `scraper`, deliberately, so real AI runs can correct the April
backfill. 1,908 fields on live rows carry it. No pinning figure in circulation
separates those from real admin edits, so every count that treats "admin-sourced"
as "frozen" is high, including the first version of this one.

> **The product answer, and it is smaller than both sessions first thought.**
> Confirming a value and freezing it should be different acts. Both of us proposed
> building a reviewed-correction tier that outranks AI without reaching admin
> trust. **It already exists.** `user_verified` sits at 70, and the comment on it
> in `grant-merge.ts` states this exact principle, unprompted, from whenever it was
> written: *"NOT `admin` (100), because admin auto-pins and pinning freezes the
> value for good. Confirming a correction is not the same as deciding it must never
> improve."*
>
> So no new tier needs designing. What the release affordance has to DO, though,
> was wrong in the first version of this note, and the correction is the useful
> part.
>
> **An unpin button frees nothing.** Case 4 derives trust from the source STRING,
> not from the pin, so an `admin:<email>` field is at 100 whether pinned is true or
> false. Clear the pin and `user_verified` at 70 is still refused, now as
> `lower_trust` rather than `pinned`. All 353 rows stay exactly as frozen and only
> the error message changes. To free a field the affordance must **re-stamp or drop
> the source**. Caught by the second session, 2026-08-18, against my own wrong
> conclusion.
>
> **And the pin default is two load-bearing lines, not one.**
> `update-grant/route.ts:57` reads `const pinned = isAdminSession ? true : (...)`,
> deliberately, under a comment saying admin callers cannot be downgraded. Then
> `grant-merge.ts:215` sets `pinned: true` **unconditionally** for any `admin:`
> source overriding a non-admin one, ignoring what the caller passed. Fixing either
> alone leaves the other pinning. Both are one-line changes and both are the branch
> that stops an AI run clobbering a deliberate human correction, which is the whole
> point of the ladder. Changing the default is a decision about which failure we
> prefer, not a tidy-up.

### What releasing the 353 rows would actually take

`grant-merge.ts:212` already writes `previous: { source, value }` for exactly this,
calling it "a future reset to scraper value affordance". Measured today, that
covers less than a third of the problem:

| | |
|---|---:|
| blocked fields on live rows | 906 |
| — carry a `previous` that could be restored | **279** |
| — **carry no `previous`** | **627** |
| blocked `deadline` fields with a `previous` | 15 |
| blocked `deadline` fields with none | **78** |

**Careful with what the 627 means**, because the first version of this note said
they were all first writes and that does not follow. `previous` is written only
when an `admin:` source overrides a NON-admin one (grant-merge.ts:216), so its
absence covers three different histories: a genuine first write, an admin
overwriting an earlier admin value, and a pinned non-admin source that never
qualifies for a `previous` at all. 617 of the 627 carry an `admin:` source and 10
are pinned under a single non-admin source. The entry cannot tell you which
history applies, and that is the point: **for 627 fields the provenance record
cannot say what the field held before, so there is nothing to reset TO.** The mechanism is **release the
field to be re-derived**: drop or downgrade its provenance entry and let the engine
read the page. That is not novel here either. It is what was done by hand on
2026-07-09 to the 12 Scotland-batch rows, where `field_provenance` entries for an
`admin:gap-audit-*` source were stripped so `ai_enrich` could write again.

**The safe first tranche is 41 of the 48, not all of them.** My argument for the
batch was that an empty box records no human decision. The second session tested
that against the signature the `mergeFieldUpdate` comment names, how many fields
share one `set_at` second, and it does not hold for all 48:

| | |
|---|---:|
| stamped alongside 1 to 11 other fields in the same second, a form save | **41** |
| **stamped ALONE**, which is what a decision looks like | **7** |

All 7 are `admin:paulkilty1@gmail.com`, none has a `previous`, 6 of the 7 also
assert `is_rolling`, and 4 of them were stamped inside ten minutes on 29 July,
which reads as a sitting rather than a save. **Three are `funding_type = in_kind`**
— In Kind Direct Charity Network Membership, The Hygiene Bank Products for
Organisations, Microsoft for Nonprofits — and for a product or membership scheme an
empty deadline is the structurally expected answer rather than an artefact.
Releasing those would hand the engine permission to replace a correct human answer
with a guess.

Nobody has checked the pages, so this says only that the 7 carry a decision
signature and the 41 carry an artefact signature. Neither session is claiming the 7
are right — the in-kind reading is from `funding_type`, and the rest is from
titles, which is exactly what cost three of the first twelve URL corrections. The
point is that they must not ride along in a batch whose whole justification is that
no judgement is involved.

So: **41 released with no judgement and a report file, 7 held for a page check.**
One of the 7 goes the other way and is worth releasing on its own — Catch22
GoodTech Ventures Accelerator is empty AND `is_rolling = false`, so it asserts
nothing at all to anybody, which is A7 rather than A6.

**Done 2026-08-18.** The 41 were released, 0 failed, with the removed entries in
`reports/deadline-releases-2026-08-18.json` — the only copy, written before
anything was touched. The batch was re-derived from scratch before running and
came to the same 41 and the same 7, independently of the session that found the
split.

| | before | after |
|---|---:|---:|
| live rows with a blocked AND empty `deadline` | 48 | **7** |
| of those, asserting Rolling to users | 32 | **7** |
| rolling rows with no deadline the engine can now write to | 317 | **342** |

The 7 held are Arts Council National Lottery Project Grants, London Social and
Affordable Homes, Eleanor Rathbone, Catch22 GoodTech, In Kind Direct, The Hygiene
Bank and Microsoft for Nonprofits. Each needs a page read, not a rule.

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
| G5 | Cyclical funds gone dark after one round's deadline, with no `deadline_cycle` to roll them forward | **0** (was 19) | was **yes, as absence** | All 19 read against their funder page on 18 Aug and dispositioned | **Closed 18 Aug** |

**The 19, found and closed 2026-08-18.** Found while splitting Sport Wales, and
the reason that row was worth looking at. Be Active Wales Fund runs three windows
a year and its stored `deadline` was **9am, 8 July 2026, the date the window
OPENED**. The expiry cron read it as a closing date, so the fund went dark on the
day it became available and stayed dark for six weeks while open.

The query: inactive, `pipeline_state = 'published'`, `deadline` in the past,
`deadline_cycle` null, and a brief describing recurring windows. It returned 19,
and returns 0 now. Every one was read against the funder's own page the same day,
never against its brief, and the quote is in `field_provenance` under
`system:cyclical-deadline-sweep-2026-08-18`.

| Disposition | Rows | Which |
|---|---:|---|
| **Open today, brought back live** | 4 | Hilden Charitable Fund (closes 27 Aug), UnLtd Awards (31 Aug), Barclays Community Sport Fund (4 Nov), Richmond Foundation (no dated deadline at all, so rolling) |
| Closed, next opening date published | 8 | 5 Postcode trusts, Magdalen Hospital Trust, Severn Trent, Inman Charity. Hidden, cycle written, `next_open_date_parsed` set, so check-coming-soon returns each to the queue on the day it opens |
| Closed, cycle known but next date only an annual roll | 3 | Blackford, Anglian Water, Esmée Fairbairn. Cycle written, no reopen date invented; the funder watchlist is the trigger |
| Needs a human, not a date | 3 | Horsham (page behind Cloudflare, reader proxy blocked too), Virgin Media O2 (page states no dates at all), Westminster Community Fund (one row over ~18 council funds, a C-class split question). Moved to the review queue |
| Withdrawn | 1 | DHSC ASC Digital, a one-off May 2026 procurement whose listing now 404s |

**Three residuals, none of them this issue.** Hilden carries `amount_max` of
£500,000 against a brief saying grants are typically £5,000, which is A-class and
was not touched here. The Barclays row's £1,000 describes the access strand,
which is closed for 2026, while the strand that is open is the coaching one. And
a second Barclays Community Sport Fund row, added by discovery on 15 August
against the sponsorship page rather than the application portal, was found during
the sweep and rejected as a duplicate.

**What would stop the next one.** Nothing here was a code change. An opening date
parsed as a deadline is a single wrong field that silently removes a fund from
the catalogue, and the row looks healthy the whole time it is wrong.

**The same error on a LIVE row, 2026-08-18.** Flagged by the second session while
this ran, and it is the worse direction: One Stop Community Partnership Programme
was live showing 1 September 2026 as its deadline, and its own verified quote read
"currently closed for applications and will re-open on Tuesday 1 September 2026".
A user reads a closing date and applies to a shut fund. Now hidden, watched, and
due back in the queue on the day it opens.

Counting the class found 3 candidates and 2 of them were correct (a citation
saying "opens on 2 July and closes on 3 September" against a deadline of
3 September is right, not wrong). So **one row, out of the 22 it is possible to
check.** 158 live rows carry a future deadline and only 22 have a citation on
that field, so the other **136 are invisible to any check of this kind** — there
is no quote to read. That is the honest bound, and it is D4 with a number
attached: a cleverer query cannot see them, only verification can.

> And a warning about the query itself. The first version carried
> `citation !~* 'clos'`, on the reasoning that a reopen note would not mention
> closing. One Stop's citation contains the word "closed", so the filter deleted
> the only true positive and the check returned zero. It could not fail. Same
> lesson as the readiness-probe rule, one layer down.

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

**H3 — discovery adds funders the catalogue already holds, including ones
already rejected. Measured 2026-08-19.**

The discovery queue added 8 rows overnight. **All 8 were funders already in the
catalogue, and 4 of the 8 were funders that already had an archived or rejected
row.** Withdrawn the same morning; prior state in
`reports/withdraw-discovery-dups-2026-08-19.json`.

| Row added | Already held as | State it was already in |
|---|---|---|
| CAF Venturesome | `1df738d5` CAF Venturesome Impact Fund | **published and live** |
| Charity Bank Social Enterprise & Charity Loans | `72739682` Charity Bank Loans for Social Purpose | published and live |
| Bridges Evergreen & Social Impact Funds | `5db10efd` Bridges — Social Outcomes Fund, **identical apply_url** | archived April |
| Unity Trust Bank Social Enterprise Lending | `eb8b4219` Unity Trust Bank — Social Enterprise Banking | archived April |
| Big Issue Invest Loan Finance | 7 existing Big Issue Invest rows | 3 named funds among them |
| Key Fund Social Enterprise Loans and Investment | 11 existing Key Fund rows | 6 live |
| Resonance Enterprise Investment Fund | `250e4dea`, and the link is `/for-investors/` | — |
| Responsible Finance CDFI Loan Finder | not a fund; a directory of other lenders | — |

**Two distinct failures, and the second is the worse one.**

1. **No dedup against what we hold.** CAF Venturesome is the clearest case
   because it is the one that looks least like a duplicate: the fund is already
   published, on the same site, and the new row still got through because the
   funder string differs — `CAF Venturesome` against
   `Charities Aid Foundation (CAF)`. A title-only or funder-only check cannot
   see that. The catalogue's existing dedup rule is title+funder, which is
   exactly the pair that fails here.

2. **No memory of rejection.** Bridges was added with the *same apply_url* as a
   row archived in April. Nothing consults prior dispositions, so a human
   decision to put a funder away does not survive the next discovery run. This
   is the archive-asymmetry problem from the other direction: additions are
   gated by review, but review's *outcomes* are not fed back to the thing doing
   the adding.

**What would fix it**, in order of cost:

- Before insert, reject any candidate whose `apply_url` already exists on any
  row in any state. Cheapest, catches Bridges and both homepage re-adds.
- Then reject any candidate whose normalised host + fund name matches an
  existing row, ignoring the funder string. Catches CAF Venturesome.
- Then check prior disposition: if a row for this funder is `archived` or
  `rejected`, route the candidate to review with that history attached rather
  than adding it silently.

Not scheduled. Worth noting the cost of leaving it is not just review time —
Key Fund is at 12 rows and Big Issue Invest at 8, and every future duplicate
makes the funder-level picture harder to read for whoever eventually splits or
consolidates them.

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

## Community foundations: a scheduled feed, not a split

**Ruled by Paul, 2026-08-17. This is the design; none of it is built.**

17 of the 48 generic rows are community foundations — one row each called
"— Grants" or "— Community Grants", standing in for a funder that runs 5 to 20
named funds. They are **not** to be split the way City Bridge was.

The answer is a **scheduled feed per foundation**:

- each CF's funding-index page is monitored, as the watchlist already monitors
  index pages
- a named fund **over £5,000** is ingested as its own row
- anything smaller stays under the foundation

**£5,000 is a real floor, not a tidy number.** One of Paul's cohort charities
will not apply for anything under it, so smaller funds are noise in a match list
— and CF funds are frequently £500 to £2,000, open for a few weeks, and
geographically tiny. Splitting all 17 without the floor would add hundreds of
rows that go stale within a month, which is the opposite of the problem this
work exists to fix.

Most of the machinery is already there: **82 index pages were banked on
2026-08-17** into `funding_index_url` (migration 061), and `funder_watchlist`
already watches listing pages and enrols rows on entering
`between_rounds_scheduled`. What is missing is the per-foundation schedule and
the £5k ingestion rule.

**September work.** It supersedes the older "one row per community foundation"
convention only in that the front-door row stays AND large named funds rise out
of it; the convention itself is not being reversed.

### The feed must handle funds that have no page of their own

**This is the design constraint, and it is not the City Bridge shape.** Measured
2026-08-17 by enumerating 215 funds across 23 generic rows:

| | |
|---|---:|
| funds found | 215 |
| clear the £5,000 floor | 51 |
| correctly under the floor | 41 |
| no amount stated on the index page | 123 |
| **clear the floor AND have their own page** | **1** |

**47 of the 51 that clear the floor are listed by name on the index page with no
link of their own.** Salford CVS 13, Community Foundation North East 9, Norfolk
7, Somerset 7, Suffolk 7. That is how the sites are built, not a gap in
extraction, and splitting them would have produced 47 rows all pointing at the
same URL — the generic entry with extra steps.

Paul, 2026-08-17, on seeing that: *"Don't split. Everything else goes to
September as the scheduled feed, which is now clearly the right shape rather
than the fallback."*

**So the feed cannot assume a fund has a page.** A CF fund row's link will
usually be the **foundation's index**, and the fund's identity has to come from
its **name, amount and dates** instead. Three things follow for whoever builds
it:

1. **`apply_url` is not the identity.** Several rows under one foundation will
   share it. Dedup must key on funder + fund name, not on URL — the existing
   `stage-researched-grants.ts` dedup keys on BOTH and would reject every fund
   after the first.
2. **The publish gate will block them.** `page_describes_different_fund` fires
   when the engine reads an index page and does not find that specific fund on
   it, which is exactly what will happen. Either the gate needs a notion of "row
   legitimately shares its funder's index", or these rows never publish.
3. **Staleness has no per-fund signal.** With no page to re-read, the only
   freshness evidence is the index page changing. That is precisely what
   `funding_index_url` (migration 061) and `funder_watchlist` are for, and it is
   why the 82 index pages banked on 2026-08-17 are the seed rather than a
   by-product.

The City Bridge case worked because its five funds are large, long-running and
separately paged — the opposite of this on all three counts. Do not generalise
from it.

> Related and already done: the National Lottery Community Fund was the other
> shape — three nation-level rows that looked generic and turned out to sit on
> top of a funder split long ago, with ~20 live programme rows already in the
> catalogue. The three were withdrawn rather than split. Dedup found that;
> staging would have created twelve duplicates.

---

## Live and wrong, worked 2026-08-18

**The first bucket taken from the review queue as defined work.** 30 on the admin
screen, 20 by the gate's own `attention` set; the difference is rows the page pulls
in from elsewhere. All 20 read against the funder's own page the same day.

| Disposition | Rows |
|---|---:|
| Changed | 12 |
| Correct as they stood, gate flag wrong | 2 |
| Left alone, could not be settled | 6 |

**The fault was not what the queue is built to catch.** Only ONE of the twenty was
a stale date. Seven were **a money figure that was not a per-applicant award**:
Google.org's £95,000 (Workspace and ad credits), Clore's £15,000 (training fees),
SSE's £15,000 (no figure on the page at all), the Sainsbury fund's £10k–£100k (the
funder takes no unsolicited applications and publishes no range), Suffolk's £15,000
(its own stated range is £500–£40,000), Asda's £50,000, and the Football
Foundation's £100,000.

**Two were funds that do not exist.** Sported was carrying an "Organisational
Development Grant" that appears nowhere on Sported's site, and Ffilm Cymru a
"Production Fund" that appears nowhere on theirs. Both funders are real and fund
real things, so both rows were re-pointed at the funder's actual programme list
rather than withdrawn.

**Two were gate false positives.** LawWorks and Tesco Stronger Starts both had
`page_describes_different_fund` raised against pages that describe them exactly.
The check looks for a discrete fund and finds none on an in-kind or front-door
row. Worth knowing before anyone treats that flag as evidence.

**And one row's data came from another funder's scraper.** The Football Foundation
row carried a £100,000 ceiling and a homepage link both written by
`scraper:young_camden_foundation`. It was a duplicate of a better row that already
held the correct £25,000 and the right page, so it was withdrawn.

Withdrawn: National Pro Bono Centre (supports the charities that broker pro bono
work; nothing for a fundraiser to apply for) and the duplicate Football Foundation
row. Taken out of view: Asda Foundation, every programme closed, next opens autumn
2026.

**Six left alone, deliberately.** Beinneun Community Fund is live with a deadline of
24 August that two reads could not confirm and that a cron derived rather than read
off the page. Theatre Breakthrough Fund (North), ChangemakerXchange and the Leeds
CF mental-health fund are unreadable even through the reader proxy. Gulbenkian's
page never says whether it accepts applications. Smallwood's is a hub of seven
programmes with no amounts on it. A floor beats a ranking: none of these cleared it.

All writes stamped `user_verified:live-and-wrong-2026-08-18`, unpinned, with the
funder's quote attached, and every field checked for a pin before it was touched.

---

## Link needs fixing, worked 2026-08-18

**47 rows, of which 28 changed.** The bucket is named for links and was mostly not
about links.

| Disposition | Rows |
|---|---:|
| Withdrawn as duplicates of a working row | 13 |
| Withdrawn: no application route, closed one-off, out of scope, or not a fund | 7 |
| Link re-pointed (funder moved, not closed) | 3 |
| Amounts or dates corrected | 5 |
| **Unreadable: Arts Council England sits behind a CAPTCHA** | **7** |
| Assessed as gate false positives, ready for a publish decision | 6 |
| Need enrichment rather than a link fix (brief is empty) | 6 |

**Duplication, not dead links, was the dominant fault.** Thirteen of the twenty
withdrawals were funds a working row already carried. The scale underneath: UnLtd
had five rows, two of them with an identical title AND identical URL. Lloyds had
three pointing at the same `/funding/` page. Two Arts Council rows and two Power to
Change rows were each one fund entered twice, all four created by
`discovery_queue`. SSE is split across two spellings of its own funder name, which
is C2, and is why its duplicates never matched each other.

**Dedup on `apply_url`, not on funder.** Matching on funder produced 76 hits that
were nearly all noise, because every named fund at a community foundation shares a
funder. Same URL is the signal. That correction came from the second session after
it made the mistake first.

**One open fund was sitting hidden.** London Community Energy Fund, deadline
30 September 2026, £10,000 feasibility and £60,000 delivery streams, explicitly for
small organisations with charitable aims in London.

**Three amount figures were the programme, not the award:** the GLA Community
Housing Fund's £38m, the Local Innovation Partnerships Fund's £2m minimum bid, and
the Mental Health in Schools £650,000, which the page states is *one* grant. A
fourth, Social Investment Business, carried a floor of **£5**.

### Two findings that are not about these rows

**`page_describes_different_fund` misfires on front doors.** It fired on LawWorks,
Tesco Stronger Starts, Ashoka, City Bridge, Nationwide, Baring and SSE Start Up,
all of which point at a page that describes them correctly. The check looks for a
discrete named fund and a front-door row does not have one. Roughly half this
bucket and a quarter of the previous one. The fix belongs in the check, not the
rows, and until it lands this flag should not be read as evidence.

**`url_status` cannot see a soft 404.** `powertochange.org.uk/our-funds/` returns
the site's own "We could not find that" page with a 200, and the validator records
it as `ok`. Any funder whose CMS soft-404s can hold a dead link that passes
validation indefinitely.

**And Arts Council England cannot be read by anything we have.** 13 rows, 7 in this
bucket. Both the fetcher and the reader proxy get a bot-protection interstitial, so
the verification engine cannot read them either, ever. These rows are blocked on a
funder rather than on a decision, and no amount of queue-working will move them.

---

## Discovery re-adds funds the catalogue already has

**Measured 2026-08-18, prompted by Paul noticing CAST was already in.** He seeded
it on 11 March; that row was archived; `discovery_queue` then created the same
organisation twice more, in July and August, under names that appear nowhere on
CAST's site.

| | |
|---|---:|
| rows discovery has ever created | 93 |
| still sitting in the review queue | 38 |
| **duplicate a fund already in the catalogue** | **24 (26%)** |
| — of those, still awaiting review | 11 |
| — of those, live to users | 3 |

**The dedup misses them because it keys on exact title AND exact URL, and
discovery varies both.** The pairs are unmistakable to a human and invisible to a
string match:

| Discovery created | Already present |
|---|---|
| Community Matters | Waitrose Community Matters |
| Tesco Bags of Help — Community Grants | Tesco Community Grants (Bags of Help) |
| Screwfix Foundation — Building & Repair | Screwfix Foundation Grants |
| Time to Shine Fellowship | Rank Foundation — Time to Shine |
| Kent Community Foundation | Kent Community Foundation Grants |
| Postcode Society Trust Grants | Postcode Society Trust (South England…) |

**Social Business Trust is the case that defeats a URL match as well.** Three rows,
two from discovery, across two domains the funder both uses —
`socialbusinesstrust.org` and `sbtrust.org.uk`. Neither title nor URL nor domain
matches, and all three are the same offer.

**A quarter of discovery's output is work that should not exist.** Each duplicate
costs a review, and the eleven in the queue tonight are a standing tax on every
future queue-clearing session. This is an intake fix, not a queue fix: dedup needs
funder identity, not string equality, and a new row landing on a funder already in
the catalogue should be flagged for a human rather than created silently.

**Two were live to users and are now withdrawn.** The Postcode Society Trust copy
was the harmful shape: live, carrying no round dates, so it read as open, while the
canonical row correctly sat out until round 3 opens on 25 August. Its £20,000
ceiling was real and was carried across before the row was withdrawn.

> Related and already recorded: `crawlUfiVocTech` invented a fund outright, and
> `stage-researched-grants.ts` dedup keys on both title and URL, which the CF feed
> design already flagged as wrong for funds that share a funder's index page. Same
> weakness, arriving from a different direction.

---

## The verification bill was a scheduling bug, not a cadence

**Two sessions gave Paul different numbers on 2026-08-18. Both had measured the
same money.** $15.01 is the TOTAL spend since the engine was armed on 15 August,
four days, not a week. One session labelled four days as a week and annualised it;
the other called it "total ever" and predicted it would fall as the backlog
drained. The label was wrong and so was the prediction.

**The real driver.** `select_verify_batch` treats `verify_due_at IS NULL` as due,
which is right for a row nothing has looked at and ruinous for a row that was
looked at and never scheduled: it is permanently due, gets picked every cycle,
re-read, and stays permanently due. Measured against the 961-row pool:

| | before | after |
|---|---:|---:|
| genuinely due now | 4 | 4 |
| resting on a future date | 739 | **923** |
| due only because `verify_due_at` is null | **218** | **34** |

The engine was reading 240 pages a day — its batch cap, four runs of sixty —
against a real demand of four rows.

**Of the 218, 157 had been read successfully.** 128 of those had no timing change
since the read, so nothing should have made them due again: the run recorded the
evidence and never wrote the schedule. A further 67 were reads that FAILED the
gate — `wrong_fund`, `no_funding_detail` — which also get no due date, which is
precisely the forever the `_page_read` comment describes: *"without this the engine
would re-read the same unreadable page four times a day forever."* The stamp
landed; the nap did not.

All 195 were backfilled by replaying `computeCadence`, the same function the route
calls, against each row's own timing fields and its own read. Not a guessed date:
the date the run should have written. The 34 left null had their timing change
after the read and are due again on purpose, by the migration-056 trigger.

**What this means for cadence.** A cut from four runs a day to one was proposed as
the fix. It is now close to a no-op for cost: with demand at about 38 rows, even a
single daily run of sixty is above it, so the cap has stopped binding and the bill
becomes demand-driven. Cutting it would buy little and would delay a genuinely due
row by up to a day. Worth re-measuring after a week of real spend before changing
the schedule.

**A figure derived from a window needs the window's real extent stated beside it,
and the extent must come from the data rather than the query.** The wrong number
came from running `interval '7 days'` and, separately, reading
`first_run = 2026-08-15` — both on screen — and annualising as though the window
were full. No amount of care writing SQL would have caught that; only asking what
the number meant. "$15.01 across the four days since arming" cannot be annualised
by accident. "$15.02/week" invites it.

**And "Arts Council" is two funders on two hosts.** `artscouncil.org.uk` is 13 rows
and walled through both paths. `arts.wales` is 15 rows and reads perfectly: 3,975
characters against the England site's 440. Anything keyed on the funder NAME rather
than the host would file fifteen readable Welsh rows as unreadable, which is worse
than leaving them flagged because it looks settled.

**A bot wall cannot be detected by length.** The `artscouncil.org.uk` interstitial
is 440 to 491 characters depending on path — above any plausible "too short to be
real" floor, and it is a successful HTTP response containing prose. Two separate
tools tonight used a size threshold (200 and 400 characters) and both would have
passed it to a judgement step as page content. The test has to be what the text
SAYS.

**The bug itself is not fixed, only its accumulation.** The route still writes
evidence and schedule as two statements, and its own comment accepts that a lost
second write leaves a null due date. That was a tolerable cost when it was rare. At
195 rows it is the entire bill, so the write needs to be one statement or the null
needs to stop meaning "due now".

---

## Rows that linked a directory instead of the funder, worked 2026-08-19

**Nine rows pointed at a `funding.scot` listing rather than the fund's own page.**
Seven had a real funder page we were simply not linking. Two do not have one at all.

| Disposition | Rows |
|---|---:|
| Re-pointed at the funder's own site | 7 |
| Directory kept: the funder has no website | 2 |

Re-pointed: Inverurie Youth Sports Foundation, S J Noble Trust (our brief carried the
`.com`, which 301s to `.scot`), The Cadogan Charity, Clackmannanshire and Stirling
Environment Trust, Bellahouston Bequest Fund, and Argyll & Bute Council.

**The directory is sometimes the only public record, and that is a finding, not a
failure.** A Sinclair Henderson Trust and the Hugh & Mary Miller Bequest are both
administered by solicitors, apply by post or email, and have no website. Their rows
keep the `funding.scot` link because nothing better exists. Both now carry the
postal route in `how_to_apply` so a user does not have to reach the directory to
find out where the envelope goes. **Do not "fix" these two later — the link is the
answer.**

**Two of the nine were wrong about something the link fix would not have caught.**

*A Sinclair Henderson Trust had a deadline in a year with no meeting.* Its
`deadline_cycle` held an annual 31 May entry labelled "for June 2026 meeting", and
`system:cycle_derive:v1` duly rolled it forward to 31 May 2027. The trust states it
"meet[s] once every even year i.e. 2024, 2026, 2028". There is no 2027 meeting. A
charity working to that date would have posted an application into a year with
nobody reading it. The cycle has been cleared — a recurring (day, month) list cannot
express "even years only" — and the real next cut-off, May 2028, set outright.

**This is a cycle-shape gap, not a one-off.** `deadline_cycle` assumes annual
recurrence. Any biennial, triennial or academic-year fund entered into it will
derive confident, wrong dates every off year, and the derived date looks exactly
like a good one. Worth a sweep of rows whose cycle label names a specific year.

*Argyll & Bute Council's brief said the directory WAS the portal.* "Apply via the
online grants portal at funding.scot" — which is why the link looked deliberate. The
council runs the fund on its own site. The row itself was otherwise right: the
2026/27 round opened 11 May and closed 5 July 2026, matching our stored deadline and
its inactive state. No next-round date is published, so none was invented.

*And one row was right where I expected it to be wrong.* Bellahouston's 31 August
deadline looked like a rush-the-user error until I read the cycle: it already models
the four quarterly trustee cut-offs correctly. Only the URL changed.

## The 115 funds nobody can see, audited 2026-08-19

`between_rounds_scheduled` hides a row from users completely, and 115 rows sit in
it. Paul asked what they are after the Aldi row went in there by mistake. Bucketed
by what the CARD would say — using `formatNextOpen` and `deriveCycleDates`
themselves, not a reading of the data — rather than by what the columns hold:

| Bucket | Rows | What a user would see if it were visible |
|---|---:|---|
| We can name the date | 31 | "Opens 11 May 2027" |
| Derivable from `deadline_cycle` | 6 | same, after one write |
| Shut, return date unknown | 56 | "Closed — check funder" |
| **No reopening information at all** | **22** | nothing |

**Thirty-seven of them are being hidden for no reason a user would recognise.**
Seven open within a fortnight and the soonest is 25 August, six days away. The
names are not obscure: Esmée Fairbairn, the Leathersellers' Foundation, Steel
Charitable Trust, Severn Trent, Youth Music, the four Postcode trusts, the Bromley
Trust's three programmes. A fundraiser planning next quarter cannot find any of
them, and the fund they cannot find is often the one worth preparing for.

**The 22 with nothing to say are the actual risk, and they are not "between
rounds".** `check-coming-soon` is what brings a row back, and it keys on
`next_open_date_parsed`. With no date there is nothing to fire on, so these rows
are not scheduled to return — they are hidden indefinitely, and nothing in the
system is waiting for them. Last read: oldest 105 days, median 26. They need a
page read or an archive decision, per row. Among them are Lloyds Bank Foundation
Racial Equity Grants, three Arts Council of Wales programmes, National Lottery
Community Fund Step Forward and Ironmongers' Grants to Charities.

**And even for the dated ones, reopening is not the same as reappearing.**
`check-coming-soon` moves the row to `tagged_awaiting_review` and deliberately
leaves visibility alone, so on its opening day a fund lands in the review queue
rather than in front of users, and stays invisible until someone publishes it.
That gap is dead time on a fund that is genuinely open. Surfacing the dated rows
as "Opens ..." now closes it: the row is already visible, and the cron's job
narrows to getting a real closing date onto a row users can already see.

## Surfacing the dated between-rounds funds, 2026-08-19

**31 of the 115 hidden funds are now visible, showing when they open.** Paul
approved surfacing the dated ones rather than hiding them: a fund nobody can find
is worse than a fund a fundraiser can diarise. The first two open on 25 August.

| | Rows |
|---|---:|
| Planned from the audit | 37 |
| Withdrawn as a duplicate before publishing | 1 |
| Made live and naming an opening date | 31 |
| Made live, then pulled back because the card would not say it | 5 |

**The duplicate guard earned its place on the first run.** `discovery_queue`
re-added Asda's Local Community Spaces Fund on 15 August, six months after the
funder's own scraper had it, pointing at a third-party blog instead of
asdafoundation.org. Publishing both would have put the same fund in front of a
user twice with two different amounts. The guard aborts the whole run on any
collision rather than picking a winner, and it was tested by removing the
exclusion and watching it abort.

### The floor was in the wrong place

The script checked what the card WOULD say, then wrote. Five of those writes were
then refused by the trust ladder — admin-pinned `next_open_date`, and `deadline`
values written by `admin:cycle_derive_2026-07-26` — and the rows went live anyway,
because `is_active` and `pipeline_state` are not tracked fields and applied
regardless. **A floor checked before the write is not a floor.**

Worse, those five were invisible to the obvious follow-up query. "Which rows did
my run change" was asked of `field_provenance`, and a row whose every tracked
write was refused carries no provenance from the run at all. Three of the five
were found only by checking every live row with a future opening date, whoever
made it live. **When the fields that change are untracked, provenance cannot
answer "what did I just do" — ask the rendered result instead.**

Two were fixable and stayed live: Suffolk Giving Fund and Steel Charitable Trust
both carried `is_rolling = true` alongside a scheduled reopening, which cannot
both be true, and the card suppresses "Opens ..." on any rolling row.

Three went back to hidden and are Paul's to release, all blocked by his own admin
values: Simon Gibson (`deadline` pinned to the same date as the opening, so the
card renders the opening as a closing date), The Bromley Trust — Grants, Innovate
UK Women in Innovation and Fellowship Fund (`deadline` from `cycle_derive` at
trust 100, sitting in front of an opening date that has not arrived). Forrester
Family Trust is a fourth, blocked differently: its text is correct and unreadable,
"reopens on 05/01/2027 and closes 17/01/2027", because `formatNextOpen` only
parses month names. Its stored parsed date was also a month out and is corrected.

### 11 live funds still show a deadline for a round that has not opened

Found by the same check and NOT touched, because they were live before today and
are a separate decision: Ford Britain Trust, Bristol Impact Fund 3, Schroder
Charity Trust, Jerwood Annual Funding Round, Oake Sunshine Fund, the BRIT Trust,
Innovate UK Growth Catalyst, The Health Lottery Foundation, Tower Hamlets
Community Grant Programme, Better Brighton & Hove Ward Pots and the William
Kendall Small Awards Programme. Each shows a closing date on a card for a fund a
user cannot apply to yet. This is the same fault the Aldi row had, and the reason
`deadline` beating `next_open_date` in the card is worth revisiting as a rule
rather than row by row.

**`formatNextOpen` cannot read numeric dates.** `05/01/2027` renders as "Closed —
check funder". Teaching it that format is a small change that would recover
Forrester and probably others; it is not done here because it changes what every
card in the catalogue can say.

## The 11 live funds whose card and timing disagreed, worked 2026-08-19

Found by the card check, not by the data. Each one read on the funder's page
first, because **the fault was not the same in any two rows and the columns
cannot tell you which field is the stale one.** Two were the exact opposite of
the reported problem.

| Row | What was actually wrong | Now |
|---|---|---|
| Schroder Charity Trust | **Nothing.** Open now, closes 5pm 28 Aug 2026. The "Autumn 2026" OPENING date, set in March, was the stale field | deadline 28 Aug, opening date cleared |
| Oake Sunshine Fund | **Nothing.** Open now, "Apply by: Mon 12th October 2026". Same stale-opening shape | deadline 12 Oct, opening date cleared |
| BRIT Trust | The 30 Apr 2027 deadline was `cycle_derive` rolling the 2026 cycle forward. No 2027 round has been announced | deadline removed, text quotes the page |
| Jerwood | Deadline 3 Feb 2027 **is the opening date** — "Applications open 9am 3 February (closing 2pm 17 March) 2027" | **BLOCKED** — Paul's pin |
| Bristol Impact Fund 3 | Nothing closes 28 Apr 2027. Next timeline published Sept 2027, round runs from Apr 2028 | **BLOCKED** — Paul's pin |
| Ford Britain Trust | Nothing. Opens 1 Sep, closes 31 Oct 2026; the card shows the closing date, which is the useful one | left alone |
| Health Lottery, Innovate UK Growth Catalyst | Nothing. Both hold honest prose saying the next round is unannounced, and the card says "Closed — check funder" | left alone |
| Better Brighton & Hove, Tower Hamlets, William Kendall | Nothing false. "Late 2026" / "Winter 2026" is all anyone has published | left alone, see below |

**Two rows are still wrong on a live card and only Paul can fix them.** Both are
`admin:paulkilty1@gmail.com` pins on `deadline`, which no other source outranks.
Jerwood shows a fundraiser "deadline 3 February 2027" for a round that OPENS at
9am that day and runs six more weeks; the real closing date is 17 March 2027.
Bristol shows a deadline for a round that does not exist. Both writes were
attempted so the refusal is on the record rather than assumed.

**The lesson is the one already in CLAUDE.md, in a new place.** "The card does not
name an opening date" is a sentence about the card. "This fund is shut and we are
showing a closing date" is a sentence about the user, and only five of the eleven
turned out to be that. Two were the reverse — an open fund carrying a stale
opening date — and had the check been trusted as a finding rather than as a
prompt to go and read, both would have been "fixed" into being wrong.

**`formatNextOpen` cannot read a bare season.** "Late 2026" and "Winter 2026"
fall through to "Closed — check funder" even though the season is the only thing
the funder has published. Three live rows are affected. The seasonal branch
already handles "late November", so extending it to a season plus a year is
small — held back only because it changes what every card in the catalogue can
say, which is Paul's call rather than a tidy-up.

## How well the system actually works, measured 2026-08-19

Paul asked how effective the current system is at maintaining accuracy and at
sourcing new opportunities. Both answered with numbers, and the accuracy one with
a sample rather than a coverage statistic, because coverage is the proxy that has
already misled us twice.

### Accuracy: the coverage number is perfect and does not mean what it says

| Measure | Value |
|---|---:|
| Live rows | 625 |
| Live rows never read | **0** |
| Live rows last read more than 7 days ago | **0** |
| Oldest read on any live row | 16 August |
| `_page_read.note = 'verified'` | 413 of 625 |

On those figures the catalogue looks immaculate. So a random sample of 12 live
rows was pulled and each read against its funder's page by hand.

| Verdict | Rows |
|---|---:|
| Correct | 4 |
| Minor error | 1 |
| **Material error** | **3** (was 4 — see the Ferguson withdrawal below) |
| Could not assess (bot wall, or a scope question rather than a fact) | 3 |

The material errors, as first written, one of which did not survive checking:

- **Beinneun Student Scholarship Fund** — "Individuals aged 16 or over who are
  residents of Fort Augustus". A scholarship for individuals, live in a catalogue
  whose audience is charities, CICs and social enterprises.
- ~~**Allan & Nesta Ferguson Trust** — the stored £50,000 maximum appears
  nowhere.~~ **WITHDRAWN the same evening.** The £50,000 is the funder's own:
  its guidance page says "Requests up to £50,000 are reviewed monthly." The
  hand-check read only `apply_url`, which is a login wall stating nothing, and
  called the figure invented on that basis. The verifier, which hops up to three
  pages, found it immediately. `apply_url` pointing at a login wall is still
  worth fixing; the amount was never wrong. **One hand-read page is not the
  funder's position** — the same mistake as judging a URL correction by how the
  URL looked, recorded above.
- **Community Foundation for Northern Ireland** — stored range £2,000–£5,000. The
  page's three open funds are £3,000, £2,000 and £500. The range matches nothing.
- **Emerton-Christie Charity** — stored £1,000–£3,000; the page states no amounts
  at all.

Plus one minor: HPC Community Fund Small Grants caps at £10,000 in our row and
"£20,000 over 3 years, or up to £10,000 if project is 1 year" on the page.

**Roughly one live row in four carries a material error, on a sample of twelve.**
Corrected down from "one in three" the same evening, when building the check
disproved one of the four findings that motivated it. That is enough to act on
and not enough to quote: nine assessable rows puts the true rate somewhere broad
around a quarter. The number worth repeating is the contrast, not the precision —
**100% of live rows were read in the last three days, and something like a
quarter of them are wrong.**

**And the correction is the more useful finding.** An audit done by fetching one
page per row is a weaker instrument than the engine it is auditing, because the
engine reads up to three. Any future spot-check should run `verifyRow` rather
than a single fetch, or it will keep manufacturing false positives on funders
whose apply_url is a form and whose detail is one click away.

**`verify-rows` measures that a page was fetched, not that the row is true.**
Two of the three surviving material errors are AMOUNTS, which is the field a fetch-and-
compare is worst at: the page states no figure, so nothing contradicts the stored
one, and silence reads as agreement. `amount_ungrounded` exists as a reason code;
it is not firing on these rows. Same shape as the two proxies already recorded at
the top of CLAUDE.md.

### Sourcing: volume is not the problem, precision is

Twelve weeks of intake:

| | Rows | Share |
|---|---:|---:|
| Added | 628 | |
| Now live | 183 | 29% |
| Withdrawn as junk, duplicate or out of scope | 255 | 41% |
| Still in the queue | 52 | 8% |

**Two rows are discarded for every three brought in.** Lifetime the ratio is
worse: 960 withdrawn against 625 live. Roughly 50 new rows a week arrive and
about 15 survive, and every discarded row still costs an enrichment call and a
place in the review queue.

Duplication in the LIVE catalogue is now small — 2 title collisions and 2 URL
collisions across 625 rows. The peer session's dedup fix on 19 August is the
reason it will stay that way: the old check loaded `.limit(3000)` into a Set
against a 1,912-row table that PostgREST caps at 1000, so it reported "no
duplicate" for anything in the missing half. Its rule 4 is the one that matters
most — a funder a human archived now survives the next discovery run instead of
being re-added.

### What this says to do next

Not more verification passes. The coverage is already 100% and the errors survive
it. The gap is that nothing tests whether a stored FIGURE is supported by the
page, as opposed to merely unchallenged by it. That is one reason code doing its
job, not a new system.

## The amount check now needs the page to state the figure, 2026-08-19

Built after the measurement above. `verify-rows` never asked about amounts at
all — the comment in `verify-row.ts` said so outright: *"Grant AMOUNTS are
deliberately absent, and not for the usual reason: the verifier does not extract
them at all, so there is no silence to detect."* So a stored figure was never
challenged: nothing contradicted it, and silence passed as agreement.

The verifier now extracts `amount_min` and `amount_max` with a quote, and a new
reason code, `amount_unsupported`, fires when **we assert a figure and the page
states none**. 510 of 625 live rows (82%) assert an amount, so that is the
population.

**The prompt spends more words on what is NOT an amount than on what is**, because
every wrong answer here is confident: the size of the POT ("£2 million is
available this year"), a match percentage ("we fund up to 75% of project costs"),
and an amount belonging to a different fund on the same page all have to come
back null. A figure invented from the funder's size is worse than no figure.

**Absence is still not a finding.** `no_amount` already covers a row with nothing
to show, and an absent amount renders as absent and misleads nobody. This fires
only where a number is on the card and the funder never published it.

**It is `info`, not blocking, on purpose.** The case for blocking is real — a
figure the page does not state is wrong rather than missing, which is the test
every blocking code meets. But the check has never run against the catalogue.
Blocking on the first pass of an unmeasured extractor would hold an unknown
number of correct rows on the word of a model nobody has scored on this field,
and it would change what auto-publish does and bump the policy version. Fire rate
first, then Paul's decision.

### Building the check disproved one of the findings that motivated it

The probe runs the real verifier against four rows whose truth was established by
hand, three that should fire and one that should not. It came back 2 of 4, and
both misses were the probe being wrong:

- **Allan & Nesta Ferguson** — the hand-check called its £50,000 invented after
  reading `apply_url`, which is a login wall stating nothing. The verifier hopped
  one page to the funder's guidance and returned *"Requests up to £50,000 are
  reviewed monthly."* The figure is the funder's own.
- **Community Foundation for Northern Ireland** — the read stops at the gate with
  `multiple_funds`, before any fact is extracted. That is the correct verdict and
  a different problem: the row needs splitting, not its figure checking.

**An audit that fetches one page per row is a weaker instrument than the engine it
is auditing.** Future spot-checks should run `verifyRow`, not a single fetch, or
they will keep manufacturing false positives on funders whose apply_url is a form
and whose detail is one click away.

Ferguson also exposed a real bug in the first version. The unsupported note was
stamped on BOTH amount fields whenever the page was silent, so a row with no
minimum carried "we state a figure this page does not" against a figure it does
not state. And because a row is read across up to three pages, the first page
could stamp "unsupported" and a later hop confirm the same figure. The writer now
notes only fields the row actually asserts, the reader treats a confirmation
anywhere in the read as outranking silence elsewhere in it, and `foldResult`
drops the stale note from the cron report. **A check that reads one page of a
three-page read is the same class of error as the audit that produced it.**

Probe now 4 of 4. Nine unit tests, including both halves of the Ferguson case.

## Sub-tags on investment and programme rows, 2026-08-19

Paul's idea: *"for the investor and programmes funder types, it would be good to
have sub tags on each card to label what they are."*

**Most of it already existed and nobody had noticed.** `funding_subtype` was a
single text column, in the view, rendering as a pill on the search card, editable
in the admin form, and read by the matcher against
`organisations.funding_subtype_preferences`. What was missing was the data
quality, the plural, and the filter. Worth remembering before the next "let's
build X": the check is five minutes and it changed what this piece of work was.

### One value per row was forcing a lie

38 of the 69 live rows carry more than one tag. Access is blended finance AND a
loan AND social investment. Trust for London does loans AND equity. The Fore is a
grant AND a support programme AND training. Averages after tagging: 2.0 per
investment row, 1.6 per programme row.

`funding_subtypes text[]` is now the source of truth, with a database trigger
keeping the singular equal to its first element so the matcher and the admin form
did not have to change. **The trigger's first version was wrong** and the
round-trip test in migration 065 caught it: it asked whether the array was
non-empty rather than which column had been written, so an admin editing
`funding_subtype` on a row that already had an array would have watched the
change revert silently.

### The existing tags contained real errors

Fredericks Foundation — whose entire product is *"repayments are based on a
percentage of revenue"* — was tagged `equity`. Black Seed VC, which writes
£100k-£400k cheques, was `social_investment`. The Energy Resilience Fund, *"40%
grant and 60% loan"*, was `loan` alone. Cross-type contamination was widespread:
grant rows carried `equity` and `pro_bono_consulting`, programme rows carried
`restricted` and `small_grant`.

### Twelve programme rows are not programmes

The taxonomy did diagnostic work, which was the argument for doing it at all. Ten
are plain grants with "programme" or "fund" in the name — **AI For All, Co-op
Belong, Doc Society, Dormant Assets for All, DWF Foundation, Horizon Europe
Cluster 3, Skinners' Company, Strengthening Organisations, The Climate Change
Collaboration, Youth Matters Fund**. Two are neither: **Gatsby** commissions its
own research in partnership rather than accepting applications, and **Social
Enterprise NI** signposts other people's funding.

They are tagged `includes_grant` and left where they are. Retyping moves a row
between tabs, which changes what a user finds where — **Paul's call, not a tidy-up,
and it is not done here.**

### Also visible: the investment tab is not all for this audience

Start Up Loans and its South West franchise are personal loans for people
starting a business. Black Seed VC and Bethnal Green Ventures buy equity in
startups. Innovate UK Innovation Loans fund late-stage commercial R&D. S J Noble
lends to rural businesses. None is wrong as a record; all sit oddly in a
catalogue for charities, CICs and social enterprises, and the `equity` tag now at
least says so on the card — **a registered charity has no shares to sell.** Same
question as the gov.uk withdrawal on 18 August, and unanswered.

### What the filter does and does not offer

A row in the existing filter panel, on the investment and programme tabs only.
Options carry a count and any with no rows are not rendered: `quasi_equity`,
`convertible`, `fellowship` and `cohort_grant` are real instruments the catalogue
does not hold, and offering them would empty the screen with no visible reason.
Selections clear on a tab change, because a filter that is not rendered on the
tab you are looking at must not still be filtering it.

**The exhaustive-deps lint caught a bug that would have shipped.** `activeSubtypes`
went into the wrong `useMemo` dependency array — an earlier one, not the memo that
owns the predicate — so ticking a box would have done nothing until some other
state change forced a recompute. Intermittent, and invisible to `tsc`.

## In-kind sub-tags, 2026-08-19

Same job as investment and programme, and in-kind had the worst tags of the four.

**Microsoft for Nonprofits was tagged `office_space`.** The classifier had read
"Office 365". Slack was `pro_bono_consulting`. Cranfield Trust, Taproot and
Charterpath were all `volunteering`, which reads as "we will send you helpers"
rather than "a qualified accountant will do your year end". 23 of the 50 rows had
no tag at all.

**Two codes added, because the gap was real rather than a matter of taste.**
`goods` covers physical things being given away, which nothing did: FareShare's
food, the Hygiene Bank's products, Selco's and Wickes' building materials, In Kind
Direct's whole catalogue, TechSoup's hardware and the Digital Inclusion Network's
refurbished devices. Nine rows. `mentoring` separates one person's time from a
team doing the work, which is a different offer and a different ask.

45 of 50 tagged, 20 of them with more than one tag.

### Five rows are not in-kind support, and one is a duplicate

Left untagged rather than given a label that would hide the problem. **A wrong
label is worse than none**, so the two that were already carrying
`pro_bono_consulting` had it removed.

| Row | What it actually is |
|---|---|
| Theatre Tax Relief | a Corporation Tax relief for companies producing theatre |
| TheGivingMachine | its own page: "This is not a grant scheme — it's a fundraising platform" |
| Buy Social Corporate Challenge | its own page: "This is not a grant scheme." A procurement partnership |
| UK & Ireland Community Tree Planting | cash at up to £2.15 per tree. A grant, filed as in-kind |
| Yorkshire Universities | its own entry: "not a grant-making funder" |
| Superhighways ×2 | the same organisation entered twice, "London Charities" and "London VCSEs" |

**Across the three tabs, the taxonomy has now found 18 rows filed under the wrong
funding type** — twelve in programmes and six here. That is a better yield than
the labelling itself, and it is the argument for doing grants next.

### The filter is on three tabs, not four

Grants is deliberately excluded. Its sub-types — unrestricted, restricted,
capital — describe SPEND RESTRICTION, which `spend_restriction` already filters
on (migrations 047/048). Two controls asking one question would be worse than
one, and the honest fix there is to decide which axis wins rather than to add a
second.

**Coverage after both passes:**

| Tab | Live | Tagged | More than one tag |
|---|---:|---:|---:|
| Investment | 33 | 33 | 21 |
| Programme | 36 | 36 | 17 |
| In-kind | 50 | 45 | 20 |
| Grant | 497 | 178 | 0 |

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
| 2026-08-18 | Both £2 rows closed: International Tree Foundation to £21,500 (per-tree unit price misread as the award), DBIST AI Growth Lab to null (gov.uk schema placeholder for a programme paying nothing). `normaliseGovUkAward` now also guards `amount_max`; regression test drives the real record. |
| 2026-08-18 | Tree Foundation row also re-dated and re-linked: deadline 2026-12-11 with is_rolling false (was rolling with no date), apply_url off the 403ing grantplatform login onto the funder's own /uk-grants. apply_url pinned, deadline deliberately not. |
| 2026-08-18 | A11 re-measured from 8 to 4, then to 2. Skinners' and One Stop `is_rolling` set false (`user_verified:paul-review-2026-08-18`, unpinned). HPC Small Grants left alone: its page says "Open year-round. Next deadline is Monday 24 August 2026", so both flags are true and any wrongness is in the card. A11's rule mis-describes rolling funds with periodic cut-offs; rule fix post-September. |
| 2026-08-18 | Asked whether Somerset had dropped off section A. It had not: the row once called "live and wrong to users" was Stronger Communities Fund, fixed 11 Aug, verified still correct. Section A carries issue classes and counts, never funder names, so nothing was removed. C4 unchanged since the ledger opened. |
| 2026-08-16 | A3 needs a caveat before it is trusted: the `round_closed` verdict is a deterministic function of the proposed deadline falling in the past (23 of 23 rows, no exceptions), so a year-less date on the funder's page that resolves to a wrong past year produces a false "closed". Confirmed on the Greggs row, which is open for another 12 days. Bears directly on the §12 auto-act decision. |
