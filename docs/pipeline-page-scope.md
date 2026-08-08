# Pipeline page — scope

**Date:** 2026-08-04
**Status:** scoped, not built.
**Why:** on 2 August, answering "did the auto-publish gate fire?" took four SQL
queries, a Vercel API call, a log check, and one wrong answer from a mis-parsed
line. It is the question Paul asks every morning. The page answers it at a glance.

---

## What it is

One table. Every scheduled job, ordered by next-due, red when overdue.

| Column | Source |
|---|---|
| Job | `vercel.json` |
| Schedule | `vercel.json` |
| Last run | `cron_runs` |
| OK / failed | `cron_runs.ok` |
| Rows in → out | `cron_runs.summary` |
| **Cost this run** | **`cron_runs.summary.usage`** |
| Next due | computed |

Schedules are read from `vercel.json` directly — it is checked into the repo, so
the displayed schedule cannot drift from the real one.

**Overdue is the point of the page.** Red when `now > next_due + grace`. Grace is
wide enough for scheduling drift: the 2 August gate run landed 34 minutes late
and was healthy. It should have shown amber, not red.

---

## What exists today

**Tier A — a real run log, one row per run.** Two jobs only.
`crawl-grants` → `crawl_logs` (source, batch, fetched, upserted, error, ran_at).
`auto-publish` → `publish_gate_decisions`, where a run is a `decided_at` group.

**Tier B — inferable from side effects.** Most jobs. `validate-urls` from
`max(url_last_checked)`, `reenrich-stale` from `last_reenrich_attempt`,
`check-watchlist` from `funder_watchlist.last_checked`, the enrichment chain from
`field_provenance` timestamps.

**Tier C — nothing.** `golden-queries`, `check-stale-rounds`, the unscheduled
email jobs.

### Why Tier B is not good enough, and is the whole argument for the table

**A job that runs and correctly changes nothing leaves no trace.** So "last ran"
goes stale and the page shows red on a healthy job — or, worse, a genuinely
broken job looks identical to one with nothing to do.

Not hypothetical: `expire-grants` has **zero** `system:expire_grants` entries in
`field_provenance`, ever. Broken again, or simply no deadlines to roll? On Tier B
evidence those are the same picture. That exact ambiguity is what the July audit
found — two crons reporting success while RLS silently rejected every write.

A page built only on inference would recreate the failure it exists to catch.

---

## v1

**1. `cron_runs`** — `job`, `started_at`, `finished_at`, `ok`, `summary` (jsonb),
`error`.

**2. `recordRun(job, fn)`** — a ~15-line wrapper. Each handler gains one line.

**3. The page** — the table above, sorted by next due, red when overdue.

**Why this is small:** every cron already computes its counts and returns them in
its HTTP response, then throws them away. `crawl-grants` already knows it touched
280 rows and added 12; the gate already returns `written` and
`publishBreakdown`. `summary` takes each job's existing response body verbatim.
We are persisting what exists, not calculating anything new.

Every entry in `vercel.json` is daily or weekly, so next-due needs a ~20-line
parser, not a cron library. (Sub-daily became possible on 2026-08-04 with the Pro
upgrade — if any job is re-cadenced to `*/N`, the parser must handle it.)

Wire it into all jobs at once. Doing half leaves a page you cannot trust, which is
worse than no page.

### 4. Token and cost capture — v1, not v2

**Cost per run is a column, not a feature.** It moves out of the v2 list because
it is the same `summary` jsonb the rest of the row already uses, and because the
number it produces is one nobody can currently answer.

**Today there is no token accounting in the ingestion pipeline at all.**
`src/lib/agent/` meters the goal agent, but `enrich-grant`, `classify-grants`,
`sweep`, `discover-grants` and `process-discovery-queue` all discard
`response.usage`. So "what did the catalogue cost last month" is unanswerable
from the system.

That gap is expensive in a specific way. The July scope doc's biggest
recommendation is raising `process-pipeline-queue` from daily to `*/10` — 24
rows/day to ~3,400. The per-row chain is Haiku 4.5, cheap per row, but the
multiplier turns roughly £0.30/day into roughly £40/day. **That decision should
be made against a measured baseline, and right now there isn't one.**

Two changes:

- **Any job that calls a model records usage in `summary`.** At minimum
  `{model, input_tokens, output_tokens, calls}` per model used. Jobs that make
  many calls (the per-row chain) accumulate across the run.
- **Detection-style scripts log `response.usage` rather than discarding it.**
  `scripts/detect-spend-restriction.ts` ran 621 rows on Opus 4.8 on 3 August and
  the actual spend is unrecoverable, because the script reads `content` and drops
  `usage`. The estimate was £6-8; nobody can confirm it. Any script that makes
  hundreds of model calls should end by printing what it cost.

Derive money from tokens at render time, not at write time — prices change, and a
stored figure silently becomes wrong while a stored token count stays true.

---

## Deliberately not in v1

Run history and sparklines, alerting on failure, surfacing `crawl_errors` (200
unresolved, read by nothing), persisting `golden-queries` results. All v2, once a
week of real data shows whether the page tells anyone anything they would act on.

---

## Sizing

| | |
|---|---|
| Table + helper | ~2 hours |
| Wire into all jobs, including usage capture | ~3 hours |
| Page | ~3 hours |
| **Total** | **about a day** |
