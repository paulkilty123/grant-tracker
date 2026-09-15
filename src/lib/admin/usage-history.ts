// Usage over time, for the trends page: daily series for the last N days and
// weekly ratios for the last N/7 weeks. Site numbers from Umami, actions from
// the events table, joined by UTC day. Pure computation is split out so a
// fixture can predict it; the fetch is at the bottom.

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchSiteStats, type SiteDay } from './site-stats'
import { INTERNAL_ORG_NAMES } from './usage-digest'

export interface DayPoint { day: string; visitors: number; pageviews: number; signupVisitors: number; signups: number; activeOrgs: number; searches: number }
export interface WeekPoint {
  weekEnding: string
  visitors: number
  signupVisitors: number
  signups: number
  searchers: number
  addedToPipeline: number
  /** Percentages, null when the denominator is zero. */
  reachedSignupPct: number | null
  searchersAddedPct: number | null
}
export interface UsageHistory {
  days: number
  daily: DayPoint[]
  weekly: WeekPoint[]
  siteReason: string | null
  eventsRead: number
}

type Ev = { org_id: string | null; event_type: string; created_at: string }
type Org = { id: string; name: string | null; created_at: string }

const dayOf = (iso: string) => iso.slice(0, 10)
const pct = (num: number, den: number) => (den > 0 ? Math.round((100 * num) / den) : null)

export function buildHistory(
  orgs: Org[],
  events: Ev[],
  site: SiteDay[] | null,
  days: number,
  now: Date = new Date(),
): Omit<UsageHistory, 'siteReason' | 'eventsRead'> {
  const internal = new Set(orgs.filter(o => INTERNAL_ORG_NAMES.has(o.name ?? '')).map(o => o.id))
  const realOrgs = orgs.filter(o => !internal.has(o.id))
  const realEvents = events.filter(e => e.org_id && !internal.has(e.org_id)) as (Ev & { org_id: string })[]
  const siteByDay = new Map((site ?? []).map(d => [d.day, d]))

  const dayKeys: string[] = []
  for (let i = days - 1; i >= 0; i--) dayKeys.push(dayOf(new Date(now.getTime() - i * 86_400_000).toISOString()))
  const signupsByDay = new Map<string, number>()
  for (const o of realOrgs) signupsByDay.set(dayOf(o.created_at), (signupsByDay.get(dayOf(o.created_at)) ?? 0) + 1)
  const activeByDay = new Map<string, Set<string>>()
  const searchesByDay = new Map<string, number>()
  for (const e of realEvents) {
    const d = dayOf(e.created_at)
    if (!activeByDay.has(d)) activeByDay.set(d, new Set())
    activeByDay.get(d)!.add(e.org_id)
    if (e.event_type === 'search_executed') searchesByDay.set(d, (searchesByDay.get(d) ?? 0) + 1)
  }
  const daily: DayPoint[] = dayKeys.map(day => {
    const s = siteByDay.get(day)
    return {
      day,
      visitors: s?.visitors ?? 0,
      pageviews: s?.pageviews ?? 0,
      signupVisitors: s?.signupVisitors ?? 0,
      signups: signupsByDay.get(day) ?? 0,
      activeOrgs: activeByDay.get(day)?.size ?? 0,
      searches: searchesByDay.get(day) ?? 0,
    }
  })

  // Weeks are seven-day blocks ending today, newest last, so the last point is
  // "the last seven days" and lines up with the Monday report.
  const weeks = Math.floor(days / 7)
  const weekly: WeekPoint[] = []
  for (let w = weeks - 1; w >= 0; w--) {
    const end = new Date(now.getTime() - w * 7 * 86_400_000)
    const start = new Date(end.getTime() - 7 * 86_400_000)
    const inWin = (iso: string) => { const t = Date.parse(iso); return t >= start.getTime() && t < end.getTime() }
    const searched = new Set<string>(); const piped = new Set<string>()
    for (const e of realEvents) {
      if (!inWin(e.created_at)) continue
      if (e.event_type === 'results_shown') searched.add(e.org_id)
      if (e.event_type === 'pipeline_added') piped.add(e.org_id)
    }
    let added = 0; searched.forEach(id => { if (piped.has(id)) added++ })
    const daysIn = daily.filter(d => { const t = Date.parse(d.day + 'T00:00:00Z'); return t >= start.getTime() - 86_400_000 && t < end.getTime() - 86_400_000 })
    const visitors = daysIn.reduce((s, d) => s + d.visitors, 0)
    const signupVisitors = daysIn.reduce((s, d) => s + d.signupVisitors, 0)
    weekly.push({
      weekEnding: dayOf(end.toISOString()),
      visitors, signupVisitors,
      signups: realOrgs.filter(o => inWin(o.created_at)).length,
      searchers: searched.size,
      addedToPipeline: added,
      reachedSignupPct: pct(signupVisitors, visitors),
      searchersAddedPct: pct(added, searched.size),
    })
  }
  return { days, daily, weekly }
}

export async function computeUsageHistory(db: SupabaseClient, days = 90): Promise<UsageHistory> {
  const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString()
  const [{ data: orgs, error: e1 }, site] = await Promise.all([
    db.from('organisations').select('id, name, created_at'),
    fetchSiteStats(days),
  ])
  if (e1) throw new Error(`organisations: ${e1.message}`)

  // PostgREST caps a select at 1000 rows and says nothing. Page until short.
  const PAGE = 1000
  const events: Ev[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('events')
      .select('org_id, event_type, created_at')
      .eq('surface', 'app')
      .in('event_type', ['results_shown', 'pipeline_added', 'search_executed', 'opportunity_viewed', 'opportunity_saved', 'opportunity_dismissed', 'profile_updated'])
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`events: ${error.message}`)
    events.push(...((data ?? []) as Ev[]))
    if (!data || data.length < PAGE) break
  }

  const built = buildHistory((orgs ?? []) as Org[], events, site.ok ? site.stats.byDay : null, days)
  return { ...built, siteReason: site.ok ? null : site.reason, eventsRead: events.length }
}
