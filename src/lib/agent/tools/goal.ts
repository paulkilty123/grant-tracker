// Goal tools: get_funding_goal and set_funding_goal — the compass (§5.1).
//
// Both go through the same envelope as every other tool (entitlement ·
// authorship · capture log · provenance). The goal is the org's single source of
// direction, so the schema is deliberately conservative: only the fields the
// tool signature uses, no speculative columns.
//
// HISTORY, NOT CURRENT STATE ONLY: set_funding_goal never hard-deletes. It
// supersedes the prior active goal (status -> 'superseded', kept as a row) and
// inserts a new active one. The partial unique index (one active goal per org)
// means the supersede MUST happen before the insert, or the insert collides.
// The DB has no delete policy on goals, so a hard delete is impossible anyway —
// this ordering is what keeps that invariant satisfiable.

import { serviceClient } from './db'
import { getGoal, getActiveGoalId, getPurposes, type PurposeRow } from './repository'
import { emitEvent } from '../../events/emit'
import { defineTool } from './envelope'
import { prov, SetupSurfaceError, type Provenance } from './types'
import type { GoalInput } from '../types'

export const PURPOSE_CATEGORIES = ['core', 'programme', 'staffing', 'capital', 'capacity', 'working_capital', 'match_funding', 'other'] as const
export type PurposeCategory = typeof PURPOSE_CATEGORIES[number]

export interface PurposeInput {
  category: PurposeCategory
  label: string
  approx_amount?: number | null
  /** Ask-with-refinement answer (rulebook v1.0 R3/R5), e.g. staffing
   *  'delivery post', capacity 'finance and fundraising'. */
  refinement?: string | null
}

const nowIso = () => new Date().toISOString()

// ── get_funding_goal ─────────────────────────────────────────────────────────
// Reads through the SAME repository.getGoal that get_plan_state / get_briefing
// use, so there is exactly one goal reader and no drift. Returns null (not an
// error) when no goal is set — the degraded/onboarding path is the caller's.

export const getFundingGoal = defineTool<Record<string, unknown>, GoalInput | null>({
  name: 'get_funding_goal',
  handler: async (ctx) => getGoal(ctx.orgId),
  logEvent: async (ctx, _p, goal) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'get_funding_goal', result_count: goal ? 1 : 0, degraded: !goal })
  },
  provenance: (_ctx, goal): Record<string, Provenance<unknown>> => goal ? {
    target_amount: prov(goal.target_amount, 'user', null),
    secured_amount: prov(goal.secured_amount, 'engine', nowIso()), // derived from pipeline 'won'
    end_date: prov(goal.end_date, 'user', null),
  } : {},
})

// ── set_funding_goal ─────────────────────────────────────────────────────────

export interface SetFundingGoalParams extends Record<string, unknown> {
  title: string
  target_amount: number
  start_date: string
  end_date: string
  mix_targets?: Record<string, number> | null
  constraints?: Array<{ kind: string; text: string }>
  purposes?: PurposeInput[] // what the money is for (spec §4 Q2); omit on adjustment to carry active purposes forward
  secured_amount?: number | null // income secured OUTSIDE the tracked pipeline — materialised as a won item (spec §7)
  source?: 'wizard' | 'upload' | 'conversation'
}
export interface SetFundingGoalResult {
  id: string
  goal: GoalInput
  superseded_prior: boolean
  purposes: PurposeRow[]
  /** Non-null when the active purposes (fresh or re-parented from a prior
   *  goal) do not reconcile with target_amount — surface this plainly per
   *  CONTRACT.inconsistencyHonesty, never proceed as if they match. */
  purposes_reconciliation_warning: string | null
}

// Off-pipeline secured income enters as a WON PIPELINE ITEM with a source
// marker, never a cached scalar (design decision 9 Jul, spec §7) — so secured
// always derives from one place and wins can never leave the gap stale.
async function materialiseOffPipelineSecured(orgId: string, userId: string | null | undefined, amount: number): Promise<void> {
  // funder_name is NOT NULL in prod (schema predates the tool layer).
  const { error } = await serviceClient().from('pipeline_items').insert({
    org_id: orgId,
    grant_name: 'Pre-existing secured income',
    funder_name: 'Recorded at goal setup',
    stage: 'won',
    amount_requested: Math.round(amount),
    source: 'pre_existing',
    created_by: userId ?? null,
  })
  if (error) throw new Error(`set_funding_goal: could not record off-pipeline secured income: ${error.message}`)
}

// Sibling to materialiseOffPipelineSecured, for the setup stepper's "already in
// motion" step (spec §3.2 step 3): one real pipeline item per named row, not a
// scalar, so each is individually visible/editable in the Kanban afterwards.
// Not a registered tool — called directly from the stepper's Server Action,
// same category as the helper above.
export interface PreExistingRow {
  name: string
  amount: number
  status: 'confirmed' | 'expected'
}

export async function materialisePreExistingRow(orgId: string, userId: string | null | undefined, row: PreExistingRow): Promise<void> {
  const { error } = await serviceClient().from('pipeline_items').insert({
    org_id: orgId,
    grant_name: row.name,
    funder_name: 'Recorded at goal setup',
    stage: row.status === 'confirmed' ? 'won' : 'identified',
    amount_requested: Math.round(row.amount),
    source: 'pre_existing',
    created_by: userId ?? null,
  })
  if (error) throw new Error(`materialisePreExistingRow: could not record pre-existing pipeline item: ${error.message}`)
}

export const setFundingGoal = defineTool<SetFundingGoalParams, SetFundingGoalResult>({
  name: 'set_funding_goal',
  handler: async (ctx, p) => {
    // Structural (not prose) block on first-run setup over MCP. The live
    // steering test (10 Jul) showed description-only steering doesn't hold:
    // the model wrote a goal straight from unquantified purposes on MCP — no
    // amounts question, no recommend_mix, no confirm turn. Adjustments to an
    // EXISTING goal are unaffected; this only blocks creating the first one.
    if (ctx.surface === 'mcp' && !(await getActiveGoalId(ctx.orgId))) {
      throw new SetupSurfaceError(
        'Initial goal setup works best in the Grant Tracker app, which walks through it one question at a time — direct the user to sign in at granttracker.co.uk and set up their funding goal there. Once a goal exists, this tool and the full adviser work fully here.'
      )
    }

    // Minimal, defensible validation — the authorship guard already rejects
    // prose/content-shaped fields; here we guard the numeric/date invariants the
    // arithmetic depends on.
    if (!p.title || typeof p.title !== 'string') throw new Error('set_funding_goal: title is required')
    if (!Number.isFinite(p.target_amount) || p.target_amount <= 0) throw new Error('set_funding_goal: target_amount must be a positive number')
    if (!p.start_date || !p.end_date) throw new Error('set_funding_goal: start_date and end_date are required')
    if (p.end_date <= p.start_date) throw new Error('set_funding_goal: end_date must be after start_date')
    for (const purpose of p.purposes ?? []) {
      if (!PURPOSE_CATEGORIES.includes(purpose.category)) {
        throw new Error(`set_funding_goal: purpose category '${purpose.category}' is not one of: ${PURPOSE_CATEGORIES.join(', ')}`)
      }
      if (!purpose.label) throw new Error('set_funding_goal: every purpose needs a label')
    }

    const sb = serviceClient()

    // Off-pipeline secured income becomes a won pipeline item BEFORE the goal
    // row exists, so the derived secured picks it up like any other win.
    if (typeof p.secured_amount === 'number' && p.secured_amount > 0) {
      await materialiseOffPipelineSecured(ctx.orgId, ctx.userId, p.secured_amount)
    }

    // Supersede the current active goal FIRST (kept as history; partial unique
    // index forbids two active rows). No hard delete — status transition only.
    const { data: superseded } = await sb.from('goals')
      .update({ status: 'superseded', updated_at: nowIso() })
      .eq('org_id', ctx.orgId).eq('status', 'active').select('id')

    const row = {
      org_id: ctx.orgId, // from ctx, NEVER from params
      status: 'active',
      title: p.title,
      target_amount: Math.round(p.target_amount),
      secured_amount: 0, // back-compat column only — secured is DERIVED on read (spec §7)
      start_date: p.start_date,
      end_date: p.end_date,
      mix_targets: p.mix_targets ?? null,
      constraints: p.constraints ?? [],
      source: p.source ?? 'conversation',
    }
    const { data, error } = await sb.from('goals').insert(row).select().single()
    if (error) throw new Error(`set_funding_goal failed: ${error.message}`)
    const g = data as Record<string, unknown>
    const goalId = String(g.id)

    // Purposes: new list provided → write it (retiring any carried rows);
    // omitted on an adjustment → RE-PARENT active purposes to the new goal row
    // so pipeline purpose references survive (spec §5). Table may not be
    // applied yet — purposes fail soft, the goal itself stands.
    try {
      if (p.purposes?.length) {
        await sb.from('goal_purposes')
          .update({ status: 'retired', updated_at: nowIso() })
          .eq('org_id', ctx.orgId).eq('status', 'active')
        const rows = p.purposes.map((purpose, i) => ({
          org_id: ctx.orgId,
          goal_id: goalId,
          category: purpose.category,
          label: purpose.label,
          approx_amount: purpose.approx_amount != null ? Math.round(purpose.approx_amount) : null,
          refinement: purpose.refinement ?? null,
          sort_order: i,
        }))
        const { error: pErr } = await sb.from('goal_purposes').insert(rows)
        if (pErr) console.error('[set_funding_goal] purposes insert failed:', pErr.message)
      } else {
        await sb.from('goal_purposes')
          .update({ goal_id: goalId, updated_at: nowIso() })
          .eq('org_id', ctx.orgId).eq('status', 'active')
      }
    } catch (e) {
      console.error('[set_funding_goal] purposes step skipped:', e)
    }

    const [freshGoal, purposes] = await Promise.all([getGoal(ctx.orgId), getPurposes(ctx.orgId)])
    if (!freshGoal) throw new Error('set_funding_goal: goal write verified read-back failed')

    // Purposes can be re-parented from the prior goal (carried forward, above)
    // rather than restated — nothing previously checked the carried amounts
    // still make sense against a NEW target_amount. Repro'd live 10 Jul: £400k
    // of purposes survived a replacement onto a £300k goal. Flag rather than
    // let a materially mismatched carry-forward pass silently, whether the
    // purposes were just re-parented or restated fresh but don't add up.
    const purposesTotal = purposes.reduce((sum, pu) => sum + (pu.approx_amount ?? 0), 0)
    const purposesHaveAmounts = purposes.some(pu => typeof pu.approx_amount === 'number' && pu.approx_amount > 0)
    const purposesReconciliationWarning =
      purposesHaveAmounts && Math.abs(purposesTotal - freshGoal.target_amount) > freshGoal.target_amount * 0.1
        ? `The active purposes total £${purposesTotal.toLocaleString('en-GB')}, which does not reconcile with the new target of £${freshGoal.target_amount.toLocaleString('en-GB')}${p.purposes?.length ? '' : ' (carried forward from the prior goal)'} — say so plainly and ask whether the purposes need updating, never proceed as if they already match.`
        : null

    return {
      id: goalId,
      superseded_prior: (superseded ?? []).length > 0,
      goal: freshGoal, // secured_amount here is the DERIVED figure
      purposes,
      purposes_reconciliation_warning: purposesReconciliationWarning,
    }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'set_funding_goal', result_count: 1, degraded: false })
  },
  provenance: (_ctx, r) => ({
    id: prov(r.id, 'agent', nowIso()),
    target_amount: prov(r.goal.target_amount, 'user', nowIso()),
    secured_amount: prov(r.goal.secured_amount, 'engine', nowIso()),
    end_date: prov(r.goal.end_date, 'user', nowIso()),
  }),
})

// ── update_goal_purposes ─────────────────────────────────────────────────────
// Purposes are addable and editable AT ANY TIME after setup (spec §5): a side
// funding project ("we're also raising £50k for a minibus") is a purpose line
// inside the active goal, never a parallel goal. Retire, don't delete.

export interface UpdateGoalPurposesParams extends Record<string, unknown> {
  add?: PurposeInput[]
  update?: Array<{ purpose_id: string; label?: string; approx_amount?: number | null; category?: PurposeCategory; refinement?: string | null }>
  retire?: string[] // purpose ids
}
export interface UpdateGoalPurposesResult {
  purposes: PurposeRow[]
  added: number
  updated: number
  retired: number
}

export const updateGoalPurposes = defineTool<UpdateGoalPurposesParams, UpdateGoalPurposesResult>({
  name: 'update_goal_purposes',
  handler: async (ctx, p) => {
    const goalId = await getActiveGoalId(ctx.orgId)
    if (!goalId) throw new Error('update_goal_purposes: no active goal — set one with set_funding_goal first')
    const sb = serviceClient()
    let added = 0, updated = 0, retired = 0

    for (const purpose of p.add ?? []) {
      if (!PURPOSE_CATEGORIES.includes(purpose.category)) {
        throw new Error(`update_goal_purposes: category '${purpose.category}' is not one of: ${PURPOSE_CATEGORIES.join(', ')}`)
      }
      const { error } = await sb.from('goal_purposes').insert({
        org_id: ctx.orgId,
        goal_id: goalId,
        category: purpose.category,
        label: purpose.label,
        approx_amount: purpose.approx_amount != null ? Math.round(purpose.approx_amount) : null,
        refinement: purpose.refinement ?? null,
        sort_order: 100 + added,
      })
      if (error) throw new Error(`update_goal_purposes: add failed: ${error.message}`)
      added += 1
    }
    for (const u of p.update ?? []) {
      const patch: Record<string, unknown> = { updated_at: nowIso() }
      if (u.label !== undefined) patch.label = u.label
      if (u.approx_amount !== undefined) patch.approx_amount = u.approx_amount != null ? Math.round(u.approx_amount) : null
      if (u.category !== undefined) patch.category = u.category
      if (u.refinement !== undefined) patch.refinement = u.refinement
      const { data, error } = await sb.from('goal_purposes')
        .update(patch).eq('id', u.purpose_id).eq('org_id', ctx.orgId).select('id')
      if (error) throw new Error(`update_goal_purposes: update failed: ${error.message}`)
      if (!data?.length) throw new Error('update_goal_purposes: no such purpose for this org')
      updated += 1
    }
    for (const id of p.retire ?? []) {
      const { data, error } = await sb.from('goal_purposes')
        .update({ status: 'retired', updated_at: nowIso() }).eq('id', id).eq('org_id', ctx.orgId).select('id')
      if (error) throw new Error(`update_goal_purposes: retire failed: ${error.message}`)
      if (!data?.length) throw new Error('update_goal_purposes: no such purpose for this org')
      retired += 1
    }

    return { purposes: await getPurposes(ctx.orgId), added, updated, retired }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'update_goal_purposes', result_count: r.purposes.length, degraded: false })
  },
})
