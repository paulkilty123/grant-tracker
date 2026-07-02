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
import { getGoal, getPipeline } from './repository'
import { emitEvent } from '../../events/emit'
import { defineTool } from './envelope'
import { prov, type Provenance } from './types'
import type { GoalInput } from '../types'

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
  secured_amount?: number | null // omit to derive from pipeline 'won'
  source?: 'wizard' | 'upload' | 'conversation'
}
export interface SetFundingGoalResult {
  id: string
  goal: GoalInput
  superseded_prior: boolean
}

// secured is a fact: the sum of pipeline items already 'won', unless the caller
// states one explicitly (e.g. money secured outside the tracked pipeline).
async function deriveSecured(orgId: string, override?: number | null): Promise<number> {
  if (typeof override === 'number') return Math.round(override)
  const pipeline = await getPipeline(orgId)
  return pipeline
    .filter(p => p.stage === 'won')
    .reduce((s, p) => s + (p.amount_requested ?? 0), 0)
}

export const setFundingGoal = defineTool<SetFundingGoalParams, SetFundingGoalResult>({
  name: 'set_funding_goal',
  handler: async (ctx, p) => {
    // Minimal, defensible validation — the authorship guard already rejects
    // prose/content-shaped fields; here we guard the numeric/date invariants the
    // arithmetic depends on.
    if (!p.title || typeof p.title !== 'string') throw new Error('set_funding_goal: title is required')
    if (!Number.isFinite(p.target_amount) || p.target_amount <= 0) throw new Error('set_funding_goal: target_amount must be a positive number')
    if (!p.start_date || !p.end_date) throw new Error('set_funding_goal: start_date and end_date are required')
    if (p.end_date <= p.start_date) throw new Error('set_funding_goal: end_date must be after start_date')

    const sb = serviceClient()
    const secured = await deriveSecured(ctx.orgId, p.secured_amount)

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
      secured_amount: secured,
      start_date: p.start_date,
      end_date: p.end_date,
      mix_targets: p.mix_targets ?? null,
      constraints: p.constraints ?? [],
      source: p.source ?? 'conversation',
    }
    const { data, error } = await sb.from('goals').insert(row).select().single()
    if (error) throw new Error(`set_funding_goal failed: ${error.message}`)

    const g = data as Record<string, unknown>
    return {
      id: String(g.id),
      superseded_prior: (superseded ?? []).length > 0,
      goal: {
        title: String(g.title),
        target_amount: Number(g.target_amount),
        secured_amount: Number(g.secured_amount),
        start_date: String(g.start_date),
        end_date: String(g.end_date),
        mix_targets: (g.mix_targets as Record<string, number> | null) ?? null,
        constraints: (g.constraints as Array<{ kind: string; text: string }>) ?? [],
      },
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
