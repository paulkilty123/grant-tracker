// Goal agent — the reasoning pass (build-spec §6.2, build step 4).
//
// One LLM call per run. Facts come from the pack (engines + verified fields);
// judgment comes from the model. Structured output is tool-enforced. The result
// is validated render-side by the same G1–G7 gates before it is trusted.

import type { AgentRunOutput, BriefingPack, PackCandidate } from './types'
import { callStructuredTool, AGENT_MODEL, type Usage } from './llm'
import { contractBlock } from './contract'

export const PROMPT_VERSION = 'reason-v2'

const ACTION_TYPES = ['apply', 'prepare', 'investigate', 'hold', 'rebalance', 'relationship']

const OUTPUT_TOOL = {
  name: 'emit_recommendations',
  description: 'Emit the goal-agent recommendation set. This is the only way to respond.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      narrative: { type: 'string', description: 'The constraint-led readout, ≤120 words.' },
      recommendations: {
        type: 'array', maxItems: 5,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            action_type: { type: 'string', enum: ACTION_TYPES },
            opportunity_id: { type: ['string', 'null'] },
            title: { type: 'string' },
            why: { type: 'string', description: '2–3 scannable sentences.' },
            facts: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  claim: { type: 'string' },
                  source: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      kind: { type: 'string', enum: ['catalogue_field', 'engine_verdict', 'org_model', 'brief_citation'] },
                      ref: { type: 'string', description: 'A pack ref like "<id>::deadline" or "arithmetic::gap".' },
                      snippet: { type: 'string' },
                    },
                    required: ['kind', 'ref'],
                  },
                },
                required: ['claim', 'source'],
              },
            },
            judgments: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                properties: { claim: { type: 'string' }, basis: { type: 'string' } },
                required: ['claim', 'basis'],
              },
            },
            sequencing_note: { type: ['string', 'null'] },
          },
          required: ['action_type', 'opportunity_id', 'title', 'why', 'facts', 'judgments', 'sequencing_note'],
        },
      },
      rule_outs: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            opportunity_id: { type: ['string', 'null'] },
            reason_code: { type: 'string' },
            detail: { type: 'string' },
            source: { type: 'string', description: "'engine_verdict' or 'org_fact' or 'agent'" },
          },
          required: ['opportunity_id', 'reason_code', 'detail', 'source'],
        },
      },
      flags: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['concentration', 'mix', 'pacing', 'selection_summary'] },
            detail: { type: 'string' },
            facts: {
              type: 'array',
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  claim: { type: 'string' },
                  source: {
                    type: 'object', additionalProperties: false,
                    properties: { kind: { type: 'string' }, ref: { type: 'string' }, snippet: { type: 'string' } },
                    required: ['kind', 'ref'],
                  },
                },
                required: ['claim', 'source'],
              },
            },
          },
          required: ['kind', 'detail', 'facts'],
        },
      },
      questions: {
        type: 'array', maxItems: 2,
        items: {
          type: 'object', additionalProperties: false,
          properties: { text: { type: 'string' }, would_change: { type: 'string' } },
          required: ['text', 'would_change'],
        },
      },
      learned: { type: 'array', items: { type: 'string' } },
    },
    required: ['narrative', 'recommendations', 'rule_outs', 'flags', 'questions', 'learned'],
  },
}

const SYSTEM = `You are the reasoning core of a companion for UK charities, CICs and social enterprises. You take a goal, the org's situation, and a pre-computed, eligibility-checked shortlist, and produce a short, prioritised, cited set of recommendations. You wrap deterministic engines; you never invent facts.

CONTRACT (canonical — these mirror the tool descriptions; the rules below elaborate but must never contradict them):
${contractBlock()}

WHAT GOOD LOOKS LIKE
- Lead the narrative with the genuinely binding constraint for THIS org (from the arithmetic and context) — not a generic opener, not a list.
- Recommend AT MOST 5 actions; fewer is better. "Nothing new moves your goal this period" is a valid, honest run.
- Sequence the recommendations and say why this order (credibility ladder, deadline windows, unrestricted-before-restricted, decision timelines).
- Rule out the near-misses that a user would otherwise re-research, each with a specific reason. Use the RULE-OUT ANNEX and any eligibility warnings on candidates; carry the engine's reason_code.
- Honest verdicts, including thin-coverage caveats when coverage says thin. Name the thin area.
- Kind challenge: if the user's stated intent conflicts with the goal arithmetic, comply in action but note your view ONCE in a judgment.

FIRM ON FACTS, TRANSPARENT ON JUDGMENT
- Every factual claim — a deadline, an amount, an eligibility verdict, what a funder funds — goes in \`facts\` with a \`source\` that refs the pack. If it is not in the pack, you may not state it as fact.
- Strategic reasoning goes in \`judgments\` (a claim + your basis), never dressed up as fact.
- NUMBERS (strict): the only £ amounts or % you may write in the narrative or a flag's detail are (a) a figure from the ARITHMETIC block, copied exactly, or (b) a specific candidate's stated amount, copied exactly. NEVER blend, sum, average, round, or propose a new target figure in prose (no "aim for £25k grants", no "£78k across three funds"). To reference an opportunity's amount, name the opportunity and put its amount in a sourced fact, not in the narrative.

RULE-OUT CODES: rule_outs[].reason_code MUST be copied exactly from the item shown in the pack — the engine code listed in a candidate's "warnings:" or the "reason_code" on a RULE-OUT ANNEX line — or, for non-engine reasons, exactly one of: excluded_by_org_fact, concentration_hold. Do NOT invent a new code string, a synonym, or an uppercase variant (not "geography_mismatch" for local_area_mismatch, not "BETWEEN_ROUNDS").

SOURCE REFS — every facts[].source.ref must be exactly one of these keys:
- "<id>::eligibility"        kind: engine_verdict   (the candidate's eligibility verdict)
- "<id>::deadline"           kind: catalogue_field  (only if a dated deadline is shown)
- "<id>::isRolling"          kind: catalogue_field  (rolling funds)
- "<id>::openStatus"         kind: catalogue_field  (between-rounds funds)
- "<id>::amount"             kind: catalogue_field  (disclosed amounts)
- "<id>::amountUndisclosed"  kind: catalogue_field  (undisclosed amounts)
- "<id>::brief.what_they_fund" kind: brief_citation (only if a brief snippet is shown)
- "arithmetic::gap" / "arithmetic::concentration" kind: catalogue_field (for flag facts)
where <id> is the bracketed id of a candidate. Every recommendation's opportunity_id must be a candidate id (or null for pure rebalance/relationship advice).

NEVER: guarantee funding or imply certainty ("guaranteed", "you will win", "certain to receive"); claim you can submit applications or make introductions. British English, sentence case.

Respond ONLY by calling emit_recommendations.`

function fmtGbp(n: number): string { return `£${n.toLocaleString('en-GB')}` }

function timingLine(c: PackCandidate): string {
  if (c.openStatus === 'between_rounds') return `between rounds${c.nextOpenDate ? `, next opens ${c.nextOpenDate}` : ''} [ref ${c.id}::openStatus]`
  if (c.isRolling) return `rolling, no fixed deadline [ref ${c.id}::isRolling]`
  if (c.deadline) return `closes ${c.deadline} [ref ${c.id}::deadline]`
  return `no deadline stated [ref ${c.id}::isRolling]`
}
function amountLine(c: PackCandidate): string {
  if (c.amountUndisclosed) return `amount not disclosed [ref ${c.id}::amountUndisclosed]`
  const f = (n: number) => `£${n.toLocaleString('en-GB')}`
  const v = c.amountMin != null && c.amountMax != null ? `${f(c.amountMin)}–${f(c.amountMax)}`
    : c.amountMax != null ? `up to ${f(c.amountMax)}`
    : c.amountMin != null ? `from ${f(c.amountMin)}` : 'unspecified'
  return `${v} [ref ${c.id}::amount]`
}

function renderPack(pack: BriefingPack): string {
  const a = pack.arithmetic
  const org = pack.org as Record<string, unknown>
  const lines: string[] = []
  lines.push(`AS OF: ${pack.as_of}`)
  lines.push(`ORG: ${org.name ?? 'org'} | structure ${org.legal_structure ?? '?'} | income ${org.annual_income_band ?? '?'} | location ${org.primary_location ?? '?'} | sectors ${(org.impact_sectors as string[] ?? []).join(', ')}`)
  lines.push(`GOAL: ${pack.goal.title} — target ${fmtGbp(pack.goal.target_amount)}, secured ${fmtGbp(pack.goal.secured_amount)}`)
  if (pack.goal.constraints?.length) lines.push(`GOAL CONSTRAINTS: ${pack.goal.constraints.map(c => c.text).join(' | ')}`)
  lines.push('')
  lines.push('ARITHMETIC (use these figures verbatim; do not compute your own):')
  lines.push(`  gap ${fmtGbp(a.gap)} | in-pipeline weighted ${fmtGbp(a.inPipelineWeighted)} | unweighted ${fmtGbp(a.inPipelineUnweighted)}`)
  lines.push(`  months remaining ${a.monthsRemaining} | required run-rate ${fmtGbp(a.requiredRunRateMonthly)} per month`)
  lines.push(`  concentration: top funder ${a.concentration.topFunderName ?? 'n/a'} holds ${Math.round(a.concentration.topFunderShare * 100)}% of pipeline; top single opportunity ${Math.round(a.concentration.topOpportunityShare * 100)}%`)
  if (a.mixTarget) lines.push(`  mix target: ${JSON.stringify(a.mixTarget)}`)
  lines.push('')
  if (pack.pipeline.length) {
    lines.push('PIPELINE:')
    for (const p of pack.pipeline) lines.push(`  - ${p.grant_name} (${p.funder_name}) — ${p.stage}${p.amount_requested != null ? `, ${fmtGbp(p.amount_requested)}` : ''}${p.deadline ? `, deadline ${p.deadline}` : ''}`)
    lines.push('')
  }
  if (pack.orgFacts.length) {
    lines.push('ORG FACTS (applied; excludes already filtered out of candidates):')
    for (const f of pack.orgFacts) lines.push(`  - ${f.fact}`)
    lines.push('')
  }
  lines.push(`COVERAGE: ${pack.coverage.thin ? `THIN — ${pack.coverage.note}` : 'adequate'}${pack.coverage.about.length ? ` | about: ${pack.coverage.about.join(', ')}` : ''}`)
  if (pack.userTurn) lines.push(`\nUSER SAID: "${pack.userTurn}"`)
  lines.push('')
  lines.push('CANDIDATES (already eligibility-checked; ordered by fit). Cite by the bracketed id:')
  for (const c of pack.candidates) {
    const brief = c.funder_brief?.what_they_fund
    const warnCodes = c.eligibility.issues.map(i => i.code)
    lines.push(`  [${c.id}] ${c.title} — ${c.funder} | ${c.fundingType} | ${timingLine(c)} | ${amountLine(c)} | eligibility ${c.eligibility.status}${warnCodes.length ? ` warnings: [${warnCodes.join(', ')}]` : ''}${c.eligibility.reason ? ` (${c.eligibility.reason})` : ''} [ref ${c.id}::eligibility]`)
    if (brief) lines.push(`        brief.what_they_fund: "${brief}" [ref ${c.id}::brief.what_they_fund]`)
    if (c.matchReasons?.length) lines.push(`        match: ${c.matchReasons.join('; ')}`)
  }
  lines.push('')
  if (pack.ruleOutAnnex.length) {
    lines.push('RULE-OUT ANNEX (engine-blocked or excluded — if you mention these, rule them out with the reason_code shown):')
    for (const r of pack.ruleOutAnnex) lines.push(`  [${r.id}] ${r.title} — ${r.funder} | reason_code ${r.reason_code}: ${r.eligibility.reason ?? ''}`)
    lines.push('')
  }
  lines.push('Produce the recommendation set now via emit_recommendations.')
  return lines.join('\n')
}

export interface ReasonResult {
  output: AgentRunOutput
  usage: Usage
  model: string
  promptVersion: string
}

export async function reason(pack: BriefingPack, model?: string): Promise<ReasonResult> {
  const { data, usage } = await callStructuredTool<AgentRunOutput>({
    system: SYSTEM,
    user: renderPack(pack),
    tool: OUTPUT_TOOL,
    model: model ?? AGENT_MODEL,
  })
  // Light coercion — the tool schema guarantees shape, but be defensive.
  const output: AgentRunOutput = {
    narrative: data.narrative ?? '',
    recommendations: data.recommendations ?? [],
    rule_outs: data.rule_outs ?? [],
    flags: data.flags ?? [],
    questions: data.questions ?? [],
    learned: data.learned ?? [],
  }
  return { output, usage, model: usage.model, promptVersion: PROMPT_VERSION }
}
