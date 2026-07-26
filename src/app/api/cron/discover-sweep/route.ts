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

  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '')
  if (!base) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_SITE_URL is not set' }, { status: 500 })
  }

  const start = Date.now()
  const dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86_400_000)
  const queue = buildQueue(dayOfYear)

  const results: Array<Record<string, unknown>> = []
  let queued = 0, failed = 0, ran = 0

  for (const spec of queue) {
    // Stop before starting a query that cannot finish inside the budget, rather
    // than being killed mid-request and losing the count of what was done.
    if (Date.now() - start > 200_000) break
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
    // Never let a truncated sweep read as a complete one.
    stoppedEarly: ran < queue.length,
    queued,
    failed,
    elapsedMs: Date.now() - start,
    results,
  })
}
