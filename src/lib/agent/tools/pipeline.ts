// Pipeline write tools — the first capabilities proven through the full
// envelope (entitlement · authorship · event log w/ surface · provenance).
//
// NOTE (flagged for discussion): src/lib/pipeline.ts is browser-client-bound
// (`@/lib/supabase/client`), so the SERVER-side tool layer cannot literally wrap
// it. These tools ARE the canonical server-side, org-scoped pipeline writes,
// using the service client — the tool is the authorization boundary, so it
// scopes every row by ctx.orgId explicitly (service role bypasses RLS).
// Recommendation: later refactor pipeline.ts to accept an injected client so
// both surfaces share one implementation. Additive; deferred.

import { createClient } from '@supabase/supabase-js'
import { emitEvent } from '../../events/emit'
import { defineTool } from './envelope'
import { getPipelineItems, type PipelineItemRow } from './repository'
import { prov, type ToolContext } from './types'
import type { PipelineItem, PipelineStage } from '@/types'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}
const nowIso = () => new Date().toISOString()

// ── add_to_pipeline ──────────────────────────────────────────────────────────

export interface AddToPipelineParams extends Record<string, unknown> {
  grant_name: string
  funder_name?: string | null
  opportunity_id?: string | null // catalogue UUID, for the event + backlink
  stage?: PipelineStage
  amount_requested?: number | null
  deadline?: string | null
  grant_url?: string | null
  source_recommendation_id?: string | null
}

export const addToPipeline = defineTool<AddToPipelineParams, PipelineItem>({
  name: 'add_to_pipeline',
  handler: async (ctx, p) => {
    const row = {
      org_id: ctx.orgId, // from ctx, NEVER from params
      grant_name: p.grant_name,
      funder_name: p.funder_name ?? null,
      stage: (p.stage ?? 'identified') as PipelineStage,
      amount_requested: p.amount_requested ?? null,
      deadline: p.deadline ?? null,
      grant_url: p.grant_url ?? null,
      source_recommendation_id: p.source_recommendation_id ?? null,
      created_by: ctx.userId ?? null,
    }
    const { data, error } = await svc().from('pipeline_items').insert(row).select().single()
    if (error) throw new Error(`add_to_pipeline failed: ${error.message}`)
    return data as PipelineItem
  },
  logEvent: async (ctx, p, item) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'pipeline_added', { opportunity_id: p.opportunity_id ?? null, pipeline_item_id: item.id })
  },
  provenance: (_ctx, item) => ({
    stage: prov(item.stage, 'agent', nowIso()),
    deadline: prov(item.deadline, 'user', null),
    amount_requested: prov(item.amount_requested, 'user', null),
  }),
})

// ── update_pipeline_item ─────────────────────────────────────────────────────

export interface UpdatePipelineItemParams extends Record<string, unknown> {
  pipeline_item_id: string
  stage?: PipelineStage
  amount_requested?: number | null
  deadline?: string | null
  outcome_date?: string | null
  outcome_notes?: string | null // short outcome note — scaffold, not application prose
}
export interface UpdatePipelineItemResult {
  item: PipelineItem
  previous_stage: string
  stage_changed: boolean
}

export const updatePipelineItem = defineTool<UpdatePipelineItemParams, UpdatePipelineItemResult>({
  name: 'update_pipeline_item',
  handler: async (ctx, p) => {
    const sb = svc()
    // Ownership guard — the tool is the authorization boundary; scope by org_id.
    const { data: existing } = await sb.from('pipeline_items')
      .select('*').eq('id', p.pipeline_item_id).eq('org_id', ctx.orgId).maybeSingle()
    if (!existing) throw new Error('update_pipeline_item: no such item for this org')

    const updates: Record<string, unknown> = { updated_at: nowIso() }
    if (p.stage !== undefined) updates.stage = p.stage
    if (p.amount_requested !== undefined) updates.amount_requested = p.amount_requested
    if (p.deadline !== undefined) updates.deadline = p.deadline
    if (p.outcome_date !== undefined) updates.outcome_date = p.outcome_date
    if (p.outcome_notes !== undefined) updates.outcome_notes = p.outcome_notes

    const { data, error } = await sb.from('pipeline_items')
      .update(updates).eq('id', p.pipeline_item_id).eq('org_id', ctx.orgId).select().single()
    if (error) throw new Error(`update_pipeline_item failed: ${error.message}`)

    const prevStage = String((existing as PipelineItem).stage)
    return { item: data as PipelineItem, previous_stage: prevStage, stage_changed: p.stage !== undefined && p.stage !== prevStage }
  },
  logEvent: async (ctx, p, r) => {
    // Stage moves get the domain event (feeds get_briefing's plan-delta). A
    // generic `agent_tool_called` type (reserved) would cover non-stage updates
    // — recommended when generalising the envelope to read tools.
    if (r.stage_changed) {
      await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
        'pipeline_stage_changed', { opportunity_id: null, pipeline_item_id: r.item.id, from_stage: r.previous_stage, to_stage: String(r.item.stage) })
    }
  },
  provenance: (_ctx, r) => ({
    stage: prov(r.item.stage, 'agent', nowIso()),
    outcome_date: prov(r.item.outcome_date ?? null, 'user', null),
  }),
})

// ── get_pipeline ─────────────────────────────────────────────────────────────
// The read that makes update_pipeline_item usable in conversation: "mark the X
// grant won" needs an id, and this is how outcomes enter the system — outcomes
// feed the plan arithmetic, the capture layer, and eventually the brain.

export interface GetPipelinePayload {
  count: number
  items: PipelineItemRow[]
}

export const getPipeline = defineTool<Record<string, unknown>, GetPipelinePayload>({
  name: 'get_pipeline',
  handler: async (ctx) => {
    const items = await getPipelineItems(ctx.orgId)
    return { count: items.length, items }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'get_pipeline', result_count: r.count, degraded: false })
  },
})

export type { ToolContext }
