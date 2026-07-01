// STUB reasoner (build step 1). No model call.
//
// Produces a valid, pack-grounded AgentRunOutput so the graders have real
// structure to check. It is deliberately mechanical — the point of step 1 is
// to prove the harness runs end to end, not to pass the judgment rubric. The
// real reasoning pass is src/lib/agent/reason.ts (build step 4), an LLM call.

import type {
  AgentRunOutput, BriefingPack, PackCandidate, Recommendation, Claim, Flag, RuleOut,
} from '../../src/lib/agent/types'
import { ref } from './refs'

function fmtAmount(c: PackCandidate): string {
  if (c.amountUndisclosed) return 'amount not disclosed'
  const f = (n: number) => `£${n.toLocaleString('en-GB')}`
  if (c.amountMin != null && c.amountMax != null) return `${f(c.amountMin)}–${f(c.amountMax)}`
  if (c.amountMax != null) return `up to ${f(c.amountMax)}`
  if (c.amountMin != null) return `from ${f(c.amountMin)}`
  return 'amount not disclosed'
}

function timingClaim(c: PackCandidate): { claim: string; field: string } {
  if (c.openStatus === 'between_rounds') {
    return { claim: `Currently between rounds${c.nextOpenDate ? `; next opens ${c.nextOpenDate}` : ', no open round'}`, field: 'openStatus' }
  }
  if (c.isRolling) return { claim: 'Rolling — no fixed deadline', field: 'isRolling' }
  if (c.deadline) return { claim: `Closes ${c.deadline}`, field: 'deadline' }
  return { claim: 'No deadline stated', field: 'isRolling' }
}

function buildRec(c: PackCandidate, position: number): Recommendation {
  const timing = timingClaim(c)
  const facts: Claim[] = [
    { claim: c.eligibility.reason || 'Meets the checked eligibility criteria.',
      source: { kind: 'engine_verdict', ref: ref(c.id, 'eligibility') } },
    { claim: timing.claim,
      source: { kind: 'catalogue_field', ref: ref(c.id, timing.field) } },
    { claim: c.amountUndisclosed ? 'Amount not disclosed' : `Award ${fmtAmount(c)}`,
      source: { kind: 'catalogue_field', ref: ref(c.id, c.amountUndisclosed ? 'amountUndisclosed' : 'amount') } },
  ]
  const whatTheyFund = c.funder_brief?.what_they_fund
  if (whatTheyFund && c.funder_brief?.citations?.what_they_fund) {
    facts.push({
      claim: String(whatTheyFund),
      source: { kind: 'brief_citation', ref: ref(c.id, 'brief.what_they_fund'), snippet: c.funder_brief.citations.what_they_fund.snippet },
    })
  }
  return {
    action_type: c.openStatus === 'between_rounds' ? 'prepare' : 'apply',
    opportunity_id: c.id,
    title: c.title,
    why: `${whatTheyFund ? String(whatTheyFund) : `${c.funder} funding that fits the org's profile.`} Eligible now and ${timing.claim.toLowerCase()}.`,
    facts,
    judgments: [
      { claim: position === 0 ? 'Strongest fit for the goal this period.' : 'A credible secondary option to progress in parallel.', basis: 'match-shortlist ordering (stub)' },
    ],
    sequencing_note: c.openStatus === 'between_rounds' ? 'Prepare now; submit when the next round opens.' : null,
  }
}

export function stubReason(pack: BriefingPack): AgentRunOutput {
  const a = pack.arithmetic
  const gbp = (n: number) => `£${n.toLocaleString('en-GB')}`
  const learned: string[] = []

  // Correct-mode exclusion heuristic (step 5 replaces with the real loop).
  let cands = pack.candidates.slice()
  if (pack.userTurn) {
    const ut = pack.userTurn.toLowerCase()
    const before = cands.length
    cands = cands.filter(c => !ut.includes(c.title.toLowerCase()) && !(c.funder && ut.includes(c.funder.toLowerCase())))
    if (cands.length < before) learned.push(`Applied your instruction — excluded the funder you named.`)
  }
  // Restate standing excludes already applied in the pack (the visible loop).
  for (const f of pack.orgFacts) {
    const st = f.structured as Record<string, unknown> | undefined
    if (st?.action === 'exclude') learned.push(`Applied standing constraint: ${f.fact}`)
  }

  const recs = cands.slice(0, 5).map((c, i) => buildRec(c, i))

  const rule_outs: RuleOut[] = pack.ruleOutAnnex.map(r => ({
    opportunity_id: r.id,
    reason_code: r.reason_code,
    detail: r.reason_code === 'excluded_by_org_fact'
      ? 'Excluded by a standing constraint you set.'
      : (r.eligibility.reason || 'Ruled out by the eligibility engine.'),
    source: r.source,
  }))

  // Flags — grounded in pack arithmetic (numbers here are G6-checked).
  const flags: Flag[] = []
  const shareFact = (): Claim[] => [{ claim: 'concentration computed from pipeline', source: { kind: 'catalogue_field', ref: ref('arithmetic', 'concentration') } }]
  if (a.concentration.topFunderShare > 0.5 && a.concentration.topFunderName) {
    flags.push({ kind: 'concentration', detail: `${Math.round(a.concentration.topFunderShare * 100)}% of pipeline sits with ${a.concentration.topFunderName}.`, facts: shareFact() })
  }
  if (a.mixTarget) {
    flags.push({ kind: 'mix', detail: `Goal sets an income mix target; current pipeline should be checked against it.`, facts: shareFact() })
  }
  if (a.gap > 0) {
    flags.push({ kind: 'pacing', detail: `To close the ${gbp(a.gap)} gap over ${a.monthsRemaining} months implies about ${gbp(a.requiredRunRateMonthly)} per month.`, facts: shareFact() })
  }
  flags.push({ kind: 'selection_summary', detail: `Considered ${pack.digest.candidateIds.length} eligible options; ruled out ${pack.digest.excluded.count}.`, facts: shareFact() })

  // Narrative — lead with the binding constraint. Numbers restricted to
  // pack-computed values (G6): the gap, and the concentration share.
  let narrative: string
  if (a.concentration.topFunderShare > 0.5 && a.concentration.topFunderName) {
    narrative = `Your binding constraint is concentration: ${Math.round(a.concentration.topFunderShare * 100)}% of the current pipeline sits with ${a.concentration.topFunderName}, against a ${gbp(a.gap)} gap. Rebalance toward reliable, diversified income before adding another large bid.`
  } else if (pack.coverage.thin) {
    narrative = `Catalogue coverage is thin for ${pack.coverage.about.join(' / ') || 'this profile'}, so treat this as a partial list. Against a ${gbp(a.gap)} gap, prioritise the genuinely eligible options below and cross-check specialist sources.`
  } else {
    narrative = `The gap to your target is ${gbp(a.gap)} over ${a.monthsRemaining} months. Lead with the most winnable, well-fitting options below and sequence against their deadlines.`
  }

  return { narrative, recommendations: recs, rule_outs, flags, questions: [], learned }
}
