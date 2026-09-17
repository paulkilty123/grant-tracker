// Site stats: page views, visitors, sources and landing pages, from the
// self-hosted Umami analytics database.
//
// Umami has recorded every page view since 16 June 2026 on its own Supabase
// project. Until 15 September nobody read it alongside the events table, and
// "page views are not recorded" became folklore. This module is the read.
//
// The read is one RPC, shoots_site_stats, a security-definer function in the
// Umami project that returns aggregates only: no session ids, IPs or user
// agents. It is callable with that project's anon key, which is all the app
// holds. Sessions that touched an admin path are Paul's own and are excluded
// whole, inside the function.
//
// Not configured means null with a reason, never zeros: a zero on a live site
// would read as "nobody came" when the truth is "nobody looked".

import { createClient } from '@supabase/supabase-js'

export interface SiteDay    { day: string; pageviews: number; visitors: number; signupVisitors: number }
export interface SitePage   { path: string; views: number; visitors: number }
export interface SiteSource { source: string; visitors: number }
export interface SiteLanding{ path: string; visitors: number }

export interface SiteStats {
  days: number
  pageviews: number
  visitors: number
  /** Distinct sessions that saw /signup. The top of the signup ratio. */
  signupVisitors: number
  adminSessionsExcluded: number
  byDay: SiteDay[]
  pages: SitePage[]
  sources: SiteSource[]
  landing: SiteLanding[]
}

export type SiteStatsResult =
  | { ok: true; stats: SiteStats }
  | { ok: false; reason: string }

/** Shape-check the RPC payload. A wrong shape is an error, not an empty week. */
export function parseSiteStats(raw: unknown, days: number): SiteStats {
  const j = raw as Record<string, unknown> | null
  if (!j || typeof j !== 'object') throw new Error('site stats: empty payload')
  const n = (v: unknown, name: string) => {
    const x = typeof v === 'string' ? Number(v) : v
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`site stats: ${name} is not a number`)
    return x
  }
  const arr = (v: unknown, name: string) => {
    if (!Array.isArray(v)) throw new Error(`site stats: ${name} is not a list`)
    return v as Record<string, unknown>[]
  }
  return {
    days,
    pageviews: n(j.pageviews, 'pageviews'),
    visitors:  n(j.visitors, 'visitors'),
    signupVisitors: n(j.signupVisitors ?? 0, 'signupVisitors'),
    adminSessionsExcluded: n(j.adminSessionsExcluded ?? 0, 'adminSessionsExcluded'),
    byDay:   arr(j.byDay, 'byDay').map(r => ({ day: String(r.day), pageviews: n(r.pageviews, 'byDay.pageviews'), visitors: n(r.visitors, 'byDay.visitors'), signupVisitors: n(r.signupVisitors ?? 0, 'byDay.signupVisitors') })),
    pages:   arr(j.pages, 'pages').map(r => ({ path: String(r.path), views: n(r.views, 'pages.views'), visitors: n(r.visitors, 'pages.visitors') })),
    sources: arr(j.sources, 'sources').map(r => ({ source: String(r.source), visitors: n(r.visitors, 'sources.visitors') })),
    landing: arr(j.landing, 'landing').map(r => ({ path: String(r.path), visitors: n(r.visitors, 'landing.visitors') })),
  }
}

/**
 * Fill the days the function did not return, so a quiet day shows as zero in
 * a by-day table rather than vanishing. Keys are UTC dates, matching the RPC.
 */
export function fillDays(byDay: SiteDay[], days: number, now: Date = new Date()): SiteDay[] {
  const have = new Map(byDay.map(d => [d.day, d]))
  const out: SiteDay[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    out.push(have.get(day) ?? { day, pageviews: 0, visitors: 0, signupVisitors: 0 })
  }
  return out
}

/**
 * `endingDaysAgo` shifts the window back, so `fetchSiteStats(7, 7)` is the
 * week before last week: the comparison the Monday report needs.
 */
export async function fetchSiteStats(days: number, endingDaysAgo = 0): Promise<SiteStatsResult> {
  const url = process.env.UMAMI_SUPABASE_URL
  const key = process.env.UMAMI_SUPABASE_ANON_KEY
  if (!url || !key) return { ok: false, reason: 'UMAMI_SUPABASE_URL or UMAMI_SUPABASE_ANON_KEY not set' }

  const client = createClient(url, key, { auth: { persistSession: false } })
  const until = new Date(Date.now() - endingDaysAgo * 86_400_000)
  const since = new Date(until.getTime() - days * 86_400_000).toISOString()
  const { data, error } = await client.rpc('shoots_site_stats', { p_since: since, p_until: until.toISOString() })
  if (error) return { ok: false, reason: `shoots_site_stats: ${error.message}` }
  try {
    const stats = parseSiteStats(data, days)
    return { ok: true, stats: { ...stats, byDay: fillDays(stats.byDay, days, until) } }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}
