// The launch bar: three numbers that should all read zero before the queue
// counts mean anything.
//
// Asked for by Paul on 2026-09-01: "A status line above the chips with three
// numbers: live rows with a past deadline, live rows with an unsupported figure,
// hidden rows reachable. I should read three zeros before I read a 75."
//
// The first two are read off the reasons the queue already derives for every
// live row, so they cannot disagree with the Live and wrong tab. The third had
// nothing behind it: the 410 for removed pages was verified by hand on 1
// September and no cron has looked since. So this module probes a small sample
// of hidden pages against the public origin itself, and it is the one number
// here that can genuinely fail rather than merely report.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE PROBE CARRIES A CANARY
//
// A probe that reports zero is indistinguishable from a probe that never reached
// the site. So every run also fetches ONE live row's page, which must answer
// 200. If it does not, the run is void and says so, rather than showing a zero
// that means "the network was down". Same rule as the reconciliation checks:
// assert the precondition in the same run, or the zero is not evidence.
//
// FAILS TOWARDS "NOT CHECKED", never towards zero. A fetch that errors or times
// out is counted as unchecked and shown as such. The direction that fails
// quietly here is the one that looks like an all-clear, so that is the one the
// code refuses to take.

import type { SupabaseClient } from '@supabase/supabase-js'
import { MCP_PUBLIC_ORIGIN } from '@/lib/mcp-brand'
import { isPubliclyVisible } from '@/lib/public-visibility'
import type { ReviewReason } from '@/lib/admin/review-reasons'

/** The two reason codes that mean "we state a figure the page does not
 *  support". Both block publication; both are what Paul called an unsupported
 *  figure. amount_pot_suspected and amount_inverted are wrong in other ways and
 *  appear under Live and wrong, but they are not this number. */
export const UNSUPPORTED_FIGURE_CODES: ReadonlySet<string> = new Set(['amount_unsupported', 'amount_ungrounded'])

export type LaunchCounts = {
  /** Live rows whose stored deadline is already in the past. */
  pastDeadline: number
  /** Live rows stating a £ figure the funder's page does not carry. */
  unsupportedFigure: number
}

/** Read the two database-side numbers off reasons already derived for LIVE rows. */
export function countLaunchInvariants(liveReasons: ReadonlyArray<ReadonlyArray<Pick<ReviewReason, 'code'>>>): LaunchCounts {
  let pastDeadline = 0
  let unsupportedFigure = 0
  for (const reasons of liveReasons) {
    const codes = new Set(reasons.map(r => r.code))
    if (codes.has('deadline_passed')) pastDeadline++
    if (Array.from(codes).some(c => UNSUPPORTED_FIGURE_CODES.has(c))) unsupportedFigure++
  }
  return { pastDeadline, unsupportedFigure }
}

export type ProbeRow = { id: string; external_id: string | null; title: string | null; is_active: boolean | null; pipeline_state: string | null }

export type ProbeHit = { key: string; title: string; status: number }

export type ReachabilityProbe = {
  /** How many hidden pages were asked. */
  checked: number
  /** Hidden pages that answered 200. THE number. */
  reachable: ProbeHit[]
  /** Pages that answered something other than 200, 404 or 410. Shown, not counted. */
  unexpected: ProbeHit[]
  /** Fetches that errored or timed out. Not zero: unknown. */
  unchecked: number
  /** Did the live canary answer 200? If not, nothing above is evidence. */
  canaryOk: boolean
  canary: ProbeHit | null
  origin: string
  at: string
}

/** The public URL of a row, keyed the way a user would reach it: the grant API
 *  sets id = external_id ?? id, so links carry the external id when there is one. */
export function publicGrantUrl(origin: string, row: Pick<ProbeRow, 'id' | 'external_id'>): string {
  const key = String(row.external_id ?? row.id)
  return `${origin.replace(/\/+$/, '')}/grants/${encodeURIComponent(key)}`
}

type FetchLike = (url: string, init?: RequestInit) => Promise<{ status: number }>

async function status(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<number | null> {
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: { 'user-agent': 'shoots-launch-bar/1 (admin reachability probe)' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.status
  } catch {
    return null
  }
}

/**
 * Probe a sample of HIDDEN rows and one LIVE canary against the public origin.
 *
 * Pure over its inputs so it can be tested with a fake fetch: the caller picks
 * the rows. `sampleHiddenRows` below is the picker the page uses.
 */
export async function probeReachability(opts: {
  hidden: ProbeRow[]
  canary: ProbeRow | null
  origin?: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}): Promise<ReachabilityProbe> {
  const origin = (opts.origin ?? MCP_PUBLIC_ORIGIN).replace(/\/+$/, '')
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((u, i) => fetch(u, i))
  const timeoutMs = opts.timeoutMs ?? 4000

  // A hidden row in the sample that is actually visible would make a 200 look
  // like a leak. Refuse the sample rather than report on it.
  const leak = opts.hidden.find(r => isPubliclyVisible(r))
  if (leak) throw new Error(`probeReachability: sample row ${leak.id} is publicly visible; the sample is wrong, not the site`)
  if (opts.canary && !isPubliclyVisible(opts.canary)) {
    throw new Error(`probeReachability: canary ${opts.canary.id} is not publicly visible; it cannot prove the probe sees the site`)
  }

  const [canaryStatus, ...statuses] = await Promise.all([
    opts.canary ? status(fetchImpl, publicGrantUrl(origin, opts.canary), timeoutMs) : Promise.resolve(null),
    ...opts.hidden.map(r => status(fetchImpl, publicGrantUrl(origin, r), timeoutMs)),
  ])

  const reachable: ProbeHit[] = []
  const unexpected: ProbeHit[] = []
  let unchecked = 0
  opts.hidden.forEach((r, i) => {
    const s = statuses[i]
    const hit = { key: String(r.external_id ?? r.id), title: String(r.title ?? ''), status: s ?? 0 }
    if (s === null) unchecked++
    else if (s === 200) reachable.push(hit)
    else if (s !== 404 && s !== 410) unexpected.push(hit)
  })

  return {
    checked: opts.hidden.length - unchecked,
    reachable,
    unexpected,
    unchecked,
    canaryOk: canaryStatus === 200,
    canary: opts.canary
      ? { key: String(opts.canary.external_id ?? opts.canary.id), title: String(opts.canary.title ?? ''), status: canaryStatus ?? 0 }
      : null,
    origin,
    at: new Date().toISOString(),
  }
}

const PROBE_COLS = 'id, external_id, title, is_active, pipeline_state, last_seen_at'

/**
 * Which hidden rows to ask about.
 *
 * Half removed (rejected or archived: the 410 set), half withheld (never
 * published and not active: the 404 set), most recently seen first. The two
 * mechanisms are different code paths — middleware for the first, the page's own
 * visibility rule for the second — so a sample that covered only one would
 * prove nothing about the other. Both are uniform within themselves, which is
 * why a handful of rows is enough to catch the mechanism regressing.
 */
export async function sampleHiddenRows(db: SupabaseClient, perGroup = 6): Promise<{ hidden: ProbeRow[]; canary: ProbeRow | null }> {
  const { data: removed } = await db.from('scraped_grants').select(PROBE_COLS)
    .in('pipeline_state', ['rejected', 'archived'])
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(perGroup)
  const { data: withheld } = await db.from('scraped_grants').select(PROBE_COLS)
    .or('is_active.is.null,is_active.eq.false')
    .not('pipeline_state', 'in', '("published","between_rounds_scheduled","rejected","archived")')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(perGroup)
  const { data: live } = await db.from('scraped_grants').select(PROBE_COLS)
    .eq('is_active', true).eq('pipeline_state', 'published')
    .order('last_seen_at', { ascending: false, nullsFirst: false })
    .limit(1)

  const hidden = [...((removed ?? []) as ProbeRow[]), ...((withheld ?? []) as ProbeRow[])]
    .filter(r => !isPubliclyVisible(r))
  return { hidden, canary: ((live ?? []) as ProbeRow[])[0] ?? null }
}

/** Long enough that an admin refreshing the inbox does not re-probe the site
 *  every time; short enough that a fix shows within the same sitting. */
const TTL_MS = 5 * 60 * 1000
let cache: { at: number; origin: string; result: ReachabilityProbe } | null = null

/** The page's entry point: sample, probe, remember for TTL_MS. Never throws;
 *  a failure comes back as a void run (checked 0, canaryOk false). */
export async function cachedReachability(db: SupabaseClient): Promise<ReachabilityProbe> {
  const origin = MCP_PUBLIC_ORIGIN
  if (cache && cache.origin === origin && Date.now() - cache.at < TTL_MS) return cache.result
  try {
    const { hidden, canary } = await sampleHiddenRows(db)
    const result = await probeReachability({ hidden, canary, origin })
    cache = { at: Date.now(), origin, result }
    return result
  } catch (e) {
    console.error('[launch-bar] reachability probe failed:', e instanceof Error ? e.message : e)
    return { checked: 0, reachable: [], unexpected: [], unchecked: 0, canaryOk: false, canary: null, origin, at: new Date().toISOString() }
  }
}
