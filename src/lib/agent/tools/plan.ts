// Read tools: get_plan_state and get_briefing.
//
// Both wrap the deterministic core (computeArithmetic / assembleBriefingPack)
// and go through the same envelope as the writes. get_briefing's plan-delta
// comes from the capture-layer event log only (no agent_runs dependency);
// candidate-level "new since last briefing" is deferred until agent_runs exists.
//
// DEGRADED BEHAVIOUR (explicit): with no goal set, both return a useful
// onboarding payload, never an error — on the MCP surface this is the user's
// first moment and Claude relays whatever we return.

import { defineTool } from './envelope'
import { emitEvent } from '../../events/emit'
import { assembleBriefingPack, computeArithmetic, WEIGHTED_FORMULA_CAPTION } from '../context'
import { getGoal, getPipeline, getOrg, getOrgFacts, getActiveCatalogue, getPipelineDeltasSince, getPurposeProgress, hasRecentWin, type PlanDeltas, type PurposeProgress, type PurposeRow, type PipelineAllocation } from './repository'
import { deriveMix, type MixCharacter } from './mix'
import { PURPOSE_CATEGORIES, type PurposeCategory } from './goal'
import type { GoalArithmetic, GoalInput, PipelineEntry, BriefingPack } from '../types'
import type { Organisation } from '@/types'

const today = () => new Date().toISOString().slice(0, 10)
const pipelineValue = (pipeline: PipelineEntry[]) =>
  pipeline.filter(p => p.stage !== 'declined').reduce((s, p) => s + (p.amount_requested ?? 0), 0)

function orgSummary(org: Organisation | null) {
  const o = (org ?? {}) as unknown as Record<string, unknown>
  return {
    structure: o.legal_structure ?? null,
    income_band: o.annual_income_band ?? null,
    location: o.primary_location ?? null,
    sectors: (o.impact_sectors as string[]) ?? [],
  }
}

// ── get_plan_state ───────────────────────────────────────────────────────────

/** Per-purpose progress (spec §5/§7): derived on read from pipeline purpose
 *  assignments. Null when no purposes exist (pre-setup or pre-migration). */
export interface PurposesBlock {
  items: PurposeProgress[]
  unassigned: { secured: number; weighted: number }
}

/** Mix composition, pipeline versus target (spec §3.3). Each slice compares
 *  the confirmed target share with what the pipeline actually pursues,
 *  attributed via purpose assignments: a pipeline item counts toward the
 *  funding characters its purpose's rulebook mapping names. Deterministic —
 *  the same derive-not-cache discipline as secured. */
export interface MixSlice {
  character: string // MixCharacter for rulebook-era goals; legacy goals may carry source-vocabulary keys
  target_pct: number
  target_amount: number // target_pct of the goal target, rounded
  in_pipeline: number   // attributed active (non-declined) pipeline value, won included
  secured: number       // the won share of in_pipeline
}
export interface MixProgressBlock {
  /** False when composition cannot be derived (no purposes, or the purpose_id
   *  column predates migration 036) — targets still render; absence claims
   *  ("nothing addresses X") are only honest when this is true. */
  attributable: boolean
  slices: MixSlice[]
  /** Active pipeline value not counted in any slice: unassigned items, or
   *  items on an off-rulebook purpose. */
  unattributed: number
  basis: string
}

export function buildMixProgress(
  goal: GoalInput,
  purposes: PurposeRow[],
  allocations: PipelineAllocation[],
  pipeline: PipelineEntry[],
): MixProgressBlock | null {
  const targets = goal.mix_targets ?? null
  if (!targets || Object.keys(targets).length === 0) return null

  const attributable = purposes.length > 0 && allocations.length > 0
  const inPipeline = new Map<string, number>()
  const secured = new Map<string, number>()
  let attributed = 0
  const activeTotal = (attributable ? allocations : pipeline)
    .filter(r => r.stage !== 'declined')
    .reduce((s, r) => s + (r.amount_requested ?? 0), 0)

  if (attributable) {
    // deriveMix returns exactly one component per input purpose, in order — zip
    // by index to recover purpose_id → refinement-aware rulebook mapping.
    const components = deriveMix(purposes.map(p => ({
      category: (PURPOSE_CATEGORIES.includes(p.category as PurposeCategory) ? p.category : 'other') as PurposeCategory,
      label: p.label,
      approx_amount: p.approx_amount,
      refinement: p.refinement,
    }))).components
    const mappingByPurpose = new Map<string, Partial<Record<MixCharacter, number>> | null>()
    purposes.forEach((p, i) => mappingByPurpose.set(p.purpose_id, components[i]?.mapping ?? null))

    for (const row of allocations) {
      if (row.stage === 'declined') continue
      const amt = row.amount_requested ?? 0
      if (amt <= 0) continue
      const mapping = row.purpose_id ? mappingByPurpose.get(row.purpose_id) : null
      if (!mapping) continue // unassigned, or off-rulebook purpose → stays unattributed
      for (const [character, pct] of Object.entries(mapping)) {
        const share = amt * (pct / 100)
        inPipeline.set(character, (inPipeline.get(character) ?? 0) + share)
        if (row.stage === 'won') secured.set(character, (secured.get(character) ?? 0) + share)
        attributed += share
      }
    }
  }

  const characters = Array.from(new Set([...Object.keys(targets), ...Array.from(inPipeline.keys())]))
  return {
    attributable,
    slices: characters.map(character => ({
      character,
      target_pct: targets[character] ?? 0,
      target_amount: Math.round(((targets[character] ?? 0) / 100) * goal.target_amount),
      in_pipeline: Math.round(inPipeline.get(character) ?? 0),
      secured: Math.round(secured.get(character) ?? 0),
    })),
    unattributed: Math.round(Math.max(0, activeTotal - attributed)),
    basis: 'Composition is derived from purpose assignments: each pipeline item counts toward the funding characters its purpose maps to.',
  }
}

export type PlanStatePayload =
  | { has_goal: false; message: string; to_set_a_goal: string[] }
  | {
      has_goal: true
      goal: { title: string; target_amount: number; secured_amount: number; end_date: string }
      arithmetic: GoalArithmetic
      weighted_formula: string
      purposes: PurposesBlock | null
      /** Pipeline-versus-target mix composition; null when the goal has no
       *  confirmed mix (for example a goal that predates the rulebook). */
      mix: MixProgressBlock | null
    }

export function buildPlanState(goal: GoalInput | null, pipeline: PipelineEntry[], asOf: string, purposes: PurposesBlock | null = null, mix: MixProgressBlock | null = null): PlanStatePayload {
  if (!goal) {
    return {
      has_goal: false,
      message: 'No active funding goal is set, so there is no plan state to compute yet.',
      to_set_a_goal: ['a funding target for the period', 'the end date', 'optionally a funding-type mix'],
    }
  }
  return {
    has_goal: true,
    goal: { title: goal.title, target_amount: goal.target_amount, secured_amount: goal.secured_amount, end_date: goal.end_date },
    arithmetic: computeArithmetic(goal, pipeline, asOf),
    weighted_formula: WEIGHTED_FORMULA_CAPTION,
    purposes,
    mix,
  }
}

export const getPlanState = defineTool<Record<string, unknown>, PlanStatePayload>({
  name: 'get_plan_state',
  handler: async (ctx) => {
    const [goal, pipeline, purposeProgress] = await Promise.all([
      getGoal(ctx.orgId), getPipeline(ctx.orgId), getPurposeProgress(ctx.orgId),
    ])
    const purposes = purposeProgress
      ? { items: purposeProgress.purposes, unassigned: purposeProgress.unassigned }
      : null
    const mix = goal
      ? buildMixProgress(goal, purposeProgress?.purposes ?? [], purposeProgress?.allocations ?? [], pipeline)
      : null
    return buildPlanState(goal, pipeline, today(), purposes, mix)
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'get_plan_state', result_count: r.has_goal ? 1 : 0, degraded: !r.has_goal })
  },
})

// ── get_briefing ─────────────────────────────────────────────────────────────

// A FitCard carries enough verified fields to sequence from in conversation —
// amounts, timing, warning codes — without an assess round-trip per candidate.
// Also a hard dependency of the briefing-page candidate cards (§14.1.3).
interface FitCard {
  opportunity_id: string
  title: string
  funder: string
  funding_type: string
  amount_min: number | null
  amount_max: number | null
  amount_undisclosed: boolean
  deadline: string | null
  is_rolling: boolean
  next_open_date: string | null
  open_status: string | null
  eligibility_status: string
  warning_codes: string[]
  match_reasons: string[]
  /** Verification chrome (spec §3.1): 'checked' = the link validator passed on
   *  checked_at (say "checked against funder site", never "verified");
   *  'unverified' = never checked or last check failed → amber badge. */
  record_check: { status: 'checked' | 'unverified'; checked_at: string | null }
}
export type BriefingPayload =
  | {
      has_goal: false
      generated_at: string
      onboarding: {
        message: string
        to_build_your_plan: string[]
        next: string
        what_i_can_already_see: { pipeline_items: number; pipeline_value: number; org: ReturnType<typeof orgSummary> }
      }
    }
  | {
      has_goal: true
      generated_at: string
      plan_state: GoalArithmetic
      coverage: BriefingPack['coverage']
      changes_since: PlanDeltas | null
      candidate_diff: 'deferred — needs agent_runs snapshots (§5.2)'
      top_candidates: FitCard[]
      /** Deterministic strategist nudges (rulebook v1.0 R8b: match funding
       *  after a recent win). Relay, and reason from, never invent. */
      considerations: Array<{ kind: string; detail: string }>
    }

export function buildBriefingOnboarding(org: Organisation | null, pipeline: PipelineEntry[]): BriefingPayload {
  return {
    has_goal: false,
    generated_at: new Date().toISOString(),
    onboarding: {
      message: "You don't have a funding goal set yet, so I can't hold a plan or measure your gap. Tell me your target for the year and your deadline and I'll build one and start prioritising against it.",
      to_build_your_plan: [
        'a funding target for the period (for example £250,000)',
        'the end date you are working towards',
        'optionally, a funding-type mix (for example 70% grants, 20% contracts, 10% corporate)',
      ],
      next: 'Set those with set_funding_goal, then ask for your briefing again.',
      what_i_can_already_see: {
        pipeline_items: pipeline.length,
        pipeline_value: pipelineValue(pipeline),
        org: orgSummary(org),
      },
    },
  }
}

export function buildBriefingFull(pack: BriefingPack, deltas: PlanDeltas | null, considerations: Array<{ kind: string; detail: string }> = []): BriefingPayload {
  return {
    has_goal: true,
    generated_at: new Date().toISOString(),
    plan_state: pack.arithmetic,
    coverage: pack.coverage,
    changes_since: deltas,
    candidate_diff: 'deferred — needs agent_runs snapshots (§5.2)',
    considerations,
    top_candidates: pack.candidates.slice(0, 8).map(c => ({
      opportunity_id: c.id,
      title: c.title,
      funder: c.funder,
      funding_type: c.fundingType,
      amount_min: c.amountMin,
      amount_max: c.amountMax,
      amount_undisclosed: c.amountUndisclosed,
      deadline: c.deadline,
      is_rolling: c.isRolling,
      next_open_date: c.nextOpenDate ?? null,
      open_status: c.openStatus ?? null,
      eligibility_status: c.eligibility.status,
      warning_codes: c.eligibility.issues.map(i => i.code),
      match_reasons: c.matchReasons ?? [],
      record_check: c.urlStatus === 'ok' && c.urlLastChecked
        ? { status: 'checked', checked_at: c.urlLastChecked }
        : { status: 'unverified', checked_at: null },
    })),
  }
}

export const getBriefing = defineTool<{ since?: string } & Record<string, unknown>, BriefingPayload>({
  name: 'get_briefing',
  handler: async (ctx, p) => {
    const [goal, pipeline, org] = await Promise.all([getGoal(ctx.orgId), getPipeline(ctx.orgId), getOrg(ctx.orgId)])
    if (!goal) return buildBriefingOnboarding(org, pipeline)
    if (!org) throw new Error('get_briefing: organisation not found')
    const [orgFacts, catalogue, recentWin] = await Promise.all([getOrgFacts(ctx.orgId), getActiveCatalogue(), hasRecentWin(ctx.orgId)])
    const pack = assembleBriefingPack({ org, goal, pipeline, orgFacts, catalogue, asOf: today(), userTurn: null })
    const deltas = typeof p.since === 'string' ? await getPipelineDeltasSince(ctx.orgId, p.since) : null
    const considerations = recentWin ? [{
      kind: 'match_funding',
      detail: 'A win was recorded in the last 30 days. Other funders will match against secured funding — consider match-funding asks that name the secured award; it can expand what the project delivers.',
    }] : []
    return buildBriefingFull(pack, deltas, considerations)
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'get_briefing', result_count: r.has_goal ? r.top_candidates.length : 0, degraded: !r.has_goal })
  },
})
