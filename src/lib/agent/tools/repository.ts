// Data access for the read tools — org-scoped, server-side. The production
// counterpart of the eval harness's fixture catalogue: same shapes, real DB.
//
// getGoal / getOrgFacts return null/[] when their tables don't exist yet
// (goals §5.1, org_facts §5.3 are designed, not applied) — so get_plan_state /
// get_briefing degrade cleanly to the onboarding path until step 2 lands.

import { serviceClient } from './db'
import { normaliseScrapedGrant } from '../../grants-normalise'
import type { GrantOpportunity, Organisation } from '@/types'
import type { GoalInput, PipelineEntry, OrgFact } from '../types'

export async function getGoal(orgId: string): Promise<GoalInput | null> {
  try {
    const { data, error } = await serviceClient()
      .from('goals').select('*').eq('org_id', orgId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (error || !data) return null
    const g = data as Record<string, unknown>
    return {
      title: String(g.title ?? 'Funding goal'),
      target_amount: Number(g.target_amount ?? 0),
      secured_amount: Number(g.secured_amount ?? 0),
      start_date: String(g.start_date ?? ''),
      end_date: String(g.end_date ?? ''),
      mix_targets: (g.mix_targets as Record<string, number> | null) ?? null,
      constraints: (g.constraints as Array<{ kind: string; text: string }>) ?? [],
    }
  } catch { return null } // table not applied yet → no goal
}

export async function getPipeline(orgId: string): Promise<PipelineEntry[]> {
  const { data } = await serviceClient()
    .from('pipeline_items').select('grant_name, funder_name, stage, amount_requested, deadline').eq('org_id', orgId)
  return (data ?? []).map(r => ({
    grant_name: String((r as Record<string, unknown>).grant_name ?? ''),
    funder_name: String((r as Record<string, unknown>).funder_name ?? ''),
    stage: String((r as Record<string, unknown>).stage ?? 'identified'),
    amount_requested: ((r as Record<string, unknown>).amount_requested as number | null) ?? null,
    deadline: ((r as Record<string, unknown>).deadline as string | null) ?? null,
  }))
}

/** Pipeline rows WITH ids — the shape get_pipeline returns so a conversation
 *  can resolve "the Wellbeing Trust one" to a pipeline_item_id before calling
 *  update_pipeline_item. getPipeline (above) stays id-less for the arithmetic. */
export interface PipelineItemRow {
  pipeline_item_id: string
  grant_name: string
  funder_name: string | null
  stage: string
  amount_requested: number | null
  deadline: string | null
  outcome_date: string | null
}

export async function getPipelineItems(orgId: string): Promise<PipelineItemRow[]> {
  const { data } = await serviceClient()
    .from('pipeline_items')
    .select('id, grant_name, funder_name, stage, amount_requested, deadline, outcome_date')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
  return (data ?? []).map(r => {
    const row = r as Record<string, unknown>
    return {
      pipeline_item_id: String(row.id),
      grant_name: String(row.grant_name ?? ''),
      funder_name: (row.funder_name as string | null) ?? null,
      stage: String(row.stage ?? 'identified'),
      amount_requested: (row.amount_requested as number | null) ?? null,
      deadline: (row.deadline as string | null) ?? null,
      outcome_date: (row.outcome_date as string | null) ?? null,
    }
  })
}

export async function getOrg(orgId: string): Promise<Organisation | null> {
  const { data } = await serviceClient().from('organisations').select('*').eq('id', orgId).maybeSingle()
  if (!data) return null
  const o = data as Record<string, unknown>
  // engines read years_operating; the profile carries years_trading
  return { ...o, years_operating: o.years_operating ?? o.years_trading ?? null } as unknown as Organisation
}

export async function getOrgFacts(orgId: string): Promise<OrgFact[]> {
  try {
    const { data, error } = await serviceClient()
      .from('org_facts').select('*').eq('org_id', orgId).eq('status', 'active')
    if (error || !data) return []
    return data as unknown as OrgFact[]
  } catch { return [] } // table not applied yet
}

export async function getActiveCatalogue(): Promise<GrantOpportunity[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data } = await serviceClient()
    .from('grants_with_funder').select('*')
    .eq('is_active', true).neq('url_status', 'dead')
    .or(`is_rolling.eq.true,deadline.is.null,deadline.gte.${today},next_open_date_parsed.gte.${today}`)
    .limit(1000)
  return (data ?? []).map(row => normaliseScrapedGrant(row as Record<string, unknown>))
}

export async function getGrantById(id: string): Promise<GrantOpportunity | null> {
  const { data } = await serviceClient()
    .from('grants_with_funder').select('*').or(`id.eq.${id},external_id.eq.${id}`).limit(1).maybeSingle()
  return data ? normaliseScrapedGrant(data as Record<string, unknown>) : null
}

export interface PlanDeltas {
  added: number
  stage_changes: number
  removed: number
  events: Array<{ type: string; at: string; payload: Record<string, unknown> }>
}

// Plan-delta since a timestamp, derived from the capture-layer event log alone
// (pipeline_* events carry the surface tag). No agent_runs dependency.
export async function getPipelineDeltasSince(orgId: string, since: string): Promise<PlanDeltas> {
  const { data } = await serviceClient()
    .from('events').select('event_type, created_at, payload')
    .eq('org_id', orgId).gt('created_at', since)
    .in('event_type', ['pipeline_added', 'pipeline_stage_changed', 'pipeline_removed'])
    .order('created_at', { ascending: true })
  const rows = (data ?? []) as Array<Record<string, unknown>>
  return {
    added: rows.filter(r => r.event_type === 'pipeline_added').length,
    stage_changes: rows.filter(r => r.event_type === 'pipeline_stage_changed').length,
    removed: rows.filter(r => r.event_type === 'pipeline_removed').length,
    events: rows.map(r => ({ type: String(r.event_type), at: String(r.created_at), payload: (r.payload as Record<string, unknown>) ?? {} })),
  }
}
