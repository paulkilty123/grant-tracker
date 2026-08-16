// Routine discovery sweep — the safety net for funders no scraper can reach.
//
// WHY THIS EXISTS
// 50 sources were retired on 2026-07-26 as hardcoded literals with zero live
// rows, and three more because their sites return 403 to every non-browser
// fetch: Arts Council England, the GLA, and Arts Wales' archived path. Those
// three are real funders with real money, and losing the scraper meant losing
// the coverage — unless something else looks for them.
//
// A web search is that something, and it is the RIGHT route rather than a
// workaround. Arts Council's robots.txt permits this use explicitly
// ("Content-Signal: search=yes, use=reference", "Allow: /"), and a search reads
// search-engine results rather than their WAF-protected pages. A reader proxy
// would have been neither permitted nor technically workable.
//
// WHAT IT DOES NOT DO
// Nothing here reaches users. Every result lands in discovery_queue for review,
// exactly as the manual Discovery panel does. This widens the net; it does not
// widen what is published.
//
// Sequential on purpose: each query runs a live search with adaptive thinking
// and takes tens of seconds. Firing them in parallel would blow maxDuration and
// return a partial sweep that looked like a complete one.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import {
  DEFAULT_QUERIES,
  BLOCKED_FUNDER_QUERIES,
  type DiscoveryFundingType,
} from '@/lib/discovery-queries'
import { recordRun, type RunYield } from '@/lib/admin/cron-runs'

export const dynamic     = 'force-dynamic'
export const maxDuration = 300

/**
 * How many queries one run attempts, when no slice is named.
 *
 * Each is a live search taking tens of seconds, so the cap is a time budget, not
 * a preference. It is reported in the response — a sweep that stopped early
 * must never read as a sweep that finished.
 */
const MAX_QUERIES = 5

/**
 * WHY THIS ROUTE IS SLICED.
 *
 * The unsliced queue is over-subscribed and always was: two targeted queries at
 * ~34s plus one general query at ~246s is 314s against a function cap that has
 * never been higher than 300s. The look-ahead budget check did its job and
 * skipped the general queries, correctly, on every single run.
 *
 * The effect was that the three rotated general queries were skipped 100% of the
 * time, permanently, and nobody noticed because `stoppedEarly: true` was the
 * normal state. Those three cover social investment, blended finance and CDFI
 * lending, so the one part of the catalogue with the thinnest coverage (29 live
 * investment rows, 5 added in 90 days) was fed by a code path that had never
 * executed.
 *
 * Arithmetic could not fix it: 246s is measured, not padding. One general query
 * needs a whole invocation. So the work is split and each slice is scheduled
 * separately, the same shape crawl-grants already uses with `?batch=`.
 *
 *   targeted — the blocked funders, ~68s for both
 *   general  — exactly ONE rotated thematic query, ~246s
 *   (none)   — every query, budget-limited. Manual use and backwards compatible.
 */
/**
 * One query per invocation, always starting from elapsed zero.
 *
 * `targeted` used to mean BOTH blocked funders in one run, and on 2026-08-15
 * that killed the function. Arts Council England took 192 seconds against a
 * hardcoded estimate of 60; the look-ahead check then did 192 + 60 = 252,
 * decided it fitted inside the 270s budget, and launched a GLA query that could
 * never finish. Vercel killed the parent at 300s, `recordRun` never reached its
 * close, and the run recorded `ok IS NULL` — invisible unless someone looked.
 *
 * The real defect was arithmetic, not the estimate: with a fixed 250s abort, any
 * query starting later than 50s in has `start + 250s > 300s`, so THE TIMEOUT
 * THAT EXISTS TO PREVENT THIS CAN NEVER FIRE FIRST. The general slice survived
 * only because it runs one query from a standing start, and even that took 247
 * of its 270 seconds on the 15th.
 *
 * So the fix is to remove the arithmetic rather than correct it, the same shape
 * `crawl-grants?batch=N` already uses. Alternate-day scheduling makes it free:
 * one funder a day rather than two every other day.
 */
type Slice = 'targeted-ace' | 'targeted-gla' | 'targeted' | 'general' | 'all'

/** Must match discover-grants' MODEL. Usage is attributed per model, and a
 *  wrong name here would price the run against the wrong rate card. */
const DISCOVERY_MODEL = 'claude-sonnet-5'

/**
 * Measured wall-clock per query, used to decide what still fits.
 *
 * A TARGETED sweep of one named funder runs ~34s. A GENERAL thematic query runs
 * ~246s, because it is asked for 10-14 opportunities and output tokens are what
 * take the time (2,943 vs 11,864 on measured runs).
 *
 * This matters more than cost. Vercel kills the function at 270s, so a general
 * query started after the two blocked-funder queries would reach 314s and be
 * killed mid-write. The old check only looked at ELAPSED time, so it happily
 * started a 246s query at the 68s mark.
 */
const EST_MS = { targeted: 60_000, general: 255_000 }

/**
 * Stop launching with enough headroom to return a clean summary under the cap.
 *
 * 270s against a 300s maxDuration, so a single general query (est 255s, hard
 * aborted at 250s by the fetch signal) fits in its own invocation with 30s left
 * to write the summary. The previous 235s could not admit a general query even
 * at elapsed zero, which is why they never ran.
 */
const BUDGET_MS = 270_000

/**
 * No query is worth starting with less than this left, whatever the estimate
 * says. Arts Council England has been measured at 60s and at 192s; an estimate
 * that is a mean cannot bound a worst case, so the floor does the bounding.
 */
const MIN_QUERY_MS = 200_000

type QuerySpec = { query: string; fundingType: DiscoveryFundingType; domains?: string[] }

/**
 * Blocked funders first, then a rotating slice of the general queries.
 *
 * Ordered deliberately: the blocked funders are the ones with no other route
 * in, so they must not be the work that gets dropped when the budget runs out.
 * The general queries rotate by day so a daily cron eventually covers the whole
 * set rather than re-running the same first five forever — the mistake the
 * watchlist checker made, where 51% of entries had never been checked once.
 */
function buildQueue(dayOfYear: number, slice: Slice): QuerySpec[] {
  // `domains` selects the TARGETED prompt for a single named funder. It is not
  // a hard search filter — see the note in discover-grants where allowed_domains
  // was removed.
  //
  // fundingType is 'corporate' (the grant-shaped category) rather than
  // 'programme'. The targeted prompt ignores fundingType entirely, so this value
  // never reaches the model; it is used for exactly one thing, the fallback row
  // type when the model does not return one (`item.funding_type ?? fundingType`).
  // Arts Council England and the GLA award predominantly grants, so an
  // unlabelled row from either should land as a grant, not a programme.
  const blocked: QuerySpec[] = BLOCKED_FUNDER_QUERIES.map(b => ({
    query: b.query, fundingType: 'corporate', domains: b.domains,
  }))

  const general: QuerySpec[] = []
  for (const type of Object.keys(DEFAULT_QUERIES) as DiscoveryFundingType[]) {
    for (const query of DEFAULT_QUERIES[type]) general.push({ query, fundingType: type })
  }

  // One named funder per invocation. `targeted` is kept as the manual
  // everything-at-once escape hatch; no cron uses it.
  if (slice === 'targeted-ace') return blocked.slice(0, 1)
  if (slice === 'targeted-gla') return blocked.slice(1, 2)
  if (slice === 'targeted')     return blocked

  // Step by 1, not by MAX_QUERIES. The general slice now takes one query per
  // run, so a daily cron walks the whole set in `general.length` days and
  // repeats. Stepping by 5 while consuming 1 would silently skip four in five
  // queries forever, which is the same class of bug this split exists to fix.
  const offset  = general.length ? dayOfYear % general.length : 0
  const rotated = [...general.slice(offset), ...general.slice(0, offset)]

  if (slice === 'general') return rotated.slice(0, 1)

  return [...blocked, ...rotated].slice(0, MAX_QUERIES)
}

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron     = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  if (!isCron && !(isAdminBearerToken(auth) || (await requireAdmin()).ok)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let httpStatus = 200
  const payload = await recordRun('discover-sweep', async (ctx) => {
    // Same arming rule as the publish gate: the query string is the
    // discriminator between a manual run and a scheduled one, because a fixed
    // cron URL can never send ?run=true.
    //
    // It used to be that `isCron` COULD NOT tell a cron from an admin, because
    // ADMIN_SECRET and CRON_SECRET held the same value. They were rotated apart
    // on 2026-08-11, so that is no longer true and `isCron` is now a real
    // discriminator. The query-string rule is kept anyway: it is explicit at the
    // call site, it survives the two secrets being set equal again by accident,
    // and every scheduled entry in vercel.json now carries a ?slice= param, so
    // the parameterless form is unambiguously a human.
    const wantsRun = req.nextUrl.searchParams.get('run') === 'true'
    const armed    = process.env.DISCOVER_SWEEP_ENABLED === 'true'
    if (!wantsRun && !armed) {
      return {
        success: true, skipped: true,
        reason: 'Not armed. Set DISCOVER_SWEEP_ENABLED=true for scheduled runs, or call with ?run=true.',
      }
    }

    // Base URL for the self-call, most-specific first.
    //
    // NEXT_PUBLIC_SITE_URL was not set in production, so the first armed run
    // returned "NEXT_PUBLIC_SITE_URL is not set" and would have failed silently
    // every Tuesday. It is set now, but a cron that dies on one missing env var
    // is too brittle for unattended weekly work, so there are fallbacks.
    //
    // The www form matters: an apex -> www redirect STRIPS the Authorization
    // header, so a self-call to the apex arrives unauthenticated and 401s.
    const base =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
      req.nextUrl.origin
    if (!base) {
      httpStatus = 500
      return { error: 'Could not resolve a base URL for the self-call' }
    }

    const start = Date.now()
    const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86_400_000)

    const rawSlice = req.nextUrl.searchParams.get('slice')
    const KNOWN: Slice[] = ['targeted-ace', 'targeted-gla', 'targeted', 'general']
    const slice: Slice = (KNOWN as string[]).includes(rawSlice ?? '') ? rawSlice as Slice : 'all'

    const queue = buildQueue(dayOfYear, slice)

    const results: Array<Record<string, unknown>> = []
    let queued = 0, failed = 0, ran = 0

    // What this run found, keyed by the query's own category. discover-grants
    // reports `queued` per call, so this is a straight tally rather than a
    // second read of the queue table.
    const foundByCategory: Record<string, number> = {}

    const skipped: Array<{ query: string; reason: string }> = []

    for (const spec of queue) {
      // Look AHEAD, not just back. Checking elapsed time alone is what let a 246s
      // general query start at the 68s mark and blow past the function cap.
      // Gate on the cap that will actually be ENFORCED, not on an average. A
      // 60s mean must never be used as a ceiling: the measured spread on the
      // targeted query is 60s to 192s, and using the mean is what let a query
      // start that could not finish.
      const est = Math.max(spec.domains?.length ? EST_MS.targeted : EST_MS.general, MIN_QUERY_MS)
      if (Date.now() - start + est > BUDGET_MS) {
        skipped.push({
          query: spec.query,
          reason: `needs ~${Math.round(est / 1000)}s, only ~${Math.round((BUDGET_MS - (Date.now() - start)) / 1000)}s of budget left`,
        })
        continue
      }
      ran++

      try {
        const res = await fetch(`${base}/api/admin/discover-grants`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.ADMIN_SECRET}`,
          },
          body: JSON.stringify(spec),
          // Derived from what is actually LEFT, never a constant. A fixed 250s
          // abort on a query starting at the 192s mark could not fire before
          // Vercel's own 300s kill, so the guard was decorative exactly when it
          // was needed. This way an overrun always returns through recordRun and
          // shows as `ok: true, failed: 1` rather than as an invisible open row.
          signal: AbortSignal.timeout(Math.max(5_000, BUDGET_MS - (Date.now() - start))),
        })
        const json = await res.json().catch(() => ({})) as Record<string, unknown>

        // Bank the spend BEFORE branching on success. A query that searched,
        // burned tokens and then failed to parse still cost money, and a cost
        // figure that only counts successes understates exactly the runs worth
        // investigating. discover-grants reports usage on both paths.
        //
        // Its field names are input/output, not the SDK's input_tokens /
        // output_tokens, so they are mapped rather than spread.
        const u = (json.search as { usage?: Record<string, number> } | undefined)?.usage
        if (u) {
          ctx.usage.add(DISCOVERY_MODEL, {
            input_tokens:  (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0),
            output_tokens: u.output ?? 0,
          })
        }

        // Read the response rather than assuming it worked. The old Discovery
        // panel counted a 502 as a completed query.
        if (!res.ok || json.ok === false) {
          failed++
          results.push({ query: spec.query, ok: false, error: json.error ?? `HTTP ${res.status}`, detail: json.detail })
        } else {
          const n = Number(json.queued ?? 0)
          queued += n
          foundByCategory[spec.fundingType] = (foundByCategory[spec.fundingType] ?? 0) + n
          results.push({ query: spec.query, ok: true, queued: json.queued ?? 0, found: json.found ?? 0 })
        }
      } catch (e) {
        failed++
        results.push({ query: spec.query, ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return {
      success: true,
      armed,
      slice,
      // Declared shape, read by the Pipeline page. Only `found` here: the rest
      // of the funnel belongs to process-discovery-queue, which is where a
      // discovery item becomes a catalogue row with a real funding type.
      yield: { found: foundByCategory } satisfies RunYield,
      queriesPlanned: queue.length,
      queriesRun: ran,
      // Never let a truncated sweep read as a complete one. `skipped` names each
      // query that did not fit and why, so a sweep that ran two of five is
      // visibly that, not a quiet success.
      stoppedEarly: ran < queue.length,
      skipped,
      queued,
      failed,
      elapsedMs: Date.now() - start,
      results,
    }
  })
  return NextResponse.json(payload, { status: httpStatus })
}
