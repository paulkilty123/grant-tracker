// Rubric judge R1–R7 (eval-harness §3), build step 4.
//
// One LLM judge call per case. Scores the adviser-quality dimensions the
// iteration loop climbs. Anti-leniency: the judge must quote output evidence
// for any score ≥4 or ≤2. Judge model is versioned alongside the agent prompt.

import type { AgentRunOutput, BriefingPack, GoldenCase } from '../../../src/lib/agent/types'
import { callStructuredTool, JUDGE_MODEL, type Usage } from '../../../src/lib/agent/llm'

export const JUDGE_PROMPT_VERSION = 'judge-v1'

const DIMS: Record<string, string> = {
  R1: 'constraint-first — does the narrative lead with the genuinely binding constraint for this org (from the pack arithmetic and context), not a generic opener or a list?',
  R2: 'sequencing — is there a real ordering argument (credibility ladder, deadline windows, unrestricted-before-restricted, decision timelines), correctly grounded?',
  R3: 'rule-out quality — are near-misses ruled out for the right reasons, specific enough that the user need not re-research them?',
  R4: 'fact/judgment separation — is everything in facts genuinely factual and sourced, everything strategic genuinely in judgments — no judgment smuggled as fact, no fact hedged as opinion?',
  R5: 'consultant test — would a senior UK fundraising consultant agree with the set and its priorities? Flag anything naive, generic, or sector-tone-deaf.',
  R6: 'kind challenge — where the case warrants it, does the agent push back constructively and invite challenge, rather than comply silently or lecture?',
  R7: 'load-reduction feel — does the output read as relief (few things, clearly why, what to do) rather than homework (long, hedged, option-dump)?',
}

const intScore = { type: 'integer', minimum: 1, maximum: 5 }
const JUDGE_TOOL = {
  name: 'score_output',
  description: 'Score the agent output against each rubric dimension, 1–5, with evidence.',
  input_schema: {
    type: 'object', additionalProperties: false,
    properties: {
      scores: {
        type: 'object', additionalProperties: false,
        properties: Object.fromEntries(Object.keys(DIMS).map(k => [k, intScore])),
        required: Object.keys(DIMS),
      },
      evidence: {
        type: 'object', additionalProperties: false,
        properties: Object.fromEntries(Object.keys(DIMS).map(k => [k, { type: 'string' }])),
        required: Object.keys(DIMS),
      },
      overall_note: { type: 'string' },
    },
    required: ['scores', 'evidence', 'overall_note'],
  },
}

const SYSTEM = `You are a senior UK fundraising consultant grading an AI companion's recommendation set against a fixed rubric. Be strict and specific — this score drives iteration, so leniency is a bug. For any dimension you score 4–5 or 1–2, your evidence MUST quote the specific output text (or its absence) that justifies it. A 3 is "acceptable, unremarkable". Reserve 5 for genuinely excellent. Judge only what is in the output against the briefing pack provided; do not reward claims the pack doesn't support. Respond only via score_output.`

function packSummary(pack: BriefingPack): string {
  const a = pack.arithmetic
  const cands = pack.candidates.map(c => `[${c.id}] ${c.title} (${c.funder}) elig=${c.eligibility.status}`).join('; ')
  const annex = pack.ruleOutAnnex.map(r => `[${r.id}] ${r.title} ${r.reason_code}`).join('; ')
  return [
    `Goal: ${pack.goal.title}, target £${pack.goal.target_amount.toLocaleString('en-GB')}, secured £${pack.goal.secured_amount.toLocaleString('en-GB')}, gap £${a.gap.toLocaleString('en-GB')}.`,
    `Concentration: top funder ${a.concentration.topFunderName ?? 'n/a'} ${Math.round(a.concentration.topFunderShare * 100)}%.`,
    pack.coverage.thin ? `Coverage THIN: ${pack.coverage.note}` : 'Coverage adequate.',
    pack.userTurn ? `User said: "${pack.userTurn}"` : '',
    `Eligible candidates: ${cands || 'none'}.`,
    `Rule-out annex: ${annex || 'none'}.`,
  ].filter(Boolean).join('\n')
}

export interface RubricResult {
  enabled: boolean
  note: string
  scores: Record<string, number>
  evidence?: Record<string, string>
  usage?: Usage
}

export async function runJudge(o: AgentRunOutput, pack: BriefingPack, c: GoldenCase): Promise<RubricResult> {
  const rubric = Object.entries(DIMS).map(([k, v]) => `${k}: ${v}`).join('\n')
  const user = [
    `RUBRIC (score each 1–5):\n${rubric}`,
    `\nCASE FOCUS (double-weighted here): ${c.expected.rubric_focus.join(', ')}`,
    `\nCASE GUIDANCE (what a 5 vs a 2 looks like here):\n${c.expected.judge_guidance}`,
    `\nBRIEFING PACK (ground truth):\n${packSummary(pack)}`,
    `\nAGENT OUTPUT TO SCORE:\n${JSON.stringify(o, null, 2)}`,
  ].join('\n')

  const { data, usage } = await callStructuredTool<{ scores: Record<string, number>; evidence: Record<string, string>; overall_note: string }>({
    system: SYSTEM, user, tool: JUDGE_TOOL, model: JUDGE_MODEL, maxTokens: 2000,
  })
  return { enabled: true, note: data.overall_note ?? '', scores: data.scores ?? {}, evidence: data.evidence, usage }
}

// Case rubric score: weighted mean with rubric_focus doubled (eval-harness §5).
export function rubricScore(scores: Record<string, number>, focus: string[]): { score: number; minDim: number } {
  const keys = Object.keys(DIMS)
  let num = 0, den = 0, minDim = 5
  for (const k of keys) {
    const s = scores[k]
    if (typeof s !== 'number') continue
    const w = focus.includes(k) ? 2 : 1
    num += s * w; den += w
    minDim = Math.min(minDim, s)
  }
  return { score: den ? Math.round((num / den) * 100) / 100 : 0, minDim }
}
