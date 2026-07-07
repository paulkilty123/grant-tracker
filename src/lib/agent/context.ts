// Goal agent — deterministic context assembly (build-spec §6.1, build step 3).
//
// Pure function: (org, goal, pipeline, org_facts, catalogue) → BriefingPack.
// No LLM, no I/O. The eval harness feeds `catalogue` from fixtures; production
// feeds it from a grants_with_funder query. It wraps the existing engines —
// computeMatchScore (shortlist + reasons) and runEligibilityChecks (verdicts) —
// and never rebuilds them.
//
// Facts come from engines and verified fields; judgment comes from the model.
// This module produces only facts; the reasoning pass (reason.ts, step 4) does
// the judgment over them.

import { computeMatchScore } from '../matching'
import { runEligibilityChecks } from '../eligibility'
import type { GrantOpportunity, Organisation } from '@/types'
import type {
  BriefingPack, PackCandidate, GoalArithmetic, GoalInput, OrgFact, PipelineEntry,
} from './types'

const SHORTLIST_N = 40

/** Per-stage likelihood weights for the weighted-pipeline figure (design spec
 *  §7). FINALISED in the rulebook review (v1.0): identified counts ZERO — a
 *  bookmark is not money — and the principle recorded in build-spec §14 is
 *  that the gap must never flatter; conservative beats optimistic everywhere
 *  the arithmetic surfaces. Values render to users via the caption below.
 *  Learned weights are a brain feature later. */
export const STAGE_WEIGHTS: Record<string, number> = {
  identified: 0, applying: 0.25, submitted: 0.4, won: 1, declined: 0,
}
export const WEIGHTED_FORMULA_CAPTION = 'weighted = amount × stage likelihood'

export interface ContextInput {
  org: Organisation
  goal: GoalInput
  pipeline: PipelineEntry[]
  orgFacts: OrgFact[]
  catalogue: GrantOpportunity[]
  asOf: string
  userTurn?: string | null
}

function dayDiff(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function computeArithmetic(goal: GoalInput, pipeline: PipelineEntry[], asOf: string): GoalArithmetic {
  const active = pipeline.filter(p => p.stage !== 'declined')
  const total = active.reduce((s, p) => s + (p.amount_requested ?? 0), 0)
  const weighted = pipeline.reduce((s, p) => s + (p.amount_requested ?? 0) * (STAGE_WEIGHTS[p.stage] ?? 0), 0)

  const byFunder = new Map<string, number>()
  let topOpp = 0
  for (const p of active) {
    const amt = p.amount_requested ?? 0
    byFunder.set(p.funder_name, (byFunder.get(p.funder_name) ?? 0) + amt)
    topOpp = Math.max(topOpp, amt)
  }
  let topFunderName: string | null = null
  let topFunderSum = 0
  for (const [f, sum] of Array.from(byFunder.entries())) if (sum > topFunderSum) { topFunderSum = sum; topFunderName = f }

  const gap = goal.target_amount - goal.secured_amount
  const days = Math.max(0, dayDiff(asOf, goal.end_date))
  const months = days / 30.44
  return {
    target: goal.target_amount,
    secured: goal.secured_amount,
    inPipelineWeighted: Math.round(weighted),
    inPipelineUnweighted: total,
    gap,
    daysRemaining: days,
    monthsRemaining: Math.round(months * 10) / 10,
    requiredRunRateMonthly: months > 0 ? Math.round(gap / months) : gap,
    mixTarget: goal.mix_targets,
    concentration: {
      topFunderName,
      topFunderShare: total > 0 ? Math.round((topFunderSum / total) * 100) / 100 : 0,
      topOpportunityShare: total > 0 ? Math.round((topOpp / total) * 100) / 100 : 0,
    },
  }
}

function toPackCandidate(g: GrantOpportunity, reasons: string[], eligibility: PackCandidate['eligibility']): PackCandidate {
  const brief = (g as unknown as { funderBrief?: PackCandidate['funder_brief'] }).funderBrief ?? null
  return {
    id: g.id,
    title: g.title,
    funder: g.funder,
    fundingType: g.fundingType ?? 'grant',
    amountMin: g.amountMin ?? null,
    amountMax: g.amountMax ?? null,
    amountUndisclosed: Boolean(g.amountUndisclosed),
    deadline: g.deadline,
    isRolling: g.isRolling,
    nextOpenDate: g.nextOpenDate ?? null,
    openStatus: (brief as { open_status?: string } | null)?.open_status ?? null,
    eligibleStructures: (g.eligibleStructures as string[]) ?? [],
    minOrgIncome: g.minOrgIncome ?? null,
    maxOrgIncome: g.maxOrgIncome ?? null,
    locationTag: g.locationTag ?? null,
    isInviteOnly: g.isInviteOnly,
    sectors: g.sectors ?? [],
    impactSectors: (g.impactSectors as string[]) ?? [],
    beneficiaryGroups: (g.beneficiaryGroups as string[]) ?? [],
    funder_brief: brief,
    eligibility,
    matchReasons: reasons,
  }
}

// An org_facts exclude matches a candidate by funder name or a category keyword.
function excludedByFact(g: GrantOpportunity, facts: OrgFact[]): boolean {
  for (const f of facts) {
    const st = f.structured as Record<string, unknown> | undefined
    if (!st || st.action !== 'exclude') continue
    const funder = String(st.funder ?? '').toLowerCase()
    const cat = String(st.funder_category ?? '').toLowerCase()
    if (funder && g.funder.toLowerCase().includes(funder)) return true
    if (cat) {
      const key = cat.replace(/_industry$/, '')
      const hay = `${g.id} ${g.funder} ${(g.sectors ?? []).join(' ')}`.toLowerCase()
      if (key && hay.includes(key)) return true
    }
  }
  return false
}

export function assembleBriefingPack(input: ContextInput): BriefingPack {
  const { org, goal, pipeline, orgFacts, catalogue, asOf } = input

  // Score every catalogue row, keep the top N by match score (build-spec §6.1.2).
  const scored = catalogue.map(g => {
    const m = computeMatchScore(g, org)
    return { g, score: m.score, reasons: m.positiveReasons ?? [] }
  }).sort((a, b) => b.score - a.score).slice(0, SHORTLIST_N)

  const candidates: PackCandidate[] = []
  const ruleOutAnnex: BriefingPack['ruleOutAnnex'] = []
  const excludedByReason: Record<string, number> = {}

  for (const { g, reasons } of scored) {
    const verdict = runEligibilityChecks(g, org)

    // org_facts excludes are hard filters → annex (build-spec §5.3).
    if (excludedByFact(g, orgFacts)) {
      excludedByReason.excluded_by_org_fact = (excludedByReason.excluded_by_org_fact ?? 0) + 1
      ruleOutAnnex.push({ id: g.id, title: g.title, funder: g.funder, reason_code: 'excluded_by_org_fact', source: 'org_fact', eligibility: verdict })
      continue
    }
    // Engine BLOCKERS (status 'ineligible') → annex; warnings stay candidates
    // (the reasoning pass decides whether a warning near-miss is worth ruling
    // out, citing the engine's warning code).
    if (verdict.status === 'ineligible') {
      const code = verdict.issues.find(i => i.severity === 'blocker')?.code ?? 'ineligible'
      excludedByReason[code] = (excludedByReason[code] ?? 0) + 1
      ruleOutAnnex.push({ id: g.id, title: g.title, funder: g.funder, reason_code: code, source: 'engine_verdict', eligibility: verdict })
      continue
    }
    candidates.push(toPackCandidate(g, reasons, verdict))
  }

  const thin = candidates.length < 3
  const orgLoc = String((org as unknown as { primary_location?: string }).primary_location ?? '')
  const orgSectors = ((org as unknown as { impact_sectors?: string[] }).impact_sectors ?? []).slice(0, 2)
  const coverageAbout = [orgLoc, ...orgSectors].filter(Boolean)

  return {
    as_of: asOf,
    org: org as unknown as Record<string, unknown>,
    goal,
    arithmetic: computeArithmetic(goal, pipeline, asOf),
    candidates,
    ruleOutAnnex,
    pipeline,
    orgFacts,
    coverage: {
      thin,
      note: thin ? `Few eligible catalogue matches for ${coverageAbout.join(' / ') || 'this profile'}.` : null,
      about: coverageAbout,
    },
    sector_signals: [],
    userTurn: input.userTurn ?? null,
    digest: {
      candidateIds: candidates.map(c => c.id),
      excluded: {
        count: Object.values(excludedByReason).reduce((a, b) => a + b, 0),
        byReason: excludedByReason,
      },
    },
  }
}
