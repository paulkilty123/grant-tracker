// Client-side read for a single agent_thread_briefs row (research agent
// v1.1 §5: a pinned profile expands in place by fetching its full brief).
// Client-readable, service-role-written (agent_thread_briefs' own RLS,
// migration 040) -- no API route needed for a read, same reasoning as
// src/lib/agent/pins.ts.

import { createClient } from '@/lib/supabase/client'
import type { Brief } from '@/components/research/brief-types'

export async function getBrief(id: string): Promise<Brief | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('agent_thread_briefs')
    .select('id, title, sections, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as Brief | null
}
