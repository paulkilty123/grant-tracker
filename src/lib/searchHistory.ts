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
