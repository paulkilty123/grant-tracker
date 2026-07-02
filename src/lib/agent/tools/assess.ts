// Read tool: assess_opportunity_against_plan.
//
// Returns one opportunity's eligibility verdict + match breakdown + verified
// fields alongside how it sits against the current gap and mix. The CALLING
// model does the sequencing decision — this tool does none of that reasoning.

import { defineTool } from './envelope'
import { emitEvent } from '../../events/emit'
import { runEligibilityChecks } from '../../eligibility'
import { computeMatchScore } from '../../matching'
import { computeArithmetic } from '../context'
import { prov } from './types'
import { getGoal, getPipeline, getOrg, getGrantById } from './repository'
import type { GrantOpportunity } from '@/types'

const today = () => new Date().toISOString().slice(0, 10)

export interface AssessPayload {
  opportunity: {
    id: string
    title: string
    funder: string
    funding_type: string
    amount_min: number | null
    amount_max: number | null
    amount_undisclosed: boolean
    deadline: string | null
    is_rolling: boolean
  }
  eligibility: { status: string; reason: string | null; issues: Array<{ code: string; severity: string; message: string }> }
  match: { score: number; positive_reasons: string[]; warn_reasons: string[] }
  against_plan:
    | { has_goal: false; note: string }
    | { has_goal: true; gap: number; fits_within_gap: boolean; funding_type: string; mix_target_for_type: number | null; note: string }
}

export const assessOpportunityAgainstPlan = defineTool<{ opportunity_id: string } & Record<string, unknown>, AssessPayload>({
  name: 'assess_opportunity_against_plan',
  handler: async (ctx, p) => {
    const [grant, org, goal, pipeline] = await Promise.all([
      getGrantById(p.opportunity_id), getOrg(ctx.orgId), getGoal(ctx.orgId), getPipeline(ctx.orgId),
    ])
    if (!grant) throw new Error(`assess_opportunity_against_plan: opportunity '${p.opportunity_id}' not found`)
    if (!org) throw new Error('assess_opportunity_against_plan: organisation not found')

    const verdict = runEligibilityChecks(grant, org)
    const match = computeMatchScore(grant, org)
    const g = grant as GrantOpportunity

    let against_plan: AssessPayload['against_plan']
    if (!goal) {
      against_plan = { has_goal: false, note: 'No goal set — set one with set_funding_goal for plan-fit context.' }
    } else {
      const a = computeArithmetic(goal, pipeline, today())
      const ceiling = g.amountMax ?? g.amountMin ?? 0
      against_plan = {
        has_goal: true,
        gap: a.gap,
        fits_within_gap: ceiling > 0 && ceiling <= a.gap,
        funding_type: g.fundingType ?? 'grant',
        mix_target_for_type: a.mixTarget?.[g.fundingType ?? 'grant'] ?? null,
        note: 'Whether and when to pursue this is your call — sequence it against the other candidates.',
      }
    }

    return {
      opportunity: {
        id: g.id, title: g.title, funder: g.funder, funding_type: g.fundingType ?? 'grant',
        amount_min: g.amountMin ?? null, amount_max: g.amountMax ?? null, amount_undisclosed: Boolean(g.amountUndisclosed),
        deadline: g.deadline, is_rolling: g.isRolling,
      },
      eligibility: { status: verdict.status, reason: verdict.reason, issues: verdict.issues },
      match: { score: match.score, positive_reasons: match.positiveReasons ?? [], warn_reasons: match.warnReasons ?? [] },
      against_plan,
    }
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'assess_opportunity_against_plan', result_count: 1, degraded: r.against_plan.has_goal === false })
  },
  provenance: (_ctx, r) => ({
    deadline: prov(r.opportunity.deadline, 'catalogue', null),
    eligibility_status: prov(r.eligibility.status, 'engine', new Date().toISOString()),
  }),
})
