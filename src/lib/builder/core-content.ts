// Core content bank CRUD (builder v0). Direct client reads/writes — the
// org_core_content table carries org-scoped RLS (owner-only), same trust
// model as pipeline_items.

import { createClient } from '@/lib/supabase/client'
import type { BlockType, CoreContentBlock } from './types'

export async function getCoreContent(orgId: string): Promise<CoreContentBlock[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('org_core_content')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as CoreContentBlock[]
}

export async function createCoreContentBlock(block: {
  org_id: string
  block_type: BlockType
  title: string
  content: string
  source?: CoreContentBlock['source']
}): Promise<CoreContentBlock> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('org_core_content')
    .insert({ ...block, source: block.source ?? 'user_entered' })
    .select()
    .single()
  if (error) throw error
  return data as CoreContentBlock
}

export async function updateCoreContentBlock(
  id: string,
  updates: Partial<Pick<CoreContentBlock, 'block_type' | 'title' | 'content'>>,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('org_core_content')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteCoreContentBlock(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('org_core_content')
    .delete()
    .eq('id', id)
  if (error) throw error
}
