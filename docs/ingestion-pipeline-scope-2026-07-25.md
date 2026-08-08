# Catalogue ingestion pipeline: full scope + automation plan

**Date:** 2026-07-25
**Scope:** every path from "a funding opportunity exists in the world" to "it is live in the catalogue", plus the maintenance that keeps it accurate afterwards.
**Goal:** minimise Paul's involvement.

All findings below are from reading code on `agent/research-v1` and querying live Supabase (`yrndczlqjqtfgissleev`). Where a doc or code comment contradicts the code, the code wins and the drift is noted.

---

## 0. Headline

Three things came out of the audit, in order of importance.

**1. Two daily crons have never written anything.** `expire-grants` and `check-stale-rounds` import the cookie-based anon client instead of the service-role client. A cron has no session cookie, so they run as `anon`. `scraped_grants` has RLS enabled with exactly one policy: public SELECT. There is no INSERT/UPDATE/DELETE policy. Table GRANTs let `anon` attempt an UPDATE, so PostgREST accepts the request, RLS matches zero rows, and **no error is returned**. Both jobs report success with non-zero counts while changing nothing.

Proof: `deadline` and `next_open_date` are both tracked fields, so a successful write must stamp `field_provenance`. Across all 1,729 rows, provenance source `system:expire_grants` appears **0 times**, and `system:check_stale_rounds` **0 times**. The service-role job `system:reenrich_chain:v1` appears on **152**. This is the reason deadlines rot.

**2. The review gate is already theatre, and it is actively degrading the machine.** The economical path through Needs Review is "Approve all N" — 4 clicks publishes the entire queue with a bare `is_active: true` and **discards every staged edit**. Meanwhile 141 of the 172 rows currently in the queue are *already live to users*, because the queue predicate never filters `is_active`. So the gate is not protecting users the way the UI claims.

Worse: every admin-session save stamps `admin:<email>` with `pinned: true` on **every tracked field in the payload**, at trust 100. Two bulk buttons (`bulkEnrich`, `bulkDetect`) fire this automatically on regex-derived, unreviewed values across the whole queue. Trust 100 permanently outranks `ai_enrich` (60), so those fields can never be improved by any future AI pass. **More manual review produces a permanently less improvable catalogue.** That is the doom loop to break.

**3. Throughput is pinned at Hobby-tier settings on what is now a Pro account.** `process-pipeline-queue` was built for a 5-minute cadence (`BATCH_LIMIT = 12`, header comment claims "~140 rows/hour"). `vercel.json` schedules it `30 7 * * *` — once daily. Effective: **12 rows/day against a design of 3,456/day, a 288× throttle.** A 300-row scraper burst takes 25 days to drain.

> **SUPERSEDED 2026-08-04 — the account is now Pro, and this section's original
> claim is correct again.** The correction below was accurate when written (the
> team really was on Hobby on 1 August) and is kept for the reasoning, but the
> Phase 1 recommendation it retracts is live again. See CLAUDE.md.
>
> **CORRECTION, 2026-08-01: the account is Hobby, not Pro.** Checked against the
> Vercel API — both the personal account and the team report plan `hobby`. The
> inference above ("37 cron entries and 270-300s functions, so it is on Pro")
> was wrong; those entries run because every one of them is daily-or-weekly,
> which is what Hobby permits. **The Phase 1 recommendation below to move
> `process-pipeline-queue` to `*/10` is therefore unsafe as written** — a
> sub-daily entry fails silently and has previously blocked every deploy. The
> throughput lever on Hobby is `BATCH_LIMIT` (already raised 12 → 24) and a
> second daily slot, not cadence. Treat any `*/N` schedule in this document as
> retracted.

The corollary: the fix for "I spend too much time on this" is mostly *repair and rewiring*, not new features.

---

## 1. Stage 1 — Sourcing

### What exists

Ten paths can create a `scraped_grants` row. Eight are in code, two are out of band.

| Path | Trigger | Reality |
|---|---|---|
| `crawl.ts` (97 sources) | Cron, Mon + Thu, 9 batches | See below |
| CF fund AI extraction (31 CFs) | Cron Mon, env-gated off, **and not on `main`** | Never runs in prod |
| AI discovery → `discovery_queue` → catalogue | Admin UI, manual | Works; 23 rows in queue, 13 pending |
| 360Giving daily-status ingest | Admin UI, manual, no cron | Works. `CLAUDE.md` calls this "deferred post-beta" — it shipped |
| Manual "Add funder" form | Admin UI | 360 rows. Title + funder are the only validation |
| `bulk-deep-search` | **No caller anywhere** | 27 rows in prod via direct POST |
| Research agent `flag_for_verification` | User chat, Companion tier | 0 rows ever. Correctly uses `system:` not `admin:` |
| `promote-all-seeds` | — | Dead: `SEED_GRANTS` is `[]` |
| Hand-run SQL | Supabase console | No provenance, no `stampNewGrant` |
| `corporate_partners` | Admin form, browser client, no API route | 88 rows, no review gate, read by nothing |

### The crawler is mostly not a crawler

Of 97 registered source functions:

- **21** are true parsing scrapers (fetch + parse, rows derived from the page)
- **7** parse with a hardcoded fallback (on selector breakage, insert a hardcoded umbrella row and report `upserted: 1` — a healthy-looking silent failure)
- **3** fetch only to confirm HTTP 200, then return hardcoded rows
- **66** are pure static seeds with no HTTP call at all

Batch 6 makes zero network requests: the cron slot exists purely to re-assert 12 literals twice a week. The file header at `crawl.ts:116-118` documents the drift mechanism explicitly: "If a target still 403s after this, convert it to a static seed rather than escalating to Playwright."

**Consequence:** 68% of the "crawler" is a hand-maintained directory with no freshness signal. A static seed's `last_seen_at` refreshes on every crawl, so it looks maintained forever.

### Silent scraper failures

- `crawl_errors` holds **167 unresolved rows** against a warn threshold of 5. Nothing in the UI reads that table; the warning text instructs you to run SQL.
- Three scrapers return `fetched: 0, upserted: 0, error: null` — `creative_scotland`, `forever_manchester`, `london_cf`. Selectors broke; they report success.
- `cf_wales` fetches 34 rows and has 0 active in the catalogue.
- `quartet_cf` is listed in `BATCH_1_SOURCES` but has no registered function, so it silently never executes.
- 14 orphaned doc-comment blocks for deleted sources; the file header still advertises 7 funders that last ran 2026-03-10.

### Where the catalogue actually came from

1,729 rows total (`CLAUDE.md` says ~300 — badly stale). Top sources:

| Source | Rows | Origin |
|---|---|---|
| `manual` | 360 | Add funder form |
| `gov_uk` | 230 | real scraper |
| `ukri` | 198 | real scraper |
| `young_camden_foundation` | 113 | **no code path** — hand-run SQL |
| `ai_extract:cf_fund_pipeline` | 83 | CF pipeline |
| ~25 one-off strings | ~500 | out-of-band sessions |

**Roughly 900 of 1,729 rows (52%) entered via paths that do not exist in the codebase.** Only `gov_uk` and `ukri` fetch more than 34 items; 60+ sources last fetched 1-3 rows.

---

## 2. Stage 2 — Scheduling

`vercel.json` is the only scheduler. **It differs from `main`:** the 6 CF-fund entries exist only on this branch, so those jobs have never been scheduled in production.

| Job | Schedule | Status |
|---|---|---|
| `expire-grants` | daily 02:00 | **All writes silently rejected** (anon client vs RLS) |
| `reenrich-stale` | daily 03:30 | LIVE (env var *is* set in prod), zero headroom |
| `check-stale-rounds` | daily 04:30 | **Structurally dead** + writes rejected |
| `check-coming-soon` | daily 07:00 | LIVE, and generates the dead zone |
| `process-pipeline-queue` | daily 07:30 | **288× throttled** |
| `crawl-grants` ×9 | Mon + Thu 06:00-06:40 | LIVE |
| `validate-urls` | weekly Sun 03:00 | LIVE, ~91% coverage/run |
| `golden-queries` | weekly Tue 05:30 | LIVE, **output goes nowhere** |
| `check-watchlist` | weekly Wed 04:00 | THROTTLED, 51% never checked |
| `crawl-cf-funds` ×5, `verify-cf-funds` | branch only | Never run |
| `deadline-reminders`, `send-alerts`, `pipeline-summary` | — | Orphaned routes, deliberately unscheduled (no opt-out UX) |

### `check-stale-rounds` can never have a candidate

It selects rows where `next_open_date_parsed < current_date - 14`. But `check-coming-soon` runs daily at 07:00 with a working service-role client and nulls `next_open_date_parsed` the moment it reaches `<= today`. A row can therefore never age 14 days past its parsed open date. Live check: that predicate returns **0 rows across the entire table, in any state**. The job scans and exits with `flagged: 0` forever, independent of the RLS problem.

### Throughput arithmetic

- **`process-pipeline-queue`**: designed `*/5` × 12 = 3,456/day. Actual `30 7 * * *` × 12 = **12/day**. Commit `1d05315` explains it: `*/5` was rejected by Vercel Hobby and silently failed every build. The account now runs 37 cron entries and 270-300s functions, so it is on Pro — the schedule is a leftover.
- **`reenrich-stale`**: `BATCH_LIMIT = 6`, observed 4.77/day. 549 eligible rows ÷ 6 = **91.5 days** against a 90-day staleness threshold. It is designed to run permanently behind its own definition of stale. It is also the source of all 145 `tagged_awaiting_review` rows — **it generates review backlog faster than it is cleared.**
- **`check-watchlist`**: no `ORDER BY`, no `.limit()`, no cursor. 64 of 239 entries stamped per run, and **121 of 239 (51%) have `last_checked IS NULL`** — never checked once, so they have no baseline fingerprint and can never raise an alert. Coverage does not rotate; the same head-of-relation rows are re-checked weekly.

### No locks anywhere

No cron takes a DB advisory lock, in-flight marker, or Redis mutex. Overlap protection is purely schedule spacing. `crawl-grants?batch=N` and `crawl-cf-funds?batch=N` both upsert `scraped_grants` with no coordination.

---

## 3. Stage 3 — Ingestion gate and lifecycle

### `pipeline_state` does not gate user visibility

- RLS: public SELECT on every row, including unreviewed ones.
- `grants_with_funder` has **no WHERE clause at all**, and does not even expose `pipeline_state`.
- The gate is app-code convention repeated at ~8 call sites: `.eq('is_active', true).neq('url_status','dead')` plus a deadline clause.

**Visible = `is_active = true AND url_status <> 'dead'`.** `pipeline_state` only decides which admin tab a row lands in. Currently 133 `tagged_awaiting_review` rows and 9 `archived` rows are live to users.

### The 8 states

`captured, tagged, published, archived, enriched, tagged_awaiting_review, rejected, between_rounds_scheduled`.

Two are unreachable: **`enriched`** has no writer at all, and **`between_rounds_scheduled`** is specified in `docs/pipeline-v1-spec.md` but never written (1 live row, hand-SQL). `expire-grants` implements between-rounds as `deadline`/`next_open_date` mutations instead, leaving the state column out of it.

### The dead zone: 112 rows

Four write paths set `is_active = false` **without** going through `mergeGrantUpdate`, so `transitionPipelineState` never fires:

1. `check-coming-soon:50-57` — bulk raw update. Its own comment says "moves to Needs Review queue". That stopped being true when the queue became `pipeline_state`-driven. It also nulls `next_open_date`, a *tracked* field, outside the merger, silently clobbering admin pins.
2. `validate-urls:93-102` — raw update. Had it used the merger, the first transition rule (`is_active=false && url_status='dead' → archived`) would have fired.
3. `sweep` Rule 5 — sets `pipeline_state='rejected'` **without** `is_active=false`, so a past-deadline row is marked rejected and stays visible.
4. `flag-grant:38-43` — see below.

Result: **112 rows are `published` + `is_active=false`** — invisible to users *and* to every admin queue. Reachable only by raw SQL. Mirror case: **9 rows are `archived` + `is_active=true`**, live to users while flagged archived.

### `flag-grant` has never worked

Two independent reasons: it matches on `external_id`, which is NULL for 376 of 731 active rows (and `grants-normalise` sets `id = external_id ?? id`, so the route receives a UUID for those); and it uses the RLS user-session client against a table with only a SELECT policy. Either alone reduces it to a silent 0-row update. Users flagging bad grants has produced nothing, ever.

### A DB trigger writes below the trust ladder

`fn_auto_deactivate_closed_grants` (`schema.sql:88-112`, trigger `:729`, confirmed enabled) fires `BEFORE INSERT OR UPDATE` and sets `is_active := false, is_rolling := false` on 12 `ILIKE` description patterns. It fires on **every** write, including every enrich and classify pass. The merger cannot see it, provenance cannot protect against it, and a description that merely mentions a past closed round is enough to deactivate a live grant.

### Dedup is advisory

Only two constraints exist: PK on `id`, UNIQUE on `external_id` — and `external_id` is NULL on 376 of 731 active rows, so the one real constraint does not cover the majority. App-level checks vary by path; `promote-grant` (the Add form) and the research agent have **none**. Two paths use the `.limit(N)`-then-filter-in-JS anti-pattern (`.limit(3000)`, `.limit(2000)`) which degrades silently past the window.

### Asymmetry

Additions are gated; removals are not. Every insert lands `is_active=false` in a queue. But five paths deactivate with no queue entry, no notification, and no state transition: two crons, a user endpoint, a sweep rule, and a DB trigger doing substring matching on prose.

---

## 4. Stage 4 — Enrichment and verification

### The chain

`process-pipeline-queue` (12 rows/day) runs enrich → classify → sweep. `reenrich-stale` (≈5 rows/day) runs the same chain plus a 10-field diff, flipping changed rows to `tagged_awaiting_review`.

### What is good here

Genuinely strong work that should be preserved and generalised:

- **`enrich-grant`** produces a 13-field `funder_brief` with per-field `_citations` (snippet + confidence + reason), plus two advisory guards: `detectStaleDates` (month-year phrases >30 days past in a staleness context) and `detectUngroundedAmounts` (£ figures with no ±10%/±£1,000 match in the citation snippet or original scrape). It records *why* a page fetch failed in `primaryFetchDebug`. It forces `last_enriched` server-side because Haiku was echoing page dates.
- **The pool-vs-per-grant amount extractor** (`urls/page.tsx:1929-2082`) is ~150 lines of cued heuristics with named live bug cases. `amount_min` is taken only from a cued non-ceiling floor, so "up to £X" can never become a false floor.
- **`cf-fund-verify`** is the best verification job in the codebase: 10 structured flag codes, amount-ratio and implausible-max thresholds, a uniform-snippet check correctly requiring matching `apply_url`, and **it auto-publishes clean rows with no human**. This is the pattern to generalise.
- **`extractIncomeGate` / `extractInvestmentTerms`** write resolved-or-null, so a removed gate self-clears. Correct, and rare in this codebase.

### The confidence layer is write-only

Citations, `_stale_dates`, `_ungrounded_amounts`, reclassify diffs, `stale_since`, and `raw_data.verify.flags` are all computed and persisted. Grepping the entire admin UI for those keys returns **zero hits** except the citation chip and a `title=` tooltip.

**The most expensive quality signals in the system are invisible at the point of decision.**

### Trust ladder problems

| Issue | Effect |
|---|---|
| **Equal trust wins** (rejects only on *strictly* lower) | `ai_enrich:rerun:v1` (a degraded, citation-less fork with `max_tokens: 1024`) can overwrite a full `ai_enrich:v2` brief, destroying the confidence layer |
| **`ai_detect` = 30, below `scraper` = 40** | Every `fill-amounts` / `fill-deadlines` write is erased by the next crawl |
| **Untracked matcher inputs** | `niche_tags`, `funding_subtype`, `eligibility_criteria` are read by the matcher but have no provenance, no trust protection. `audit-eligibility` overwrites `eligibility_criteria` wholesale from an LLM |
| **`amount_undisclosed`** | Tracked and rendered, but has **zero writers** — "funder discloses no amount" is indistinguishable from "we never found one" |

### Rejected writes are counted as successes

`mergeGrantUpdate` returns `{ applied, rejected }`. Only `update-grant` and one brief-specific message in the UI read it. `classify-grants`, `classify.ts`, `fill-amounts`, `fill-deadlines`, `sweep`, `audit-eligibility`, `cf-fund-verify` and `bulk-reenrich` all **discard it and increment their success counters anyway**. So "Detect all" reports success when every tag write was blocked by an earlier admin pin, and the row simply does not change.

### Only-adds-never-clears

Confirmed on: `fill-amounts`, `detectEligibility`, `detectLocation`, `classifyUnclassified` structures/niche, `computeBriefUpdates` amounts. Stale values persist indefinitely once written. `classify-grants` structures is deliberate (honouring `[]` once wiped structures catalogue-wide) but the admin UI's "Detect all" does **not** pass `preserve_empty`, so one Haiku miss on a manual re-classify wipes `target_beneficiaries`.

### `fill-deadlines` trap

`fetchPageText` returns `null` on any failure via a bare catch. The route falls back to a 600-char description slice, and when the model finds nothing, durably stamps `{deadline: null}` under `ai_detect:fill_deadlines:v1` — recording "we checked and there is no deadline" when the page was never fetched. The only signal is an aggregate `fetchFailed` count that is never persisted per row.

### Silent LLM failures

`stop_reason` is checked in exactly two places in the repo, neither in the enrichment layer.

- **10 of 12 enrichment LLM calls have no retry** on 429/529 (raw `fetch`).
- Five have `max_tokens` well below plausible output with `stop_reason` unchecked: `bulk-reenrich` (1024 for a 13-field brief), `fill-deadlines` (1024 for 5 grants), `process-discovery-queue` (1000 for 11 fields), `fetch-grant-info` (1000 from 12k chars), `search-grant-info` (1000 for 12 fields).
- `classify.ts:680-682` — `} catch { failed += batch.length }`. Classifier outages are invisible in the cron path.
- `search-grant-info:491` — a bare catch wraps the *entire* grounded live-content extraction including the JSON parse. Control falls through to a **pure training-knowledge prompt** and returns `{ok: true}`. A transient API error silently swaps verified extraction for model invention, presented as success.
- `classify-structures` is orphaned (zero callers) but live, admin-secret-reachable, uses a taxonomy **incompatible** with the matcher's `LegalStructure` vocabulary (only 3 values overlap), writes at trust 60, and its prompt mandates "NEVER return an empty array". Anyone with the admin secret can poison `eligible_structures` catalogue-wide.

### `classifyUnclassified` cannot reach review rows

It filters `.eq('is_active', true)`, but review rows are `is_active=false`. So `cf-fund-verify`'s `pipeline_state !== 'tagged'` gate can only be satisfied via `process-pipeline-queue` — the 12-row/day chain. CF fund verification is throttled behind that.

---

## 5. Stage 5 — Review and publish

### The surface

`src/app/dashboard/admin/urls/page.tsx` — **5,442 lines**, 12 tabs. Default tab is `dead`, not Needs Review. Needs Review and Captured overlap: a `captured` row appears in both with different action sets and no cross-tab invalidation.

### Clicks to publish

- **Fast lane: 4 clicks publishes the entire queue.** Sidebar → tab → "Approve all N" → confirm. Chunks of 50 with `{is_active: true}`. Zero inspection. **Any staged edits in `reviewEdits` are silently dropped** — only `is_active` is sent.
- **Careful per-row: ~10-25 interactions + 2 blocking AI waits.** Enrich (45-50s), auto-fires Detect all → classify (up to 300s), read the funder page in another tab, then correct tags across 49 chip options. `expandedReviewId` is a single string and `if (enrichingId) return` serialises enrichment, so you cannot start row 2 while row 1 thinks. Realistically 1.5-3 min/row, dominated by dead time.

### What the reviewer cannot see

- **`pipeline_state` is fetched and never rendered. `is_active` is never rendered.** The Needs Review header asserts "not yet visible to users" while the query never filters `is_active` — and 141 of 172 queue rows are live. You cannot tell whether you are approving something new or re-approving something already in front of users.
- **The evidence is a tooltip.** The citation snippet justifying a LOW-confidence value exists only in a `title=` attribute — hover-only, unselectable, gone on mouse-out. No `raw_data` is rendered anywhere, so verification always means leaving the app.
- No `url_status` badge, no `url_quality_score`, no dedup signal, no `provenance.previous` (stored, never surfaced, so no revert).
- The Completeness scorecard nags about `title`, `funder`, `apply_url`, `description` — four fields the panel cannot edit. `description` is reachable only through an LLM modal that rewrites eight other fields simultaneously.

### No reject-with-reason

`pipeline_state='rejected'` and `rejection_reason` exist but are written only by `sweep`, which no UI calls. "Not a real fund" and "dead link" both collapse into `archived` with no recorded reason.

### The publish path does not check its own response

```ts
await fetch('/api/admin/update-grant', { method:'PATCH', … })
setReviewGrants(prev => prev.filter(g => g.id !== id))
```

No `res.ok`. An expired session (401) or a 500 makes the row **vanish from the queue unpublished, with no error**. This is the code path behind both "Confirm & Publish" and every single-row approve. The same fetch-and-forget pattern covers `saveUrl`, `saveTitle`, `markDead`, `markOk`, `toggleInviteOnly`, `removeGrant`, `batchDelete`, Save-for-later, and Between-rounds actions.

Six of eight queue loaders ignore their `error`, so a failed query renders **"No grants pending review — all clear!"**

### Auth

There is **no `/dashboard/admin/layout.tsx`**. The only ancestor gate is "logged in". Each page gates itself, and several do not:

- **`/dashboard/admin/intelligence` has zero authorization code and can publish grants.** It is de-linked from the nav, and its inline title/URL edits go through the browser client against a SELECT-only RLS policy, so they silently fail and are lost on reload.
- The admin root, plus the Discovery / 360Giving / FillAmounts panels: logged-in only.
- Four-plus sources of truth for "who is admin": env `ADMIN_EMAILS` vs hardcoded `paulkilty1@gmail.com` in six files. A second admin added via env gets API access but no nav and no Grant Manager.

### Bulk ops run in your browser tab

"Enrich all unenriched" is a per-row `fetch` loop with an 800ms sleep, no server-side job, and **no limit**. For a 300-row backlog that is a pinned tab for 30-60 minutes; navigating away loses the remainder with no record of where it stopped and no resume.

---

## 6. Stage 6 — Post-publish maintenance

### URL checking still swallows errors

The TLS fix landed (`isTlsCertError`), but the catch-all survives at `url-validator.ts:310` and `:429`, returning **`ok`**. Unhandled: timeouts (10s abort), `ECONNREFUSED`, `ECONNRESET`, socket hang-ups, **and HTTP 5xx and 403** (only 404/410/400 return `dead`). A persistently unreachable page reads as verified. Line 310 returns `status:'ok'` with `qualityScore: 25`, bypassing the `<30 → wrong_page` classification, so it is not even flagged as suspicious.

`checkUrl` and `deepCheckUrl` disagree on funder-name mismatch (`dead` vs `wrong_page`), and the cron uses one for catalogue rows and the other for seed rows — two severities in one run.

### Dead is a one-way door

`validate-urls` selects `.eq('is_active', true)` and deactivates on dead, so **a row it kills is permanently excluded from future checks.** A URL that comes back to life is never rediscovered; recovery needs a manual `rescue-dead-urls` run, which is not scheduled. Combined with the false-`ok` problem above, wrongly-killed rows are permanent.

Also, `grant_closed` is stored as `url_status='dead'`, collapsing "round closed on a healthy page" into the same bucket as a 404 — and deactivating a grant that will reopen, pre-empting `expire-grants`' careful roll-forward logic.

### `url_status='unchecked'` hides nothing

The validator comment claims `wrong_page → 'unchecked'` is "hidden from default search". Web surfaces only exclude `dead`. Only MCP gates on `url_status='ok'`. **So TLS-failed and wrong-page rows are invisible over MCP and fully visible in the web app** — two surfaces, two freshness contracts.

### `is_rolling` compounds

Four scrapers derive `is_rolling = !deadline`; ~25 hardcode `true`. A deadline parse failure becomes "rolling", and `is_rolling=true` is a **hard exclusion** in both `expire-grants` and `fill-deadlines` — the two jobs that could correct it. Same-source ownership means the next crawl re-asserts it. The DB trigger overwrites even admin pins. Permanently frozen as "Rolling deadline" and treated as always-open by the matcher.

### Feedback loops: none close

- **`match_feedback`** (156 flags, ~85% negative) is read by a manual admin page and a newsletter filter. **Nothing writes back to `scraped_grants`.** The admin page also mis-joins: `grant_id` stores `external_id ?? uuid` but it queries `.in('id', …)`, so scraper rows miss and the title falls back to the raw id.
- `grant_interactions`: `liked`/`disliked` have no consumer at all.
- **`watchlist_alerts` is the one genuine change-detection loop** — and it requires you to open that page.

### Observability: everything terminates in logs

No metric store, no alert, no notification for catalogue health.

- `golden-queries` runs weekly and `return NextResponse.json(...)`. **No persistence, no threshold, no notification.** The matching regression suite's pass/fail evaporates into a cron log.
- `crawl_errors` (167 unresolved) has no reader; the warning tells you to run SQL.
- `budgetExceeded`, `deactivated[]`, per-row reenrich results: response body only.
- `crawl_logs` is written inside a bare `try {} catch {}` — if the insert fails, the crawl reports success.
- **The one at-a-glance health KPI is miscalibrated:** `admin/page.tsx` uses `30 * 3_600_000` = **30 hours** against a twice-weekly crawl. From roughly Tuesday afternoon every source reads stale and "🔴 Issues" is pinned high. `30 * 24 * 3_600_000` was almost certainly intended. Guaranteed alarm fatigue on the only number you glance at.

### Schema drift

`last_reenrich_attempt` is queried and written by `reenrich-stale` but has **no migration**, is absent from `supabase/schema.sql`, and exists only in prod (commit `63f86ff`). Any rebuild from the documented baseline makes the cron 500 on fetch — and since it is easy to assume that cron is gated off, the breakage would be silent.

---

## 7. The plan

Sequenced so that each phase makes the next one safe. Sizing is rough and deliberately conservative.

### Phase 0 — Stop the lying (about 1-2 days, no new features)

Nothing here adds capability. It makes existing capability real.

1. **Swap the anon client for service-role in `expire-grants` and `check-stale-rounds`.** Two-line change each. Verify by checking for `system:expire_grants` in `field_provenance` after one run. This alone restores automated deadline lifecycle management.
2. **Fix the `check-stale-rounds` / `check-coming-soon` ordering conflict** so the candidate predicate can actually match. Either capture `next_open_date_parsed` before nulling it, or key staleness off a preserved column.
3. **Route the four `is_active` bypasses through `mergeGrantUpdate`** (`check-coming-soon`, `validate-urls`, `sweep` Rule 5, `flag-grant`) so `transitionPipelineState` fires. This stops the dead zone from growing.
4. **Backfill the existing desync:** 112 `published`+inactive rows and 9 `archived`+active rows.
5. **Fix `flag-grant`** — match on `id` with the `external_id` fallback, and use the service-role client. Then the user-flag safety valve works for the first time.
6. **Fix `url-validator`'s catch-all:** return a distinct non-`ok` status for network errors, and handle 5xx/403. Stop recording unreachable pages as verified.
7. **Stop `grant_closed` collapsing into `dead`** so `expire-grants` can do its roll-forward job.
8. **Make `validate-urls` re-check its own casualties** (drop the `is_active=true` filter, or schedule `rescue-dead-urls`).
9. **Check `res.ok` in `approveGrant`** and every fetch-and-forget admin action, before optimistically mutating the list.
10. **Write the `last_reenrich_attempt` migration.**
11. **Fix the health KPI window** (30 hours → aligned to crawl cadence).
12. **Delete `/dashboard/admin/intelligence`** (zero auth, can publish, RLS-broken writes) and `classify-structures` (orphaned, incompatible taxonomy, catalogue-poisoning risk), and `api/send-alerts` (unreachable duplicate).
13. **Consolidate admin auth** into one `layout.tsx` gate plus a single source of truth.

### Phase 1 — Turn up throughput you already pay for (about 1 day)

> **UN-RETRACTED 2026-08-04 — the team upgraded to Pro, so this phase is live
> again as originally written.** The 1 August retraction below was correct at the
> time and is kept for the record. `process-pipeline-queue` has since had
> `BATCH_LIMIT` raised 12 → 24, so the daily run now does 24/day rather than 12;
> the cadence change is still the larger lever and is still unmade.
>
> **RETRACTED 2026-08-01 — the premise was false at the time. The account was Hobby.** Every
> `*/N` schedule below would fail silently and can block all deploys. On Hobby
> the levers are batch size and additional daily slots. `process-pipeline-queue`
> has since had `BATCH_LIMIT` raised 12 → 24; going further means a second daily
> cron entry, not a shorter interval.

- `process-pipeline-queue`: daily → `*/10`. **24/day → ~3,400/day.** Single biggest unblock; makes backlog drain a non-issue and unthrottles CF fund verification. **Viable again on Pro (2026-08-04); not yet done.**
- `reenrich-stale`: `BATCH_LIMIT` 6 → ~20, and/or run twice daily, so the 90-day cycle actually completes inside 90 days.
- `check-watchlist`: add `ORDER BY last_checked ASC NULLS FIRST` plus a cursor so coverage rotates. Currently half the list has never been checked.
- `validate-urls`: weekly → 2-3×/week.
- Merge the CF fund crons to `main` and set their env gates, or delete them.
- Add a lock (advisory or row marker) to any job that can now overlap.

### Phase 2 — Auto-publish behind a confidence gate (1-2 weeks) — *this is the time saver*

`cf-fund-verify` already proves the pattern: structured checks, auto-publish on clean, flag with reasons otherwise. Generalise it into one pre-publish verifier for every source.

**The inputs already exist and are already persisted.** Nothing new needs computing:

| Signal | Source |
|---|---|
| Per-field citation confidence | `field_provenance[f].citation.confidence` |
| Stale date phrases | `funder_brief._stale_dates` |
| Ungrounded £ figures | `funder_brief._ungrounded_amounts` |
| URL liveness + quality | `url_status`, `url_quality_score` |
| Amount plausibility | ratio + implausible-max thresholds from `cf-fund-verify` |
| Deadline plausibility | `sweep` rules, `NON_APP_DATE_CUES` |
| Tag agreement | `audit-tag-agreement`'s `suggestTags()` diff |
| Field completeness | `CORE_FIELDS` from the quality dashboard |
| Duplicate risk | `cf-fund-extract`'s `findExistingRowId` normaliser |

**The rule:** all-green → auto-publish, no human. Any flag → Needs Review with the reason rendered on the row.

**Two design constraints that matter:**

- **Auto-publish must write as `system:auto_publish` (trust 50), never `admin:`.** Auto-published rows stay improvable by future AI passes. This is the difference between automation that compounds and automation that fossilises.
- **Every auto-publish decision gets a persisted record** (which checks ran, which passed, the confidence score) so you can audit the gate's calibration later and tighten or loosen thresholds from evidence rather than feel.

Start conservative — require most checks green — then loosen as the audit trail shows the gate is right. Given 172 rows currently in the queue and the signals available, most should clear without you.

Also in this phase: **add real dedup**. A unique index on normalised `(funder, title)` or `apply_url` where non-null, and push the two `.limit(N)`-then-filter checks into SQL.

### Phase 3 — Stop the review gate degrading the machine (2-3 days)

1. **Track dirty fields in `GrantEditor` and pin only fields the reviewer actually touched.** Everything else saves at its original source and trust. This breaks the doom loop.
2. **`bulkEnrich` and `bulkDetect` must write as `ai_detect` / `ai_enrich`, never through the admin session.** They currently manufacture trust-100 locks across hundreds of rows with no human in the loop.
3. **Fix "Approve all"** to either include staged edits or state plainly that it discards them.
4. **Surface the `rejected` array everywhere**, not just for `funder_brief`. Silent no-op saves are worse than errors.
5. **Raise `ai_detect` above `scraper`**, or accept that `fill-*` output is disposable. Currently it is erased twice a week.
6. **Reject on strictly-lower *or equal* trust** for differing sources, so `ai_enrich:rerun:v1` cannot clobber a richer `ai_enrich:v2` brief. Better: fix or delete `bulk-reenrich`, which is a degraded fork.
7. **Add `niche_tags`, `funding_subtype`, `eligibility_criteria` to `TRACKED_FIELDS`** — they are matcher inputs with no provenance protection.

### Phase 4 — Render the confidence layer (3-5 days)

Only for rows that *do* reach you, make each decision 15 seconds instead of 3 minutes.

- Render `pipeline_state` and `is_active` on every review row. You must be able to see whether a row is already live.
- Show the citation snippet **inline and selectable**, not as a tooltip. Store and render enough `raw_data` that you never have to open the funder's site to confirm a value.
- Render the flags that already exist: `_stale_dates`, `_ungrounded_amounts`, the reclassify `diff`, `stale_since`, `raw_data.verify.flags`, `needs_intervention_reason`.
- Add reject-with-reason, writing the `rejected` state and `rejection_reason` that already exist in the schema.
- Surface quarantined rows (`needs_intervention_reason`) — currently invisible in every tab, and terminal.
- Allow the AI-suggested value and the prior value side by side with a one-click revert (`provenance.previous` is already stored).

### Phase 5 — Report to you instead of waiting for you (2-3 days)

You should never run SQL to learn the catalogue is degrading.

**One weekly digest email**, reusing the existing Resend integration:

- Auto-published this week / flagged for review / queue depth and trend
- Scrapers that returned zero with no error (the silent-failure class)
- `crawl_errors` unresolved count and top offenders
- `golden-queries` pass/fail **with history** (persist the results; alert on regression)
- Dead-zone count (should stay 0 after Phase 0)
- Rows past their staleness threshold
- Top negative `match_feedback` targets

Plus: persist `golden-queries` results, surface `crawl_errors` in the admin UI, and alert on threshold breaches rather than warning into a log.

Note the standing blocker from prior work: the three user-facing email crons stay disabled until alert-management UX exists. **An owner-only digest to your address has no opt-out requirement** and can ship independently.

### Phase 6 — Close the feedback loop, then widen sourcing

Only worth doing once the above holds.

- **Consume `match_feedback`.** 156 flags at ~85% negative is a free quality signal currently going nowhere. Route repeat-negative grants into review automatically. Fix the id-format join bug first.
- **Deal with the 66 static seeds honestly.** Either convert the high-value ones to real scrapers, or move them to a declarative registry with an explicit "last human verified" date so they stop masquerading as fresh crawler output.
- **Add a yield-zero alarm** so `creative_scotland` / `forever_manchester` / `london_cf` class failures surface immediately.
- **Then** widen: funding.scot, Idox, 360Giving at scale, borough coverage.

---

## 8. What your involvement looks like after

**Now:** you are the queue drain, the observability layer, and the incident detector. And each row you touch gets permanently harder for the machine to improve.

**After Phase 0-2:** the machine publishes what it can verify and shows you only what it genuinely cannot. Rows reaching you carry a reason.

**After Phase 3-5:** reviewing a row does not damage future automation; each decision takes seconds because the evidence is on screen; and you find out about problems from a weekly email rather than by wondering.

**Ongoing target:** a weekly digest to skim, and a short queue of genuinely ambiguous rows — the ones where a human judgment call is the actual product, not a data-entry tax.

---

## 8b. Scheduled: review the admin nav (Paul, 25 Jul — not urgent)

Six sections in the admin sidebar. Paul uses **Grant Manager** (the redesign
target) and **Users** ("good to keep tabs"); the rest he does not really use.
Worth a deliberate review of what to keep and how to present it, scheduled
rather than urgent.

Audit findings already in hand for each, which should make the review quick:

| Nav item | Route | What the audit found |
|---|---|---|
| **Grant Health** | `/dashboard/admin` | The at-a-glance KPI used a **30-hour** freshness window against a Mon+Thu crawl, so "🔴 Issues" was pinned high from Tuesday onward. Fixed in `3bed701`. Also hosts the Discovery / 360Giving / Fill-amounts panels, which are really *actions*, not health. |
| **Grant Manager** | `/dashboard/admin/urls` | 5,442 lines, 12 tabs. Being replaced by the three surfaces (Inbox / Catalogue / Grant detail). Eight of the twelve tabs become Catalogue filters. |
| **Tagging Quality** | `/dashboard/admin/quality` | Read-only completeness + provenance dashboard. Ungated until `3bed701`. Shows coverage but **no confidence signals** — no citation-confidence rollup, no stale-date or ungrounded-amount counts. Candidate to fold into Catalogue health filters. |
| **Cohort Matches** | `/dashboard/admin/cohort-match-audit` | Read-only. The only admin page that already used `requireAdmin()` server-side. |
| **Users** | `/dashboard/admin/users`, `/users/[id]` | Keep — Paul's stated use. Note `users/[id]` had **no auth gate at all** (user PII) until `3bed701`. |
| **Match Feedback** | `/dashboard/admin/feedback` | **Partly broken**: joins `match_feedback.grant_id` against `scraped_grants.id`, but that column stores the normalised id (`external_id ?? uuid`), so scraper rows miss and the title falls back to a raw id. 156 flags, ~85% negative, consumed by nothing else. |

Two structural questions the review should answer, not just a visual pass:

1. **Health vs actions.** Grant Health, Tagging Quality and the Catalogue health
   filters are three surfaces answering one question ("what's degrading?").
   The weekly digest (Phase 5) may replace most of it.
2. **What earns a nav slot.** A section Paul never opens is a section whose
   signal should be arriving by email instead. Nav position should track how
   often a human genuinely has to act, not how much data exists.

---

## 9. Docs drift to correct

- `CLAUDE.md`: "`scraped_grants` — ~300 rows" → **1,729**. "360Giving import — deferred post-beta" → **shipped and runnable**. Current-priorities section predates GA.
- ~~`docs/architecture-overview.md:37`: "On Vercel Hobby — daily-or-less crons only" → almost certainly **Pro** now (37 cron entries, 270-300s functions).~~ **Twice wrong, now resolved.** On 1 August this entry was itself the error — the account really was Hobby, and `architecture-overview.md` was correct. On 4 August the team upgraded to Pro, so the original entry's instinct was right after all and `architecture-overview.md` was stale again — corrected to Pro on 4 August in the same pass.
- `docs/strategy/deadline-accuracy-redesign.md:10`: "gated, `REENRICH_CRON_ENABLED=false`" → **is set to true in prod**.
- `crawl.ts:1-39` header: lists 34 sources, 14 deleted; the file has 97, mostly static.
- `crawl-grants/route.ts:1-8`: "split across 3 batches / ~15 sources" → **9 batches, 97 sources**.
- `urls/page.tsx:3527, :4919`: tells admins to "update URLs in `src/lib/grants.ts`" — that file is an empty array.
- `check-coming-soon:48,55`: comment claims it "moves to Needs Review queue" — it has not since the queue became `pipeline_state`-driven.
- `url-validator.ts:302`: claims `unchecked` rows are "hidden from default search" — only MCP hides them.
- `process-pipeline-queue:9,17`: claims a 5-minute cadence and ~140 rows/hour — it runs daily at 12/day.
