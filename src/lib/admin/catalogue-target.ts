import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The Q4 catalogue target, agreed with Paul on 16 Sept 2026: 1,100 live
 * opportunities by 31 December, from 650 that day. "Live" is the sitemap's
 * own predicate, is_active AND published. 1,100 rather than the 1,000 he
 * said so that autumn closures do not eat the number. Plan in
 * docs/catalogue-plan-2026-q4.md.
 */
export const CATALOGUE_TARGET = { start: 650, startDate: '2026-09-16', target: 1100, targetDate: '2026-12-31' }

export interface CatalogueProgress {
  live: number
  byType: Record<string, number>
  /** Live rows first seen in the last seven days. */
  newLiveThisWeek: number
  /** Where the straight line from start to target says we should be today. */
  onTrackToday: number
  /** Net rows still needed per week to reach the target on the date. */
  neededPerWeek: number
  weeksLeft: number
}

export async function catalogueProgress(db: SupabaseClient, now = new Date()): Promise<CatalogueProgress> {
  const { data, error } = await db.from('scraped_grants').select('funding_type, first_seen_at').eq('is_active', true).eq('pipeline_state', 'published')
  if (error) throw new Error(error.message)
  const rows = data ?? []
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const byType: Record<string, number> = {}
  for (const r of rows) { const t = String(r.funding_type ?? 'grant'); byType[t] = (byType[t] ?? 0) + 1 }
  const start = new Date(CATALOGUE_TARGET.startDate).getTime()
  const end = new Date(CATALOGUE_TARGET.targetDate).getTime()
  const frac = Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)))
  const weeksLeft = Math.max(0, (end - now.getTime()) / (7 * 86_400_000))
  const live = rows.length
  return {
    live,
    byType,
    newLiveThisWeek: rows.filter(r => r.first_seen_at && String(r.first_seen_at) >= weekAgo).length,
    onTrackToday: Math.round(CATALOGUE_TARGET.start + frac * (CATALOGUE_TARGET.target - CATALOGUE_TARGET.start)),
    neededPerWeek: weeksLeft > 0 ? Math.max(0, Math.ceil((CATALOGUE_TARGET.target - live) / weeksLeft)) : Math.max(0, CATALOGUE_TARGET.target - live),
    weeksLeft: Math.round(weeksLeft * 10) / 10,
  }
}
