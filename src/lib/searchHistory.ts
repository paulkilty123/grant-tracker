import { createClient } from '@/lib/supabase/client'

export interface SearchHistoryItem {
  id: string
  query: string
  sectors: string[]
  location: string | null
  result_count: number | null
  created_at: string
}

export async function saveSearchHistory(params: {
  orgId: string
  query: string
  sectors: string[]
  location: string
  resultCount: number
}): Promise<void> {
  const supabase = createClient()
  await supabase.from('live_search_history').insert({
    org_id:       params.orgId,
    query:        params.query,
    sectors:      params.sectors,
    location:     params.location || null,
    result_count: params.resultCount,
  })
}

export async function getSearchHistory(orgId: string, limit = 8): Promise<SearchHistoryItem[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('live_search_history')
    .select('id, query, sectors, location, result_count, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SearchHistoryItem[]
}

export async function deleteSearchHistory(id: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('live_search_history').delete().eq('id', id)
}

// Count live searches used since the most recent Monday (00:00 UTC)
export async function getWeeklySearchCount(orgId: string): Promise<number> {
  const supabase = createClient()
  const now = new Date()
  // Roll back to Monday 00:00 UTC
  const dayOfWeek = now.getUTCDay() // 0=Sun, 1=Mon … 6=Sat
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now)
  monday.setUTCDate(now.getUTCDate() - daysToMonday)
  monday.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('live_search_history')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .gte('created_at', monday.toISOString())
  return count ?? 0
}
