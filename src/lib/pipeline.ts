import { createClient } from '@/lib/supabase/client'
import type { PipelineItem, PipelineStage } from '@/types'

// ── READ ──────────────────────────────────────

export async function getPipelineItems(orgId: string): Promise<PipelineItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('pipeline_items')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ── CREATE ────────────────────────────────────

export async function createPipelineItem(
  item: Omit<PipelineItem, 'id' | 'created_at' | 'updated_at'>
): Promise<PipelineItem> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('pipeline_items')
    .insert(item)
    .select()
    .single()

  if (error) throw error
  return data
}

// ── UPDATE STAGE ──────────────────────────────

export async function updatePipelineStage(
  id: string,
  stage: PipelineStage
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('pipeline_items')
    .update({ stage, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// ── UPDATE NOTES / PROGRESS ───────────────────

export async function updatePipelineItem(
  id: string,
  updates: Partial<Pick<
    PipelineItem,
    | 'notes'
    | 'application_progress'
    | 'stage'
    | 'deadline'
    | 'amount_requested'
    | 'contact_name'
    | 'contact_email'
    | 'grant_url'
    | 'outcome_notes'
    | 'outcome_date'
  >>
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('pipeline_items')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

// ── DELETE ────────────────────────────────────

export async function deletePipelineItem(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('pipeline_items')
    .delete()
    .eq('id', id)

  if (error) throw error
}

// ── STATS ─────────────────────────────────────

export async function getPipelineStats(orgId: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('pipeline_items')
    .select('stage, amount_requested, amount_max')
    .eq('org_id', orgId)

  if (error) throw error

  const items = data ?? []
  const won = items.filter(i => i.stage === 'won')
  const active = items.filter(i => !['won', 'declined'].includes(i.stage))

  return {
    totalPipelineValue: active.reduce((sum, i) => sum + (i.amount_max ?? i.amount_requested ?? 0), 0),
    totalWon: won.reduce((sum, i) => sum + (i.amount_requested ?? 0), 0),
    wonCount: won.length,
    activeCount: active.length,
    submittedCount: items.filter(i => i.stage === 'submitted').length,
    byStageCounts: Object.fromEntries(
      ['identified','researching','applying','submitted','won','declined'].map(s => [
        s,
        items.filter(i => i.stage === s).length
      ])
    ),
  }
}
