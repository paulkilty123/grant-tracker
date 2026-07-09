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

// Secured is DERIVED ON READ from pipeline 'won', never read from the cached
// goals.secured_amount scalar (design decision 9 Jul, spec §7: off-pipeline
// secured income is represented as won pipeline items with a source marker, so
// one sum covers everything and wins can never leave the gap stale).
async function deriveSecuredFromPipeline(orgId: string): Promise<number> {
  const { data } = await serviceClient()
    .from('pipeline_items').select('amount_requested').eq('org_id', orgId).eq('stage', 'won')
  return (data ?? []).reduce((s, r) => s + (((r as Record<string, unknown>).amount_requested as number | null) ?? 0), 0)
}

export async function getGoal(orgId: string): Promise<GoalInput | null> {
  try {
    const [{ data, error }, secured] = await Promise.all([
      serviceClient()
        .from('goals').select('*').eq('org_id', orgId).eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      deriveSecuredFromPipeline(orgId),
    ])
    if (error || !data) return null
    const g = data as Record<string, unknown>
    return {
      title: String(g.title ?? 'Funding goal'),
      target_amount: Number(g.target_amount ?? 0),
      secured_amount: secured,
      start_date: String(g.start_date ?? ''),
      end_date: String(g.end_date ?? ''),
      mix_targets: (g.mix_targets as Record<string, number> | null) ?? null,
      constraints: (g.constraints as Array<{ kind: string; text: string }>) ?? [],
    }
  } catch { return null } // table not applied yet → no goal
}

/** The active goal's row id — needed by the purpose write tools. Kept separate
 *  from getGoal so GoalInput stays the arithmetic shape. */
export async function getActiveGoalId(orgId: string): Promise<string | null> {
  try {
    const { data } = await serviceClient()
      .from('goals').select('id').eq('org_id', orgId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    return data ? String((data as Record<string, unknown>).id) : null
  } catch { return null }
}

// ── briefing guidance cache (agent_runs, trigger='briefing') ─────────────────
// The authored guidance layer (author.ts) is expensive (~9s, ~£0.011/gen), so
// it is generated only when the plan-state signature changes and cached as an
// agent_runs row: narrative = "My read", raw_output.agenda = the week's moves,
// context_digest.signature = the debounce key, token columns = the meter.

export interface BriefingRunCache {
  signature: string
  my_read: string
  agenda: Array<{ ref: string; title: string; reason: string }>
  generated_at: string
  /** complete run with content = safe to show; a guardrail-blocked attempt is
   *  unusable but still debounces (same signature → don't re-spend). */
  usable: boolean
}

export async function getLatestBriefingRun(orgId: string): Promise<BriefingRunCache | null> {
  try {
    const { data } = await serviceClient()
      .from('agent_runs')
      .select('context_digest, narrative, raw_output, created_at, status')
      .eq('org_id', orgId).eq('trigger', 'briefing')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!data) return null
    const r = data as Record<string, unknown>
    const digest = (r.context_digest as { signature?: string } | null) ?? {}
    const raw = (r.raw_output as { agenda?: unknown[] } | null) ?? {}
    const my_read = String(r.narrative ?? '')
    return {
      signature: String(digest.signature ?? ''),
      my_read,
      agenda: (raw.agenda as BriefingRunCache['agenda']) ?? [],
      generated_at: String(r.created_at ?? ''),
      usable: r.status === 'complete' && my_read.length > 0,
    }
  } catch { return null }
}

export async function saveBriefingRun(input: {
  orgId: string; goalId: string | null; signature: string
  myRead: string; agenda: unknown[]
  model: string; promptVersion: string
  inputTokens: number; outputTokens: number; costMicroGbp: number
  status?: 'complete' | 'guardrail_blocked'
}): Promise<string | null> {
  try {
    const { data } = await serviceClient().from('agent_runs').insert({
      org_id: input.orgId,
      goal_id: input.goalId,
      trigger: 'briefing',
      context_digest: { signature: input.signature },
      model: input.model,
      prompt_version: input.promptVersion,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_estimate_microgbp: input.costMicroGbp,
      status: input.status ?? 'complete',
      narrative: input.myRead,
      raw_output: { agenda: input.agenda },
    }).select('created_at').single()
    return data ? String((data as { created_at: string }).created_at) : null
  } catch (e) { console.error('[briefing] saveBriefingRun failed', e); return null }
}

// ── goal purposes (design spec §5/§7) ────────────────────────────────────────

export interface PurposeRow {
  purpose_id: string
  category: string
  label: string
  approx_amount: number | null
  refinement: string | null
}

export async function getPurposes(orgId: string): Promise<PurposeRow[]> {
  try {
    const { data, error } = await serviceClient()
      .from('goal_purposes')
      .select('id, category, label, approx_amount, refinement, sort_order')
      .eq('org_id', orgId).eq('status', 'active')
      .order('sort_order', { ascending: true })
    if (error || !data) return []
    return data.map(r => {
      const row = r as Record<string, unknown>
      return {
        purpose_id: String(row.id),
        category: String(row.category),
        label: String(row.label ?? ''),
        approx_amount: (row.approx_amount as number | null) ?? null,
        refinement: (row.refinement as string | null) ?? null,
      }
    })
  } catch { return [] } // table not applied yet
}

export interface PurposeProgress extends PurposeRow {
  secured: number   // won items assigned to this purpose
  weighted: number  // stage-weighted pipeline assigned to this purpose
}

/** One pipeline item's purpose assignment — the raw rows behind per-purpose
 *  progress, also consumed by the plan-state mix composition (spec §3.3). */
export interface PipelineAllocation {
  purpose_id: string | null
  stage: string
  amount_requested: number | null
}

/** Per-purpose progress, DERIVED on read from pipeline assignments (spec §7:
 *  same derive-not-cache discipline as secured). Items without a purpose count
 *  toward the goal overall — returned in `unassigned`. */
export async function getPurposeProgress(orgId: string): Promise<{ purposes: PurposeProgress[]; unassigned: { secured: number; weighted: number }; allocations: PipelineAllocation[] } | null> {
  const purposes = await getPurposes(orgId)
  if (!purposes.length) return null
  try {
    const { STAGE_WEIGHTS } = await import('../context')
    const { data } = await serviceClient()
      .from('pipeline_items')
      .select('purpose_id, stage, amount_requested')
      .eq('org_id', orgId)
    const rows = (data ?? []) as Array<Record<string, unknown>>
    const allocations: PipelineAllocation[] = rows.map(r => ({
      purpose_id: r.purpose_id ? String(r.purpose_id) : null,
      stage: String(r.stage ?? 'identified'),
      amount_requested: (r.amount_requested as number | null) ?? null,
    }))
    const byPurpose = new Map<string, { secured: number; weighted: number }>()
    const unassigned = { secured: 0, weighted: 0 }
    for (const r of allocations) {
      const amt = r.amount_requested ?? 0
      const bucket = r.purpose_id
        ? (byPurpose.get(r.purpose_id) ?? { secured: 0, weighted: 0 })
        : unassigned
      if (r.stage === 'won') bucket.secured += amt
      bucket.weighted += amt * (STAGE_WEIGHTS[r.stage] ?? 0)
      if (r.purpose_id) byPurpose.set(r.purpose_id, bucket)
    }
    return {
      purposes: purposes.map(p => ({
        ...p,
        secured: Math.round(byPurpose.get(p.purpose_id)?.secured ?? 0),
        weighted: Math.round(byPurpose.get(p.purpose_id)?.weighted ?? 0),
      })),
      unassigned: { secured: Math.round(unassigned.secured), weighted: Math.round(unassigned.weighted) },
      allocations,
    }
  } catch {
    // purpose_id column not applied yet — purposes exist but progress can't derive
    return { purposes: purposes.map(p => ({ ...p, secured: 0, weighted: 0 })), unassigned: { secured: 0, weighted: 0 }, allocations: [] }
  }
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
  /** Short user/system notes — declined items carry their triage reason here
   *  ("Decline reasons: …"), which the plan page surfaces (spec §3.3/§8). */
  notes: string | null
  outcome_notes: string | null
}

export async function getPipelineItems(orgId: string): Promise<PipelineItemRow[]> {
  const { data } = await serviceClient()
    .from('pipeline_items')
    .select('id, grant_name, funder_name, stage, amount_requested, deadline, outcome_date, notes, outcome_notes')
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
      notes: (row.notes as string | null) ?? null,
      outcome_notes: (row.outcome_notes as string | null) ?? null,
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

/** True when a pipeline item moved to 'won' within the window — drives the
 *  briefing's match-funding consideration (rulebook v1.0 R8b). Derived from
 *  the capture-layer event log, like the plan deltas. */
export async function hasRecentWin(orgId: string, days = 30): Promise<boolean> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await serviceClient()
    .from('events').select('payload')
    .eq('org_id', orgId).eq('event_type', 'pipeline_stage_changed')
    .gte('created_at', since).limit(100)
  return (data ?? []).some(r => {
    const payload = (r as Record<string, unknown>).payload as Record<string, unknown> | null
    return payload?.to_stage === 'won'
  })
}

export interface PlanDeltas {
  added: number
  stage_changes: number
  removed: number
  /** surface carries attribution for the briefing's "Since you last looked"
   *  ('mcp' renders as "via Claude"). */
  events: Array<{ type: string; at: string; surface: string; payload: Record<string, unknown> }>
}

// Plan-delta since a timestamp, derived from the capture-layer event log alone
// (pipeline_* events carry the surface tag). No agent_runs dependency.
export async function getPipelineDeltasSince(orgId: string, since: string): Promise<PlanDeltas> {
  const { data } = await serviceClient()
    .from('events').select('event_type, created_at, surface, payload')
    .eq('org_id', orgId).gt('created_at', since)
    .in('event_type', ['pipeline_added', 'pipeline_stage_changed', 'pipeline_removed'])
    .order('created_at', { ascending: true })
  const rows = (data ?? []) as Array<Record<string, unknown>>
  return {
    added: rows.filter(r => r.event_type === 'pipeline_added').length,
    stage_changes: rows.filter(r => r.event_type === 'pipeline_stage_changed').length,
    removed: rows.filter(r => r.event_type === 'pipeline_removed').length,
    events: rows.map(r => ({ type: String(r.event_type), at: String(r.created_at), surface: String(r.surface ?? 'app'), payload: (r.payload as Record<string, unknown>) ?? {} })),
  }
}
