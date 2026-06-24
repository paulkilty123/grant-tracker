# Deadline & open-status accuracy — redesign scope

**Status:** Scoped 2026-06-24, **not built**. Post-launch. Builds on the existing freshness crons (don't rebuild those). Supersedes the placeholder [[project_deadline_systemic_redesign_pending]].
**Why now-ish:** the cohort/partners (SEUK/Expert Impact) expect "each grant is re-checked for accuracy on a cycle." That's true today for URLs, partial for deadlines, and **absent for open-status** — see the gap below.

## The problem (grounded 2026-06-24)
1. **Silent rolling default.** `opportunity-adapter.ts:863` returns `type='rolling'` for *any* row with no deadline AND no `next_open_date_parsed`. Result: **488 of 619 live rows (79%) display as "rolling"**, including **133 with no deadline signal at all** (`is_rolling=false`, no dates) — they show rolling only because we have nothing better.
2. **Rolling rows are never re-verified.** `expire-grants` explicitly skips rolling rows, and nothing else re-checks open-status. So a fund that has quietly closed (e.g. **Impetus** — a 2022-closed round still showing live in 2026) persists indefinitely.
3. **`is_rolling = !deadline` over-flag.** Scrapers set rolling whenever a deadline didn't parse, so deadline-parse failures become permanent "rolling" ([[project_is_rolling_overflag]]).
4. **The one content-freshness loop is off.** `reenrich-stale` is gated (`REENRICH_CRON_ENABLED=false`), ~30 rows ever touched, 6/day even if on (~3.5-month full pass), and refreshes brief/tags **not** status.

**Net:** there is no systematic per-grant open-status re-verification. This redesign is as much about *that missing accuracy cycle* as about the deadline display.

## What's already in place — DO NOT rebuild
- **validate-urls** (weekly, `0 3 * * 0`): every active `apply_url` re-checked; dead → `url_status='dead'` + auto-deactivate. Strong; all 619 ≤14 days. Uses `url_last_checked`.
- **expire-grants** (daily): past-deadline → inactive; multi-round funds auto-roll from `decision_timeline`. Dated grants only.
- **check-stale-rounds / check-coming-soon** (daily): `next_open_date_parsed` transitions → Needs Review. Only rows that *have* a next-open date.
- **crawl-grants** (Mon+Thu, 9 batches): re-scrape scraper sources via the merger. Manual/seed (external_id null) not re-crawled.
- **check-watchlist** (weekly): funder-page fingerprint diff → `watchlist_alert`. Funders on the list only (~200).
- **reenrich-stale** (daily, GATED OFF): brief/tag refresh; the place a status-check could fold into.

## Redesign components (build #2 first — it's the foundation)
1. **Stop the silent rolling default** (`adapter:863`). No-deadline + no-next-open + not-verified-rolling → an explicit **"status unverified / needs check"** state, not `rolling`. Genuine rolling must be a *positive, verified* signal.
2. **Per-grant open-status verification cycle — THE missing accuracy check.** Add `status_verified_at` (per row). A batched cron re-checks each grant after **N days (target 30)**, prioritising the 488 rolling/no-deadline blind-spot rows: fetch the funder page → detect open / closed / between-rounds / genuinely-rolling → update status + `status_verified_at`, or flag to Needs Review when ambiguous. Reuse the `validate-urls` batching pattern. This is the systematic "every grant checked on a cycle" loop the partners expect. Throughput: 619 / 30d ≈ **21 checks/day** — well within a batched cron.
3. **Scraper `is_rolling` fix.** Stop `is_rolling = !deadline`; only set rolling on a positive rolling cue; a deadline-parse failure → "status unverified," not rolling.
4. **Between-rounds detection.** Improve `next_open` extraction so cyclic funds render `between_rounds` (with a next-open date) rather than defaulting to rolling.
5. **Enable / fold in `reenrich-stale`.** Turn on the gated freshness loop (calibrated) or merge the status-check into it; raise throughput so a full pass is ≤ the target cycle (6/day = 3.5 months is too slow for a 30-day promise).

## Honesty / sequencing
- Until #2 ships, the "every grant re-checked every ~30 days" message is true for **URLs only** — keep external claims (SEUK, landing copy) to "links checked weekly; deadlines tracked daily" and avoid implying full status re-verification.
- #1 + #3 are small (adapter + scraper logic). #2 is the substantive build. #4 moderate (extraction). #5 is config + throughput.
- The **watchlist** already gives a coarse safety net (funder-page changes) and is where we now park anything archived-as-closed (Impetus pattern) — #2 makes it per-grant and systematic.

Relates to [[project_deadline_systemic_redesign_pending]] · [[project_is_rolling_overflag]] · [[feedback_detect_deadline_null_paths]] · [[project_catalogue_hygiene_backlog]] (threads 3 & 4).
