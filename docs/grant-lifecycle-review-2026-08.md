# Grant lifecycle review, August 2026

**Date:** 2026-08-11
**Status:** proposal only. Nothing here has been built or changed.
**Method:** code trace of every cron and admin route in the catalogue path, plus live queries against production (`yrndczlqjqtfgissleev`). Every number below is measured, not estimated, unless it says otherwise.

**The aim this has to serve:** streamlined, efficient, accurate, fresh, and cheap on Paul's time and API spend as the catalogue grows.

---

## Headline

Six things, in the order they matter.

1. **API spend is not your problem.** The whole catalogue pipeline costs roughly **$110 a year** at 630 live rows. Even tripling the catalogue and doing everything wrong keeps it under $200. Optimising for money here is optimising the wrong variable.

2. **Your time is the problem, and the system manufactures work for you.** Roughly one in five re-enrichments produces a tag diff that blocks auto-publish and lands in your queue. That is the single largest category of held rows today (42 of 101). It is an artefact of the conveyor design, not a signal about the catalogue.

3. **Throughput, not cost, is what breaks at scale.** Re-enrichment runs 6 rows a day. At 630 live rows that is a 105-day cycle, which roughly matches the 90-day staleness target. At 2,000 rows the same job silently stretches to an 11-month cycle. Nothing errors. The freshness guarantee just quietly stops being true.

4. **The verification engine you need for Part 3 already exists and is wired to nothing.** `src/lib/verification/verify-row.ts` is 738 lines, seven commits of refinement, quote-backed, gate-first. Its only caller is a local script. No route, no cron, no UI, and no table to store a result in.

5. **The two "dead" crons are dead in two completely different ways**, and only one is a bug. `process-discovery-queue` has never been armed (`PROCESS_DISCOVERY_ENABLED` is unset). `check-watchlist` runs perfectly and has written 333 alerts that nothing on earth reads. One is a one-line fix, the other needs a consumer.

6. **Non-grant supply is starving and the cause is two specific defects.** In the last 90 days: 189 new grants, 17 in-kind, 9 programmes, 5 investments. The two feeds that would fix that are the ones broken in point 5, plus a budget-arithmetic bug that permanently skips exactly the queries covering social investment.

---

# Part 1: as-is, with evidence

## The diagram

```
                        ┌──────────────────────── DISCOVERY ────────────────────────┐
                        │                                                           │
  crawl-grants          crawl-cf-funds        discover-sweep         check-watchlist
  Mon+Thu, 9 batches    Mon, 5 batches        Tue 08:30              Sun+Wed 04:00
  44 sources            31 CFs                Sonnet 5 + websearch   240 listing pages
  ~180 rows/run         ✖ DISABLED            ⚠ 2 of 5 queries       ✔ runs fine
        │               (CF_FUND_PIPELINE_    (budget bug)                  │
        │                ENABLED unset)              │                     ▼
        │                      │                     ▼              watchlist_alerts
        │                      │              discovery_queue        333 rows, ALL
        │                      │              54 pending since       unresolved
        │                      │              26 Jul                        │
        │                      │                     │                      ✖
        │                      │                     ▼                 (nothing reads)
        │                      │           process-discovery-queue
        │                      │           Tue 09:30
        │                      │           ✖ NOT ARMED
        │                      │           (PROCESS_DISCOVERY_ENABLED unset)
        ▼                      ▼                     ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  CAPTURE       scraped_grants, pipeline_state='captured'        │
  │                is_active=false, stampNewGrant() stamps          │
  │                field_provenance per field                       │
  └─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  ENRICH → CLASSIFY → SWEEP     process-pipeline-queue, 07:30     │
  │                                                                 │
  │  1. enrich-grant    Haiku 4.5, 4096 tok, fetches page (12k cap) │
  │                     writes funder_brief → flips state to        │
  │                     'tagged' as a SIDE EFFECT of the merge      │
  │  2. classify-grants Haiku 4.5, 8192 tok, batch size ONE         │
  │                     sees title+funder+description only.         │
  │                     NEVER sees the page.                        │
  │  3. sweep           deterministic, no LLM                       │
  │                                                                 │
  │  Any step fails → needs_intervention_reason set, row frozen     │
  └─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  REVIEW GATE      auto-publish, 09:00, ARMED, live               │
  │                   deriveReviewReasons() → 24 reason codes        │
  │                   publish-gate policy c1: 13 block, 10 info      │
  │                                                                 │
  │   0 blocking → publish │ blocking + was live → attention        │
  │                        │ blocking + never live → hold           │
  │   Logged to publish_gate_decisions, every decision, always      │
  └─────────────────────────────────────────────────────────────────┘
             │ publish (4-8/day)          │ hold 43 / attention 58
             ▼                            ▼
  ┌────────────────────┐        ┌──────────────────────┐
  │  LIVE              │        │  YOUR QUEUE          │
  │  630 rows          │        │  156 rows            │
  │  is_active=true    │        │                      │
  └────────────────────┘        └──────────────────────┘
             │
             ├──────────────► validate-urls  Sun+Wed 03:00, HTTP only, no LLM
             │                dead → is_active=false → 'archived'
             │
             ├──────────────► reenrich-stale  03:30, 6 rows/day, 90-day target
             │                enrich+classify+sweep again. Diff → back to your queue.
             │
             ├──────────────► expire-grants  02:00, deadline passed
             │                  ├─ can compute next round → roll deadline, stays live
             │                  └─ cannot → deadline=null,
             │                     next_open_date='Closed — next round TBC'
             │                     ⚠ STAYS LIVE AND VISIBLE. No parsed date written.
             │
             ├──────────────► check-coming-soon  07:00
             │                reopen day arrives → is_active=false
             │                ⚠ HIDES the row on the day it reopens
             │
             └──────────────► check-stale-rounds  04:30
                              ✖ STRUCTURALLY DEAD, predicate unreachable
                                (check-coming-soon nulls the field first)

  USER SIGNALS: 413 thumbs-down, 333 watchlist alerts, 0 flags
                ✖ NONE trigger any automated recheck of any row
```

## Per stage: trigger, cost, what watches it

| Stage | Trigger | LLM cost | Watched by | Status |
|---|---|---|---|---|
| Crawl | Mon+Thu ×9 batches | none (44 HTML fetches) | `crawl_logs`, `crawl_errors` (143 unresolved) | Running |
| CF funds | Mon ×5 batches | Sonnet 4.5, 6 calls/run | `cron_runs` | **Disabled** |
| Discovery sweep | Tue 08:30 | Sonnet 5 + 6 web searches ×2 | `cron_runs` | **Crippled, 40%** |
| Discovery queue | Tue 09:30 | Haiku, ≤10 calls | `cron_runs` | **Never armed** |
| Watchlist | Sun+Wed 04:00 | none (120 fetches) | nothing | **Orphaned output** |
| Capture | on insert | none | `pipeline_state` | Working |
| Enrich | 07:30, ≤24/run | Haiku 4.5, 1 call/row | `cron_runs` | Working, ~6/day actual |
| Classify | chained | Haiku 4.5, 1 call/row | none (`rejected` discarded) | Working, inefficient |
| Sweep | chained | none | `cron_runs` | Working |
| Publish gate | 09:00 | none | `publish_gate_decisions` | Working, armed |
| URL validation | Sun+Wed 03:00 | none | `url_status` | Working |
| Re-enrich | 03:30, 6/day | Haiku ×2/row | `cron_runs` | Working, under-provisioned |
| Expire | 02:00 | none | `cron_runs` | Working, two defects |
| Reopen watch | 07:00 + 04:30 | none | `cron_runs` | One dead, one inverted |
| Archive | via validate-urls | none | `pipeline_state` | Working |

## The order question: enrich, classify, tag

The chain is **enrich → classify → sweep** (`process-pipeline-queue/route.ts:128,140,155`). Two things about it are worth knowing.

**The state transition is a side effect, not a decision.** Nothing writes `pipeline_state: 'tagged'`. The enricher writes `funder_brief`, which is a tracked field under an `ai_enrich:` source, and `transitionPipelineState` (`grant-merge.ts:555-557`) infers the move from `captured` to `tagged` from that fact alone. The classify step then finds the row already moved and changes nothing. The `enriched` state exists in the enum and in four queue filters and **is never written by anything**.

**Yes, tags can be derived from unenriched data, and routinely are.** The classifier's input is verbatim (`classify.ts:94-103`):

```ts
{ id, title, funder, description: (g.description ?? '').slice(0, 1500),
  ...(what_they_fund ? {...} : {}), ...(priorities ? {...} : {}) }
```

`what_they_fund` and `priorities` come from `funder_brief`. **If there is no brief, both keys are omitted entirely** and the prompt explicitly authorises the model to proceed anyway (`classify.ts:487-489`): *"If what_they_fund and priorities are both absent, fall back to title + description alone, degraded signal but still classify. Don't refuse."*

The classifier **never** sees the page. The 12,000 characters the enricher fetches are used once and discarded. So even a fully enriched row is classified from at most ~5,500 characters of prose, and a thin one from ~350.

There is a second path where this bites harder: `crawl-grants` calls `classifyUnclassified()` after every batch (`route.ts:54`), which selects `is_active=true AND impact_sectors empty`. Those are live rows, possibly with no brief at all. In practice this pass finds nothing today (`classified: 0, unclassifiedRemaining: 0` in every recent run) because new rows are inserted `is_active=false`, so the step is effectively dead weight, but the code path is live.

One asymmetry worth flagging: `funding_type` is overwritten on **every** classify pass with no silence guard (`classify.ts:840-842`), unlike sectors, structures and beneficiaries which all have empty-value protection. A thin-row classify can therefore silently retype a grant as something else.

**Efficiency note.** Automated classify runs at **batch size one** (`grant_ids: [id]`). The static prompt is ~16KB, about 4,000 tokens, and is paid in full for every single row. Batching at 20 (which the manual route already does) would cut classify input cost by about 85%.

## Why the two crons "never ran"

Both are in `vercel.json` and both have been firing. The reasons they had no effect are different.

**`process-discovery-queue`: never armed.** Direct evidence from `cron_runs`:

```
job: process-discovery-queue   ok: true   skipped: true
summary: "Not armed. Set PROCESS_DISCOVERY_ENABLED=true to let the scheduled run write."
```

The route requires `PROCESS_DISCOVERY_ENABLED === 'true'` on the `?run=true` path (`route.ts:382-387`). It is not set. The queue has **54 pending items dating back to 26 July**, the exact day the cron entry was added (commit `1e10efe`). The 20 items marked processed were done by hand during the build.

**`check-watchlist`: runs fine, output goes nowhere.** All 240 watchlist rows were checked between 5 and 9 August. It has produced **333 alerts, every single one `resolved = false`**: 188 `page_down`, 145 `listing_changed`, going back to 11 March. The route writes only to `funder_watchlist` and `watchlist_alerts` and never touches `scraped_grants`. The only consumer is the admin watchlist page. If nobody opens it, the loop terminates.

There is also a **manual-trigger bug**: the button on that page reads `process.env.NEXT_PUBLIC_CRON_SECRET`, which is defined nowhere in the repo. It sends `Authorization: Bearer ` and gets a 401, then reads `data.changed` off the error body and toasts *"Check complete, undefined changes"*.

**Three more crons are off that you may not have realised.** `cron_runs` shows `crawl-cf-funds` skipped 5/5 runs and `verify-cf-funds` skipped 2/2, both on unset env flags. And `check-stale-rounds` is dead by construction: its own header documents that `check-coming-soon` nulls `next_open_date_parsed` at 07:00 the moment it reaches today, so a row can never age 14 days past it. Verified against production on 25 July: matches 0 rows in any state.

## Other defects found in the trace

These are load-bearing and worth recording even though they are not what you asked about.

- **`expire-grants` leaves closed rounds live.** When it cannot compute a next round it sets `deadline = null` and `next_open_date = 'Closed — next round TBC'` but leaves `is_active = true`. Every user surface passes it, because their filters all accept a null deadline. It also never writes `next_open_date_parsed`, so the row becomes invisible to **both** reopen crons. This population is growing by design.
- **`check-coming-soon` hides a fund on the day it reopens.** It sets `is_active = false` and pushes the row back to `captured`. That is the documented intent, but the effect is that reopening removes a fund from the catalogue until a human republishes it.
- **The trust ladder can veto expiry.** `expire-grants` writes as `system:` (trust 50). If `deadline` is currently stamped `ai_enrich` (60) or admin-pinned (100) the write is refused, but the route only checks `applied.length > 0`, and `next_open_date` usually applies. So a row gets counted as "between rounds" while the stale past deadline is still on it.
- **`admin/validate-urls` undoes the cron's correctness fix.** It collapses `grant_closed` into `url_status='dead'` and bypasses `mergeGrantUpdate` entirely with a raw update. The cron deliberately does the opposite.
- **A DB trigger deactivates rows underneath everything.** `fn_auto_deactivate_closed_grants()` (`schema.sql:88-112`) sets `is_active := false` on 13 "now closed" description phrases, with no provenance and no state transition, producing exactly the published-but-inactive dead zone the crons were fixed to avoid.
- **`bulk-reenrich` can degrade a good brief.** It writes at `ai_enrich:rerun:v1`, trust 60, equal to the main enricher, with `max_tokens: 1024`, no citations and none of the income/amount/investment extraction. Equal trust overwrites (`newTrust < currentTrust` only), so the thin brief wins.
- **`crawl_errors` has 143 unresolved entries** and `fetched` equals `upserted` for every source on every run, meaning the crawler has no change detection and rewrites everything it sees. `gov_uk` has fetched 1,431 rows in 45 days and has **15 live rows** to show for it. `ukri` has fetched 935 and has **one**.

---

# Part 2: the recheck model

## What is wrong with the conveyor

Today `reenrich-stale` re-derives the whole row from scratch every 90 days: fetch page, regenerate the brief, re-run the classifier, re-sweep. Three consequences.

**It manufactures review work.** A regenerated brief and a re-run classifier produce different values than last time, often for no reason connected to the funder changing anything. The chain compares 9 fields pre/post and any diff sets `tagged_awaiting_review`, which blocks auto-publish. Measured today: **42 of the 101 blocked rows are `tags_changed`**, the largest single category by a factor of two. Against 198 rows ever re-enriched that is roughly a one-in-five churn rate. (Snapshot-based, so treat as indicative rather than exact.)

**It cannot scale on throughput.** `BATCH_LIMIT = 6`, one run a day, ~19 seconds a row measured. That is 6 rows a day, 2,190 a year.

| Catalogue size | Rows needing 90-day refresh | Days per full cycle at 6/day |
|---|---|---|
| 630 (today) | 2,558/yr | **105 days** ≈ target |
| 750 | 3,045/yr | 125 days |
| 2,000 | 8,120/yr | **333 days** |

At 2,000 rows the "90-day freshness" promise silently becomes 11 months. No error, no alert, nothing in `cron_runs` looks wrong.

**It cannot tell "unchanged" from "never re-checked".** `field_provenance.set_at` only advances when a value **changes**, because the idempotent branch returns before stamping (`grant-merge.ts:188-190`). So a field re-confirmed against the live page today keeps its old timestamp. There is no `verified_at` and no evidence URL anywhere in the schema.

## The proposal: persist and verify

Facts persist. Rechecking asks one question: *does the page still say this?* A confirmation stamps a date and writes nothing else. Only a contradiction, carrying a verbatim quote, raises a change.

**Most of this already exists.** `field_provenance` already carries `{source, set_at, pinned}` and, on some fields, `{citation: {snippet, confidence}}`. `verify-row.ts` already does gate-then-extract in a single model call with quote-backed facts. What is missing is three small things:

1. A `verified_at` on the provenance entry, distinct from `set_at`, that advances on **confirmation** as well as change.
2. An evidence URL per field. `citation.snippet_offset` is declared in the type and never populated by any writer; the URL the snippet came from is not recorded at all.
3. A place to persist a `VerifyResult` and a mapping from its outcomes into the existing `ReviewReasonCode` set, so the gate can see them.

The engine's own header carries the caveat that should govern the design: *"Quote-verified is not meaning-verified."* A sample of five quote-checked `max_org_income` proposals found three wrong, every quote real and accurate about its own subject. So verification is a floor, not a proof, and confirmations should be cheap while contradictions should still be reviewable.

## Risk classes

Derived from the actual live population (630 rows):

| Class | Rows | Why | Cadence | Checks/yr |
|---|---|---|---|---|
| Fixed deadline, >30d out | 101 | The date is the fact. It does not drift. | Once ~14d before, once after | 2 |
| Fixed deadline, <30d out | 57 | Same, but the after-check matters soon | Same | 2 |
| Rolling with `deadline_cycle` | 26 | Cycle is known, verify at boundaries | Per cycle boundary | 3 |
| Rolling, no cycle | 319 | Genuinely open-ended, drifts silently | Rotate quarterly | 4 |
| No deadline, not rolling | 127 | **Highest risk.** We do not know the timing. | Bi-monthly until resolved | 6 |
| Between rounds | 50 | Only matters near the reopen date | At reopen date ±7d | 2 |
| **Event-triggered** | | | | |
| User flag (thumbs-down) | 413 pending | Someone told us it is wrong | Immediate | on event |
| Link failure | 615 dead | The page moved or died | Immediate | on event |
| Watchlist `listing_changed` | 145 open | The funder's index page changed | Immediate | on event |

That last block is the important one. **Nothing consumes any of those three signals today.** 413 thumbs-down, 333 watchlist alerts, and zero of them cause a single re-fetch of anything.

## Cost model

Measured parameters. Enrich: Haiku 4.5, ~5,000 tokens in (12k-char page cap plus ~7.5KB instructions), ~2,000 out. Classify at batch 1: ~4,400 in, ~300 out. Verify: Haiku 4.5, `max_tokens: 1200`, 12k-char page cap, ~5,000 in, ~700 out, plus a link-follow on roughly a quarter of rows.

At Haiku 4.5 pricing ($1/M input, $5/M output):

- Enrich + classify (the conveyor unit) ≈ **$0.021/row**
- Verify (the persist-and-verify unit) ≈ **$0.010/row**
- Classify batched at 20 instead of 1 would drop the conveyor unit to **$0.017**

| | 630 rows (today) | 750 rows | 2,000 rows |
|---|---|---|---|
| **Conveyor**, 90-day cycle | 2,558 × $0.021 = **$54/yr** | 3,045 × $0.021 = **$64/yr** | 8,120 × $0.021 = **$171/yr** |
| Runs needed per day | 1.2 | 1.4 | **3.7** |
| **Persist-and-verify** | 2,432 × $0.010 = $24 | 2,895 × $0.010 = $29 | 7,720 × $0.010 = $77 |
| plus escalated re-enrich @15% | +365 × $0.021 = $8 | +$9 | +$24 |
| **Total** | **$32/yr** | **$38/yr** | **$101/yr** |
| Runs needed per day | 1 | 1 | **1** |
| Rows into your queue per year | ~540 (est. 21% churn) | ~640 | ~1,700 |
| Rows into your queue, verify-first | ~120 (est. 5% contradiction) | ~145 | ~390 |

**Read this table for the last two rows, not the money.** The saving at 2,000 rows is $70 a year, which is nothing. The saving in review load is about **1,300 rows a year you do not have to look at**, roughly 3.5 a day, and the difference between needing four function runs a day and one.

I want to be explicit that the 21% and 5% figures are the softest numbers in this document. The 21% is derived from a snapshot (42 blocked `tags_changed` against 198 ever-re-enriched) and could be off in either direction. The 5% is a judgement, not a measurement. If you want that firmed up before committing, the cheapest way is to run the verify engine over 100 live rows and count actual contradictions, which costs about $1.

## Recommendation for Part 2

Do it, but stage it, and do the cheap half first.

- **Now, ~half a day:** add `verified_at` and `evidence_url` to `ProvenanceEntry`; make the idempotent branch stamp `verified_at` instead of returning early. This alone makes "when did we last confirm this" answerable, which it currently is not.
- **Next, ~1 day:** persist `VerifyResult`, add a `verify-catalogue` cron over the risk classes above, map outcomes into `ReviewReasonCode` (the `POLICY` table is exhaustive by type, so `tsc` will force you to classify each new code as block or info).
- **Then, ~half a day:** wire the three event triggers. Thumbs-down, link failure, and `listing_changed` each enqueue a verify.
- **Leave the conveyor in place** as the escalation path, triggered by a verify contradiction rather than by a 90-day timer. Batch its classify step at 20 while you are in there.

---

# Part 3: the review queue

## What 156 actually is

It is five populations, and they do not all want the same treatment:

| `pipeline_state` | Rows | What it is |
|---|---|---|
| `tagged` | 48 | Legacy pre-v1, AI wrote tracked fields |
| `tagged_awaiting_review` | 47 | v1, citations present, waiting on you |
| `between_rounds_scheduled` | 50 | Closed, reopen date recorded |
| `rejected` | 10 | Soft-rejected with a reason |
| `captured` | 1 | Never processed |

The auto-publish gate only looks at the first two plus `captured` and `enriched`, so its working queue is **92**, not 156. It is already draining that queue at 4 to 8 rows a day, live and armed.

## What is actually blocking them, measured

From `publish_gate_decisions`, latest decision per row, 101 rows currently blocked:

| Blocking code | Rows | Engine-answerable? |
|---|---|---|
| `tags_changed` (eligibility narrowed) | 42 | **No.** Claim about funder policy, often unstated on the page |
| `eligibility_missing` | 23 | Yes, extract `who_can_apply` from the page |
| `amount_ungrounded` | 15 | Yes, this is exactly what quote-backed extraction is for |
| `link_dead` | 8 | Yes, re-fetch, follow redirect, or confirm dead |
| `deadline_passed` | 6 | Yes, extract current deadline or return `round_closed` |
| `applicant_individual_only` | 6 | Yes, re-read eligibility |
| `applicant_not_social_sector` | 5 | **No.** Regex over prose, tuned on 22 rows, false positives hide real funds |
| `deadline_implausible` | 5 | Yes |
| `amount_pot_suspected` | 5 | Yes, extract the per-applicant cap with a quote |
| `page_unreadable` | 3 | Yes, engine already retries via proxy and follows one link down |
| `quarantined` | 1 | Yes, re-run the chain |
| `no_brief` | 1 | Yes, re-enrich |

Splitting rows by whether **every** blocking reason is engine-answerable:

- **54 rows blocked only by engine-answerable reasons**
- **39 rows blocked only by reasons needing your judgement**
- **8 rows with a mix** (engine can clear part, you decide the rest)

## What I expect to clear

Being deliberately conservative, because audit estimates in this codebase have historically run optimistic:

| Population | Count | Expected outcome |
|---|---|---|
| Engine-only blocked | 54 | ~35 clear to publish, ~12 route to archive or `round_closed` (also a clearance), ~7 fail the gate and stay for you |
| Mixed | 8 | Partially cleared, arrive pre-briefed with a quote |
| Human-only blocked | 39 | Stay yours, but arrive with the page quote attached |
| `between_rounds_scheduled` | 50 | ~40 gain a parsed reopen date (see Part 4), 10 already have one |
| `rejected` | 10 | Leave alone |

**Net: roughly 47 of the 92 gate-queue rows resolve without you, and the ~47 that remain arrive with evidence attached rather than as a bare row to go and research.** Add the 40 between-rounds rows that gain a usable reopen date and the engine touches about 95 of the 156 usefully.

The residue is concentrated and honest: **42 rows of "eligibility narrowed"**, where the question is genuinely *"does this funder really exclude CICs?"* and the page usually does not say. That is a decision, not a lookup.

## Cost

156 rows × ~$0.010 = **$1.56**. Running it three times over while you tune the outcome mapping costs under $5. This is not a budget question.

## Recommendation for Part 3

Run the engine over the 156 in **report-only mode first**, persisting `VerifyResult` and writing nothing back. Compare its proposals against the 22 rows you have already hand-reviewed. Then decide the auto-apply threshold. The engine's own header is emphatic that quote-verified is not meaning-verified, and the three worked failures it documents (cash-at-bank read as income, two-stage process read as invite-only, sub-programme rule applied to a whole trust) are all exactly the kind of error that would look fine in a summary.

Two things to fix while you are there, both cheap:

- **Converge the orphaned flags.** `cf-fund-verify.ts` writes 11 flag codes into `raw_data.verify.flags` that nothing reads, alongside the 3 in `raw_data.checks` that the gate does read. `grant-flags.ts:23-25` already flags this as a known duplication awaiting the gate.
- **Stop discarding `rejected`.** `classify-grants`, `fill-amounts`, `fill-deadlines`, `sweep`, `audit-eligibility`, `reenrich-stale` and `process-pipeline-queue` all throw away the trust-ladder rejection list and report success. That is the mechanism that produced "Detect all reports success while every write was silently blocked."

---

# Part 4: freshness

## Supply by funding type

| Type | Live | Added in 90 days | With a real future deadline |
|---|---|---|---|
| Grant | 514 | 189 | 148 |
| In-kind | 50 | 17 | 1 |
| Programme | 37 | 9 | 7 |
| Investment | 29 | 5 | 2 |

Grants are fed. The other three are not, and there is no mechanism that would fix that on its own.

Worth noting alongside this: of 630 live rows, only **158 have a real future deadline**. 345 are flagged rolling and 127 have no timing information at all. Memory already records that `is_rolling` is set as `!deadline`, so a chunk of that 345 is parse failure presenting as "rolling". That is a freshness problem wearing a disguise, and it is the biggest single input to the risk classes in Part 2.

## What guarantees new supply today

Honestly: only `crawl-grants`, and only for grants.

- **`crawl-grants`** covers 44 sources twice a week. It has no change detection (`fetched` equals `upserted` every run) and its yield is poor at the top: `gov_uk` has produced 243 rows of which 15 are live, `ukri` 198 of which 1 is live. Memory already records that ~30 of the 97 crawl functions are hardcoded seeds rather than scrapers.
- **`crawl-cf-funds`** is the community-foundation feed. **Disabled.** 83 rows exist from manual runs.
- **`discover-sweep`** is the only feed designed to find funders nobody has catalogued. It is armed and running, but see below.
- **`ingest-360giving`** has no cron at all. Manual button only.
- **`check-watchlist`** is the only mechanism that could detect a *change* at a known funder. Its output is orphaned.

## The discovery budget bug

This is the specific thing strangling non-grant supply.

`discover-sweep` builds a queue of 5 queries: 2 targeted (Arts Council England, GLA) and 3 rotated general ones. It estimates 260,000ms for a general query against a budget of 235,000ms (`route.ts:58-61`). **260,000 exceeds 235,000 even at zero elapsed time**, so the three general queries are skipped on every run, permanently. Direct evidence from today's `cron_runs`:

```
skipped: [
 {query: "UK social investment patient capital charities CICs apply 2025 2026",
  reason: "needs ~260s, only ~116s of budget left"},
 {query: "blended finance social enterprise UK loan equity hybrid funding open", ...},
 {query: "community development finance institution CDFI loan UK social enterprise apply", ...}
]
```

Those three are, precisely, the social-investment queries. The feed that would supply your 29 investment rows has never executed once.

And the two that do run queued **1 row from 13 results** today, because everything else deduped, and that 1 row went into `discovery_queue`, where `process-discovery-queue` is not armed to collect it.

So the non-grant supply chain is broken at two consecutive links.

## What the between-rounds and reopen watching needs

This is where the watchlist question resolves.

**The current state.** Of 50 `between_rounds_scheduled` rows, **10 have a parsed reopen date and 40 have free text only**. Text-only rows are invisible to both reopen crons, because `check-stale-rounds` and `check-coming-soon` each require `next_open_date_parsed` to be non-null. `expire-grants` actively grows this population by writing `'Closed — next round TBC'` with no parsed date. The stale-rounds header already names it: *"85 rows have next_open_date text but a NULL next_open_date_parsed, neither cron can ever see them."*

Meanwhile `check-stale-rounds` is dead by construction, and `check-coming-soon` responds to a reopen by **hiding the fund**.

**What it needs, and it is one mechanism, not three.**

1. **Watchlist alerts become verify triggers.** A `listing_changed` alert on a funder's index page is the single best signal available that a round has opened. There are 145 of them sitting unread. Route them into the verification engine instead of into a page nobody opens. That gives `check-watchlist` a consumer and stops it being a dead cron.
2. **The engine extracts the reopen date.** `verify-row.ts` already has a `round_closed` outcome and already extracts dates with quotes. Extend it to write `next_open_date_parsed` when it finds one. That converts the 40 text-only rows into rows the reopen crons can actually see, and stops `expire-grants` from creating new invisible ones.
3. **Invert `check-coming-soon`.** On the reopen date, verify rather than hide. If the page confirms the fund is open, republish. If not, push the date out. Hiding a fund on the day it reopens is the exact opposite of what the catalogue is for.
4. **Retire `check-stale-rounds`.** It cannot fire. Delete it rather than leaving a cron entry that implies coverage it does not provide.

## Recommendation for Part 4

In order of value per hour of your time:

| Action | Effort | Effect |
|---|---|---|
| Set `PROCESS_DISCOVERY_ENABLED=true` | 1 min | Releases 54 stranded discovery items |
| Fix the `EST_MS`/`BUDGET_MS` arithmetic | 10 min | Restores 3 of 5 discovery queries, including all social investment |
| Re-enable `crawl-cf-funds` + `verify-cf-funds` | 5 min + canary | Restores the community foundation feed |
| Fix the watchlist manual-trigger secret | 10 min | Makes the admin button work at all |
| Route `listing_changed` alerts into verify | ~half day | Gives 145 unread alerts a purpose; reopen detection |
| Extend engine to write `next_open_date_parsed` | ~half day | Makes 40 invisible rows visible to the reopen crons |
| Invert `check-coming-soon` to verify-then-publish | ~half day | Stops reopening a fund from removing it |
| Delete `check-stale-rounds` | 10 min | Removes false coverage |
| Add change detection to `crawl-grants` | ~1 day | Stops rewriting 1,400 rows a fortnight to no effect |

The first four are under 30 minutes total and unblock the largest share of the freshness problem. I would not do them all in one push, though: re-enabling the CF crons and arming the discovery queue both change enrichment volume, so they want a canary each rather than a config tidy, on the same reasoning `CLAUDE.md` already applies to `process-pipeline-queue`.

---

# Consolidated: what I would actually do

**Free wins, under an hour, no build.** Arm `PROCESS_DISCOVERY_ENABLED`. Fix the discovery budget arithmetic. Fix the watchlist button's secret. Delete `check-stale-rounds`. Re-enable the two CF crons behind a canary.

**Highest value per hour of build.** Add `verified_at` to provenance and make confirmations stamp it. Persist `VerifyResult`. Point the existing engine at the review queue in report-only mode. That is roughly a day and a half and it addresses Parts 2 and 3 at once, because they are the same mechanism.

**Then.** Event triggers for the three unread signals (thumbs-down, link failure, listing changed). Invert `check-coming-soon`. Batch the classifier at 20.

**Do not bother.** Optimising API spend. It is $110 a year and the persist-and-verify design saves $70 at 2,000 rows. Both numbers are noise next to an hour of your time.

## Open questions for you

1. **The 42 "eligibility narrowed" rows.** These are the real residue and no engine will clear them. Is the right answer to review them, or to change the gate so that a narrowing diff is informational rather than blocking, and accept the risk? The gate's own stated policy is *"block on wrong, not on missing"*, and a narrowing is arguably neither.
2. **How much do you trust auto-apply?** The engine's own header documents three quote-verified but wrong proposals out of a sample of five on `max_org_income`. I would default to report-only and let you set the threshold after seeing one real run.
3. **`is_rolling` on 345 live rows.** Memory says this is set as `!deadline`, so an unknown fraction are parse failures presenting as rolling. Worth a measurement pass before the risk classes in Part 2 are set, because the 319 "rolling, no cycle" bucket is the biggest single thing driving verify volume.
4. **Do you want the 615 dead-URL rows in scope?** 554 have `url_last_checked = null`, which is the manual-admin-hide signature, so they are deliberate. The other 61 are validator verdicts and could be rescued.
