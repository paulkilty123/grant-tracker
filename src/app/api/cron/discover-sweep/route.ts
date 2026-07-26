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

export const dynamic     = 'force-dynamic'
export const maxDuration = 270

/**
 * How many queries one run attempts.
 *
 * Each is a live search taking roughly 30-60s, so the cap is a time budget, not
 * a preference. It is reported in the response — a sweep that stopped early
 * must never read as a sweep that finished.
 */
const MAX_QUERIES = 5

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
const EST_MS = { targeted: 60_000, general: 260_000 }

/** Stop launching with enough headroom to return a clean summary under the 270s cap. */
const BUDGET_MS = 235_000

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
function buildQueue(dayOfYear: number): QuerySpec[] {
  // `domains` selects the TARGETED prompt for a single named funder. It is not
  // a hard search filter — see the note in discover-grants where allowed_domains
  // was removed.
  const blocked: QuerySpec[] = BLOCKED_FUNDER_QUERIES.map(b => ({
    query: b.query, fundingType: 'programme', domains: b.domains,
  }))

  const general: QuerySpec[] = []
  for (const type of Object.keys(DEFAULT_QUERIES) as DiscoveryFundingType[]) {
    for (const query of DEFAULT_QUERIES[type]) general.push({ query, fundingType: type })
  }
  const offset = general.length ? (dayOfYear * MAX_QUERIES) % general.length : 0
  const rotated = [...general.slice(offset), ...general.slice(0, offset)]

  return [...blocked, ...rotated].slice(0, MAX_QUERIES)
}

export async function GET(req: NextRequest) {
  const auth       = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isCron     = !!(cronSecret && auth === `Bearer ${cronSecret}`)
  if (!isCron && !(isAdminBearerToken(auth) || (await requireAdmin()).ok)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Same arming rule as the publish gate, and for the same reason: the query
  // string is the discriminator between a manual run and a scheduled one,
  // because ADMIN_SECRET and CRON_SECRET currently hold the same value and
  // `isCron` therefore cannot tell them apart. A fixed, parameterless cron URL
  // can never send ?run=true.
  const wantsRun = req.nextUrl.searchParams.get('run') === 'true'
  const armed    = process.env.DISCOVER_SWEEP_ENABLED === 'true'
  if (!wantsRun && !armed) {
    return NextResponse.json({
      success: true, skipped: true,
      reason: 'Not armed. Set DISCOVER_SWEEP_ENABLED=true for scheduled runs, or call with ?run=true.',
    })
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
    return NextResponse.json({ error: 'Could not resolve a base URL for the self-call' }, { status: 500 })
  }

  const start = Date.now()
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86_400_000)
  const queue = buildQueue(dayOfYear)

  const results: Array<Record<string, unknown>> = []
  let queued = 0, failed = 0, ran = 0

  const skipped: Array<{ query: string; reason: string }> = []

  for (const spec of queue) {
    // Look AHEAD, not just back. Checking elapsed time alone is what let a 246s
    // general query start at the 68s mark and blow past the function cap.
    const est = spec.domains?.length ? EST_MS.targeted : EST_MS.general
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
        signal: AbortSignal.timeout(250_000),
      })
      const json = await res.json().catch(() => ({})) as Record<string, unknown>

      // Read the response rather than assuming it worked. The old Discovery
      // panel counted a 502 as a completed query.
      if (!res.ok || json.ok === false) {
        failed++
        results.push({ query: spec.query, ok: false, error: json.error ?? `HTTP ${res.status}`, detail: json.detail })
      } else {
        queued += Number(json.queued ?? 0)
        results.push({ query: spec.query, ok: true, queued: json.queued ?? 0, found: json.found ?? 0 })
      }
    } catch (e) {
      failed++
      results.push({ query: spec.query, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({
    success: true,
    armed,
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
  })
}
