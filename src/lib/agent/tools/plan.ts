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
import { getGoal, getPipeline, getOrg, getOrgFacts, getActiveCatalogue, getPipelineDeltasSince, getPurposeProgress, hasRecentWin, getActiveGoalId, getLatestBriefingRun, saveBriefingRun, type PlanDeltas, type PurposeProgress, type PurposeRow, type PipelineAllocation } from './repository'
import { deriveMix, type MixCharacter } from './mix'
import { PURPOSE_CATEGORIES, type PurposeCategory } from './goal'
import { buildConsiderations } from '../considerations'
import { authorBriefing, availableMoves, briefingSignature, AUTHOR_PROMPT_VERSION } from '../author'
import { checkInferenceBudget } from '../orchestrator/budget'
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
  /** Award-size mismatch to name on the card (briefing v2 §1), or null. */
  size_note: string | null
}
export interface BriefingGuidance {
  my_read: string
  /** Plan-page framing (mix shape + build order); carried on the briefing
   *  guidance so the plan page reads the same cached generation. */
  plan_read: string
  agenda: Array<{ ref: string; title: string; reason: string }>
  generated_at: string
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
      /** Consequence-phrased selection delta for "since you last looked"
       *  (redesign §2): support/non-cash matches deprioritised because the gap
       *  is a cash gap. Null when the gap is not cash-led or none were held back. */
      selection_note: string | null
      /** Authored guidance layer (briefing v2 §2/§3): the "My read" paragraph
       *  and the ordered week's agenda, from author.ts. Cached per plan-state
       *  signature, regenerated on plan change only, budget-gated. Null = the
       *  page falls back to the deterministic template sentences. Agenda refs
       *  are 'cand:<opportunity_id>' or 'consideration:<kind>'. */
      guidance: BriefingGuidance | null
      /** True when the current plan-state signature has no cached generation
       *  yet, so a background refresh (/api/agent/guidance/refresh) would
       *  produce fresh guidance. The read path never generates; the page fires
       *  the refresh and re-renders. False when guidance is fresh, disabled, or
       *  already attempted at this signature. */
      guidance_stale: boolean
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

/** Consequence-phrased selection delta (redesign §2): when the gap is cash-led,
 *  the cash-first re-rank pushes support/non-cash candidates below the grants.
 *  Name that decision honestly rather than hiding it. */
function computeSelectionNote(pack: BriefingPack): string | null {
  const mix = pack.goal.mix_targets
  const cashGap = !mix || !('investment' in mix) // not an investment-led venture
  if (!cashGap) return null
  const nonCash = pack.candidates.filter(c => ['in_kind', 'programme', 'investment'].includes(c.fundingType)).length
  if (nonCash === 0) return null
  return `${nonCash} in-kind and support match${nonCash === 1 ? '' : 'es'} held back, because they do not move a cash gap.`
}

export function buildBriefingFull(pack: BriefingPack, deltas: PlanDeltas | null, considerations: Array<{ kind: string; detail: string }> = [], guidance: BriefingGuidance | null = null, guidanceStale = false): BriefingPayload {
  return {
    has_goal: true,
    generated_at: new Date().toISOString(),
    plan_state: pack.arithmetic,
    coverage: pack.coverage,
    changes_since: deltas,
    candidate_diff: 'deferred — needs agent_runs snapshots (§5.2)',
    considerations,
    selection_note: computeSelectionNote(pack),
    guidance,
    guidance_stale: guidanceStale,
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
      size_note: c.sizeNote ?? null,
    })),
  }
}

/** The authored guidance layer (briefing v2 §2/§3). Regenerated ONLY when the
 *  plan-state signature changes (debounce: the daily crawl and the clock cannot
 *  burn a regeneration), and only within the per-org / global token budget and
 *  the guidance kill-switch. A guardrail-blocked or budget-blocked attempt
 *  falls back to the deterministic template sentences on the page (guidance =
 *  null) without re-spending at the same plan state. */
function readGuidance(cached: Awaited<ReturnType<typeof getLatestBriefingRun>>, signature: string): { guidance: BriefingGuidance | null; stale: boolean } {
  if (process.env.AGENT_BRIEFING_GUIDANCE === 'false') return { guidance: null, stale: false }
  const matches = !!cached && cached.signature === signature
  const guidance = matches && cached!.usable
    ? { my_read: cached!.my_read, plan_read: cached!.plan_read, agenda: cached!.agenda, generated_at: cached!.generated_at }
    : null
  // stale = the current plan state has no run yet (a refresh would help). A
  // guardrail-blocked attempt at THIS signature counts as attempted, not stale,
  // so a persistent lint failure does not loop the refresher.
  return { guidance, stale: !matches }
}

/** Generate + cache the guidance for the current plan state, if stale and within
 *  budget. Self-assembling so it runs OUT of the read path — the /refresh route
 *  awaits it after a plan-changing write. Idempotent: a run already exists at
 *  this signature → no-op. This is the ONLY place guidance is generated, so
 *  reads (get_briefing / get_plan_state → get_briefing) never block on the LLM.
 *
 *  `settled` (distinct from `refreshed`) is true whenever a run now exists at
 *  the CURRENT signature — including a guardrail-blocked one — so the caller
 *  knows the next read's `guidance_stale` will come back false even though no
 *  new usable guidance landed. Found live: GuidanceRefresher only re-rendered
 *  the page on `refreshed`, so a guardrail-blocked attempt (a real, saved row)
 *  left the client showing its stale-render's loading state forever, because
 *  nothing ever told it to check again. `refreshed` alone is right for "is
 *  there new content to show"; `settled` answers "should the page re-read." */
export async function refreshBriefingGuidance(ctx: { orgId: string; surface: string; userId?: string | null }): Promise<{ refreshed: boolean; settled: boolean; reason: string }> {
  if (process.env.AGENT_BRIEFING_GUIDANCE === 'false') return { refreshed: false, settled: false, reason: 'disabled' }
  const [goal, pipeline, org] = await Promise.all([getGoal(ctx.orgId), getPipeline(ctx.orgId), getOrg(ctx.orgId)])
  if (!goal || !org) return { refreshed: false, settled: false, reason: 'no_goal' }
  const [orgFacts, catalogue, recentWin] = await Promise.all([getOrgFacts(ctx.orgId), getActiveCatalogue(), hasRecentWin(ctx.orgId)])
  const asOf = today()
  const pack = assembleBriefingPack({ org, goal, pipeline, orgFacts, catalogue, asOf, userTurn: null })
  const signature = briefingSignature(pack)
  const cached = await getLatestBriefingRun(ctx.orgId)
  if (cached && cached.signature === signature) return { refreshed: false, settled: true, reason: 'fresh' } // already attempted at this plan state
  const budget = await checkInferenceBudget(ctx.orgId)
  if (!budget.allowed) return { refreshed: false, settled: false, reason: 'budget' }

  // Authoring move set: candidates + the singleton strategic considerations.
  // deadline_pressure is excluded — it is time-critical, stays deterministic
  // (hero chip + "let it go" action), and can fire more than once (ref clash).
  const strategic = buildConsiderations({
    asOf, goalEndDate: goal.end_date, mixTarget: pack.arithmetic.mixTarget,
    arithmetic: { gap: pack.arithmetic.gap, inPipelineWeighted: pack.arithmetic.inPipelineWeighted, target: pack.arithmetic.target || 1 },
    pipelineItems: pipeline.map((pi, i) => ({ pipeline_item_id: String(i), grant_name: pi.grant_name, stage: pi.stage, amount_requested: pi.amount_requested, deadline: pi.deadline })),
    recentWin,
  }).filter(m => m.kind !== 'deadline_pressure')
  const moves = availableMoves(pack.candidates, strategic)
  if (moves.length === 0) return { refreshed: false, settled: false, reason: 'no_moves' }

  try {
    const out = await authorBriefing(pack, moves)
    const goalId = await getActiveGoalId(ctx.orgId)
    await saveBriefingRun({
      orgId: ctx.orgId, goalId, signature,
      myRead: out.my_read, planRead: out.plan_read, agenda: out.agenda,
      model: out.model, promptVersion: AUTHOR_PROMPT_VERSION,
      inputTokens: out.usage.inputTokens, outputTokens: out.usage.outputTokens, costMicroGbp: out.usage.costMicroGbp,
      status: out.numberLintPassed ? 'complete' : 'guardrail_blocked',
    })
    return { refreshed: out.numberLintPassed, settled: true, reason: out.numberLintPassed ? 'generated' : 'lint_failed' }
  } catch (e) {
    console.error('[briefing] guidance generation failed', e)
    return { refreshed: false, settled: false, reason: 'error' }
  }
}

export const getBriefing = defineTool<{ since?: string } & Record<string, unknown>, BriefingPayload>({
  name: 'get_briefing',
  handler: async (ctx, p) => {
    const [goal, pipeline, org] = await Promise.all([getGoal(ctx.orgId), getPipeline(ctx.orgId), getOrg(ctx.orgId)])
    if (!goal) return buildBriefingOnboarding(org, pipeline)
    if (!org) throw new Error('get_briefing: organisation not found')
    const [orgFacts, catalogue, recentWin] = await Promise.all([getOrgFacts(ctx.orgId), getActiveCatalogue(), hasRecentWin(ctx.orgId)])
    const asOf = today()
    const pack = assembleBriefingPack({ org, goal, pipeline, orgFacts, catalogue, asOf, userTurn: null })
    const deltas = typeof p.since === 'string' ? await getPipelineDeltasSince(ctx.orgId, p.since) : null
    const considerations = recentWin ? [{
      kind: 'match_funding',
      detail: 'A win was recorded in the last 30 days. Other funders will match against secured funding — consider match-funding asks that name the secured award; it can expand what the project delivers.',
    }] : []
    // READ-ONLY: the read path never calls the LLM (latency fix). A stale/absent
    // signature yields deterministic fallback + guidance_stale=true; the page
    // fires the background /api/agent/guidance/refresh, which warms the cache and
    // triggers a soft re-render. Generation lives only in refreshBriefingGuidance.
    const signature = briefingSignature(pack)
    const cached = await getLatestBriefingRun(ctx.orgId)
    const { guidance, stale } = readGuidance(cached, signature)
    return buildBriefingFull(pack, deltas, considerations, guidance, stale)
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'get_briefing', result_count: r.has_goal ? r.top_candidates.length : 0, degraded: !r.has_goal })
  },
})
