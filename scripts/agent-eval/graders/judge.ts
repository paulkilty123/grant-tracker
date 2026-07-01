// Rubric judge (R1–R7) — build step 4+. Requires an LLM call and is out of
// scope for step 1 (stub mode runs hard gates only). This placeholder keeps the
// runner's shape stable so --full can wire in the real judge later.

import type { AgentRunOutput, BriefingPack, GoldenCase } from '../../../src/lib/agent/types'

export interface RubricResult {
  enabled: boolean
  note: string
  scores: Record<string, number> // R1..R7 when enabled
}

export function runJudge(_o: AgentRunOutput, _pack: BriefingPack, _c: GoldenCase): RubricResult {
  return {
    enabled: false,
    note: 'Rubric judge (R1–R7) is build step 4 — needs the reasoning pass + an LLM judge call. Stub mode scores hard gates only.',
    scores: {},
  }
}
