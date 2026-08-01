# Grant ingestion and management: how it works now

**Date:** 2026-08-01
**Supersedes the "current state" half of** `docs/ingestion-pipeline-scope-2026-07-25.md` (that doc stays the canonical record of *why* each change was made, and of the phase plan).
**Sources:** code on disk, `vercel.json`, and live Supabase (`yrndczlqjqtfgissleev`) queried 2026-08-01.

---

## 0. Headline

The July audit found a pipeline that reported success while writing nothing, and a review gate that made the catalogue permanently harder to improve. Both are fixed. What replaced them:

1. **A row now arrives carrying reasons.** `deriveReviewReasons()` computes 21 structured codes from signals the enrichment layer was already persisting but nobody rendered. Every review surface reads that one function.
2. **A publish gate decides on "wrong", not "missing".** 11 codes block, 10 are informational. A row with no amount is incomplete but honest; a row with an amount that appears nowhere on the funder's page is wrong. That distinction is why auto-publish went from a modelled 0% to roughly 60%.
3. **Three new admin surfaces replaced a 5,400-line, 12-tab page.** Review queue (decide), Catalogue (find anything), Grant detail (see the evidence). The old Grant Manager survives only for the jobs the new surfaces do not cover yet.
4. **Reviewing no longer damages the machine.** Accepting a row writes only `is_active` and `pipeline_state`, neither of which is a tracked field, so nothing gets pinned to trust 100 and everything stays improvable by future AI passes.

**Status of the gate, updated end of 1 August:** armed. Two detectors were added
after a dry run showed roughly 16 of the 38 rows it would newly expose had a
defect; a 5-row canary confirmed the write path; the branch is merged, the cron
runs daily at 09:00, and `AUTO_PUBLISH_ENABLED` is set. See §5 and §10.

**Platform constraint that governs all of this: the account is Vercel Hobby, not
Pro.** Verified against the Vercel API on 1 August, both personal and team.
Cron schedules must be daily or less frequent; a sub-daily entry fails silently
and has previously blocked every deploy. The 25 July scope doc asserts Pro and
builds its throughput phase on it — that phase is retracted in place.

---

## 1. Where the numbers stand (live, 2026-08-01)

| | |
|---|---|
| Rows in `scraped_grants` | **1,802** |
| Live to users (`is_active` and `url_status <> 'dead'`) | **736** |
| Waiting in the Review queue | **133** |
| Archived | 859 |
| Rejected | 9 |

By `pipeline_state`:

| State | Inactive | Active | Note |
|---|---:|---:|---|
| `captured` | 1 | 0 | queue is essentially drained |
| `tagged` | 64 | 2 | |
| `tagged_awaiting_review` | 4 | 62 | mostly rows already in front of users |
| `published` | **137** | 663 | the 137 are the dead zone, see §6 |
| `archived` | 850 | **9** | the 9 are live while flagged archived |
| `rejected` | 9 | 0 | |
| `between_rounds_scheduled` | 1 | 0 | state is never written by code |

Other live figures:

- **Crawl:** 44 sources, Mon and Thu, ~280 rows touched per run, 3 erroring. Down from 97 sources by deliberate retirement (`d733bf0`, `def8860`, `d897da3`), not by failure.
- **Discovery queue:** 52 pending, 20 processed, 13 rejected.
- **Publish gate:** 864 decisions recorded, 76 actually applied. Last run 26 July.
- **Pinning debt:** 376 of 736 active rows still carry at least one `pinned: true` field. The *cause* is fixed; these are historical artefacts.
- **Provenance mix:** 6,053 `admin:` entries against 2,252 `ai_enrich:`. That ratio is the residue of the old doom loop.

---

## 2. Sourcing: four inlets

Everything lands `is_active = false`, state `captured`, via `stampNewGrant()`.

| Inlet | Route | Schedule | Armed by |
|---|---|---|---|
| **DOM scrapers** (44 sources, 9 batches) | `cron/crawl-grants` | Mon + Thu, 06:00-06:40 | always |
| **Community Foundations** (30 CFs, AI extraction) | `cron/crawl-cf-funds` | Mon, 05:00-05:40 | `CF_FUND_PIPELINE_CRON_ENABLED` |
| **Web-search discovery** (3 hops via `discovery_queue`) | `cron/discover-sweep` → `admin/discover-grants` → `admin/process-discovery-queue` | Tue 08:30 and 09:30 | `DISCOVER_SWEEP_ENABLED`, `PROCESS_DISCOVERY_ENABLED` |
| **Manual / 360Giving** | `admin/promote-grant`, `admin/ingest-360giving` | on demand | — |

Two things worth knowing:

- **Scrape-time temporal gate.** A deadline more than 7 days past at scrape time inserts straight to `rejected` with `rejection_reason: 'historical_deadline'`. It never reaches the queue.
- **Dedup is uneven.** `crawl.ts` keys on `external_id` only, which is null on a large share of rows. The CF extractor is better: `apply_url`, then funder+title, then `external_id`. A single normalised uniqueness constraint is still outstanding.

---

## 3. The chain: captured → tagged

`cron/process-pipeline-queue`, daily 07:30, 24 rows per run, 240s wall-clock budget.

Per row, three self-HTTP calls in order:

| Step | Route | Writes as | On failure |
|---|---|---|---|
| 1. Enrich | `admin/enrich-grant` | `ai_enrich:v2` (60) plus three `ai_extract:*` (50) for amounts, income, investment terms | **fatal** → quarantine |
| 2. Classify | `admin/classify-grants` | `ai_classifier:v3` (60) | warn only, chain continues |
| 3. Sweep | `admin/sweep` | `system:sweep:v1` (50) | **fatal** → quarantine |

Quarantine writes `needs_intervention_reason` and is **one-shot with no retry**. The row is excluded from the queue predicate until someone nulls the field.

The state flip to `tagged` is a side effect, not an explicit write: `transitionPipelineState()` rule 4 fires when a `captured` row gets any tracked field written by an AI source.

**Enrichment quality signals**, all persisted and now all rendered:

- per-field **citations** (`snippet`, `confidence`, `reason`) in `field_provenance`
- `funder_brief.source` = `live_fetch` or `knowledge_fallback` (written from memory, not the page)
- `_stale_dates`, `_ungrounded_amounts` (£ figures with no matching wording in the citation)
- `raw_data.checks` flags for pot-vs-per-applicant amounts

**Page health** (`src/lib/page-health.ts`, added 30 July) judges the page rather than the HTTP status, because a parked domain answers 200 on every path. Four verdicts: `parked`, `soft404`, `too_thin`, `empty`. The threshold is **800 characters**, set deliberately after 400 let a 600-character form-confirmation page read as healthy.

---

## 4. The trust ladder

Every tracked write goes through `mergeGrantUpdate()`. 28 tracked fields; `is_active`, `pipeline_state`, `url_status` and `raw_data` are **untracked** and carry no provenance.

| Source prefix | Trust |
|---|---:|
| `admin:` | 100 |
| `360giving:` | 80 |
| `ai_classifier:` / `ai_enrich:` / `ai_audit:` | 60 |
| `system:` / `ai_extract:` / `manual_extract:` | 50 |
| `scraper:` | 40 |
| `ai_detect:` | 30 |
| `seed:` / `discovery:` | 25 |
| unrecognised | 10 |

Two rules that matter in practice:

- **Amounts write at `ai_extract` (50), above `scraper` (40)**, so they survive the twice-weekly crawl. `admin/fill-amounts` writes at `ai_detect` (30) and is therefore erased every crawl.
- **A `pinned` field can only be overwritten by an `admin:` source.** This is the mechanism behind the old doom loop, and the reason the new review UI is careful never to write a tracked field on accept.

---

## 5. The publish gate

`src/lib/admin/publish-gate.ts`, policy version `c1`. Paul chose Policy C from four modelled options: **block on wrong, not on missing.**

### The 21 reason codes

**Blocking (11)** — a user acting on this row would be misled:

| Code | Why it blocks |
|---|---|
| `no_brief` | nothing was ever read; every field unsourced |
| `page_unreadable` | brief written from the model's memory |
| `quarantined` | the chain gave up; state unknown |
| `link_dead` | the apply link does not resolve |
| `deadline_passed` | sends someone at a closed round |
| `amount_inverted` | minimum above maximum |
| `amount_pot_suspected` | whole-fund figure shown as per-applicant |
| `amount_ungrounded` | £ figure with no matching wording on the page |
| `eligibility_missing` | **over-matches.** `matching.ts` only applies the hard structure gate when the array is non-empty, so an untagged row falls through to soft matching and reaches orgs that cannot apply |
| `applicant_not_social_sector` | real fund, correctly described, but no one this catalogue serves can win it |
| `tags_changed` | **only at `critical`**, meaning a re-read narrowed eligibility |

Two more were added on 1 August, after dry-running the gate against the live
queue showed that roughly 16 of the 38 rows it would newly expose had a defect:

| Code | Why it blocks |
|---|---|
| `applicant_individual_only` | `eligible_structures` is exactly `['individual']`. The type definition in `src/types/index.ts` already made the argument: `individual` is grant-side only and every organisation in the database holds an organisational form, so such a list says no user can apply. A mixed list does not block. Six rows. |
| `deadline_implausible` | A deadline more than 12 months out. Calibrated, not picked: all 8 rows in the active-or-queued population beyond 12 months were programme lifetimes (four BFI screen funds to 2029, DWP Youth Jobs to 2028, HS2 to 2035). Five rows. |

**A third rule was specified and deliberately not built.** A flat `amount_max`
ceiling would have blocked 35 rows, most of them correct: Triodos business loans
at £20m, Innovate UK innovation loans at £5m, and a Heritage Fund row whose own
title reads "£250,000 to £10million". A threshold cannot separate a whole-pot
figure from a genuinely large fund; grounding evidence can, which is what
`amount_ungrounded` already does. The cost of declining is that pot-as-max
errors still need a better detector.

**Informational (10)** — incomplete but honest, absence renders as absence:
`no_amount`, `no_deadline`, `sectors_missing`, `beneficiaries_generic_only`, `amount_zero`, `amount_under_stated`, `multi_round_uncaptured`, `link_unverified`, `stale_dates`, `stale_enrichment`.

`link_unverified` does not block because 57 of 60 such rows were `url_status='unchecked'`, never validated, rather than validated and found bad.

`POLICY` is an exhaustive `Record<ReviewReasonCode, …>`, so adding a new reason code without classifying it **fails `npx tsc --noEmit`**. A new detector cannot be computed, persisted and then silently ignored by the gate.

### Three outcomes, not two

```
blocking.length === 0        → publish
blocking && already live     → attention     (surfaced first, never retracted)
blocking && not visible      → hold
```

The third outcome exists because most of the queue was already live to users, so "hold" protected nobody. And of the live-and-blocking rows, most block because a re-read *narrowed* eligibility: narrowing hides a fund from some orgs, deactivating hides it from all. Retraction would be the bigger error.

### Status: armed, 1 August

- `AUTO_PUBLISH_ENABLED=true` in Vercel production.
- Cron entry `{ "path": "/api/cron/auto-publish", "schedule": "0 9 * * *" }` — daily 09:00 UTC, 90 minutes after `process-pipeline-queue`, so a row enriched that morning is gated the same day. Daily because the account is Hobby.
- Writes as `system:auto_publish` (trust 50), never `admin:`, so auto-published rows stay improvable.

**Canary, 1 August.** `?apply=true&limit=5` against production. The route sorts
already-live rows first specifically so a capped run exercises the merger, the
trust ladder, the state transition and RLS while changing nothing a user sees.
Result: `written: 5`, `failed: []`, `publish_gate_decisions.applied` 76 → 81,
all five `was_live`, `rejected_fields` empty on all five, and `live_to_users`
736 before and 736 after.

**Split at the point of arming** (queue 130, after the detector work and five
hand-fixes): publish 58 (28 newly visible, 30 already live), attention 32,
hold 40. Hold is led by `eligibility_missing` (15), `link_dead` (8),
`applicant_individual_only` (6) and `deadline_implausible` (5).
- **Verify a run** with `pipeline_state='published'` plus `publish_gate_decisions.applied`. Do *not* grep `field_provenance` for `system:auto_publish`: the gate writes only `is_active`, which is untracked, so it stamps nothing there and a working run looks like a silent failure.

> Doc drift: `supabase/migrations/045_publish_gate_decisions.sql` still says "NOT YET APPLIED TO PROD" in its header. It **is** applied; the table holds 864 rows. Worth correcting so nobody re-applies it.

---

## 6. The admin UI

Three new surfaces landed 25 July, all behind a single `requireAdmin()` gate in `admin/layout.tsx` (added after an audit found 5 of 12 admin pages ungated, including one that could publish and one exposing user PII).

### Review queue — `/dashboard/admin/review`

The decide surface. Loads the four queue states plus a second feed of published-but-stub rows.

- **Views:** `Everything` / `Live to users` / `Not live yet` / `Needs enrichment`, each counted.
- **Why held:** a second chip row, one chip per reason code present, counted.
- **Search** (added 1 August): every other filter here is by category, so reaching a *named* row meant going to Catalogue and back. Applied before every count, so a chip's number still describes what clicking it would show. An empty result says the row may be published already and points at Catalogue, rather than implying it does not exist.
- **See what a user sees** (added 1 August): mounts the same real public modal against the same real public API the Grant detail page uses, keyed on `external_id ?? id`. Deciding "is this good enough to show someone" previously meant opening the detail page for every row.
- **Banner:** states plainly how many of the rows are already visible to users, so you know whether you are revealing something or confirming it.
- **Bands:** "Live to users, and wrong" first, then "Not visible to users", each sorted closest-to-finished first.
- **Every row carries one sentence and the button that answers it.** For example a dead link reads "The application link is dead, so anyone who clicks through lands on nothing", with a `Fix the link` button. The primary button says "Looks right, keep it live" when the row is already live and "Looks right, publish it" when it is not.
- **Evidence on the card face:** up to two field diffs rendered as "took away X / added Y", each with a `Put it back` button that reverts exactly that one field.
- **Details drawer:** the full diff table, the citation snippet as selectable text with a confidence pill (it used to exist only in a `title=` tooltip), and what is recorded now.
- **Refused writes are surfaced.** Both `patch()` and `runJob()` read the `rejected` array and say "X is pinned to an earlier admin decision and was not changed", rather than reporting success.
- **No bulk publish in the UI.** Deliberate. The old "Approve all N" published the whole queue in 4 clicks and silently discarded every staged edit.

**The pinning discipline is the design premise:** Accept writes no tracked field at all. Revert writes exactly one. Reject writes only untracked fields. That is what stops review from fossilising the catalogue.

### Catalogue — `/dashboard/admin/grants`

The find-anything surface, URL-driven and shareable. Search across title, funder and description; filters for state and funding type; `Everything` / `Live to users` / `Hidden` views whose counts are computed with the same filters applied, so a tab's number always describes what clicking it would show. It exists because the Inbox only shows rows awaiting a decision, and the old Grant Manager's search was inert on six of its twelve tabs.

### Grant detail — `/dashboard/admin/grants/[id]`

The evidence surface. Read-first, no "Save all" button. Shows what is recorded, the tags the matcher actually uses (with provenance source, `admin:` in coral, and pin markers), what the last re-read changed, all nine brief fields each with its confidence pill and citation snippet, extra sources you can add and re-read from, and a full `field_provenance` table.

`See what a user sees` mounts the **real** public grant modal against the **real** public API, on the grounds that a mock-up would drift from the thing it depicts and quietly start lying.

### What survives of the old Grant Manager (`/dashboard/admin/urls`)

Still 5,376 lines and still linked, but now only for what the new surfaces do not cover: `Add funder`, `Saved for Later`, the bulk enrichment runners, and the URL validation and deep-audit jobs. Its Needs Review, Tag Review, Captured, All grants, URL Issues and By Category tabs are superseded.

Also in the nav: Grant Health (per-source crawl health, thresholds recalibrated to 96h for a Mon+Thu crawl), Tagging Quality, Cohort Matches, Users, Match Feedback.

---

## 7. Post-publish maintenance

| Job | Schedule | What it does |
|---|---|---|
| `expire-grants` | daily 02:00 | Past deadline: roll forward from the `deadline_cycle` column, else prose-parse the brief. No roll → `next_open_date = 'Closed, next round TBC'`, stays live. |
| `reenrich-stale` | daily 03:30 | 6 rows. Re-runs the chain on anything older than 90 days, diffs 9 fields, flips changed rows to `tagged_awaiting_review`. Armed by `REENRICH_CRON_ENABLED`. |
| `check-coming-soon` | daily 07:00 | A `next_open_date` that has arrived → back to `captured` for re-check. |
| `validate-urls` | Sun + Wed 03:00 | Three passes: live rows, recovery of previously-dead rows, and a queue pass so `link_unverified` is a signal something can actually clear. Dead → archived. Round closed on a healthy page no longer collapses into "dead". |
| `check-watchlist` | Sun + Wed 04:00 | Fingerprints 239 funder listing pages, raises alerts. Now rotates coverage (`ORDER BY last_checked ASC NULLS FIRST`); previously half the list had never been checked once. |
| `verify-cf-funds` | Mon + Thu 08:00 | The only currently-armed auto-publisher. CF rows only, 10 structured flag codes, publishes on zero flags. |
| `golden-queries` | Tue 05:30 | Matcher regression suite. Read-only, and its output still goes nowhere. |

---

## 8. Open items

**Decisions for Paul:**

1. ~~**Arm the publish gate.**~~ **Done 1 August.** See §5.
2. **The 137-row dead zone.** `published` and `is_active=false`: invisible to users *and* to every admin queue, reachable only by SQL. It was 112 in July, so it is still growing. The backfill was scoped but never run.
3. **The 9 mirror rows:** `archived` and `is_active=true`, live to users while flagged archived.
4. **376 rows still carry a pin.** The cause is fixed but the artefacts block AI improvement on those fields. Needs a decision on whether to strip non-reviewed pins in bulk.

**Known-inert code:**

- `check-stale-rounds` runs daily and provably cannot ever have a candidate; `check-coming-soon` nulls the column its predicate depends on. Delete or repoint.
- `pipeline_state` values `enriched` and `between_rounds_scheduled` are never written by any code path, yet `enriched` appears in every queue predicate.
- `ADMIN_SECRET` and `CRON_SECRET` hold the same value, which makes the "manual admin trigger bypasses the cron gate" branch unreachable for bearer callers. `auto-publish` and `discover-sweep` work around it with a query-string discriminator.

**Doc drift — corrected 1 August:**

- ~~Migration 045's "NOT YET APPLIED TO PROD" header~~ — fixed; it is applied and the header now says so.
- ~~`CLAUDE.md` pricing~~ — fixed to Match £12/month, Apply £18/month, monthly and annual billing only. The old "£65/6 months, £115/year" was stale, and there is no 6-month term.
- ~~The scope doc's "you are on Pro"~~ — retracted in place, along with its `*/10` recommendation.

**Doc drift still open:**

- `CLAUDE.md` still says `scraped_grants` is ~300 rows (1,802) and that 360Giving import is deferred post-beta (it shipped).
- Header comments in `validate-urls` ("every Monday") and `check-watchlist` ("every Wednesday") disagree with `vercel.json` (both Sun + Wed).

**Still wrong in the queue, known and unfixed** (the gate does not catch these,
and they are the honest residue of the 1 August pass):

- Pot-as-max amounts with no grounding evidence, e.g. a £3.62m and a £7m figure both since fixed by hand, but the class remains undetected.
- `COMMERCIAL_ONLY_RE` reads prose and needs wording like "businesses **only**", so "Employers operating in Great Britain" and "UK sales agents" slip through.
- Nothing cross-checks the brief against the tags. One row's brief said "CICs cannot lead applications" while its tags listed both CIC types as eligible.

---

## 9. What Paul's involvement looks like now

**Before:** the queue drain, the observability layer and the incident detector, with every row touched becoming permanently harder for the machine to improve.

**Now:** rows arrive carrying reasons, the evidence is on screen so a decision does not mean opening the funder's site, and accepting a row costs the machine nothing.

**Still missing (Phase 5):** the weekly digest. Nothing reports catalogue health; you still find out by asking. `golden-queries` results, `crawl_errors`, and gate throughput all terminate in logs.
