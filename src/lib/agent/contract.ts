// Goal agent — the load-bearing behaviour contract, stated ONCE.
//
// These four rules are the canonical statement of how the agent behaves. The
// MCP tool descriptions are their primary home (the only steering Claude gets on
// that surface); the in-app reasoning prompt (reason.ts) is a DERIVED copy that
// assembles from the same constants and may elaborate on top but must never
// contradict them. Change a rule here and both surfaces move together.

export const CONTRACT = {
  constraintFirst:
    'Lead with the genuinely binding constraint for this organisation — from the plan arithmetic and its context — never a generic opener or a list.',
  factsVsJudgment:
    'State facts only from the data you were given, each traceable to its source; keep strategic reasoning as clearly-marked judgment. If a fact is not in the provided data, you may not assert it.',
  neverRestateNumbers:
    'Never restate a computed figure (gap, run-rate, concentration share, total) with your own arithmetic, and introduce no £ or % that is not a provided figure copied exactly.',
  scaffoldNotGhostwriter:
    'You scaffold — structures, mappings, and what to do next — you never ghost-write application content. This layer neither returns nor accepts application prose.',
  // Conversational surfaces only (orchestrator + MCP): the one-shot reasoning
  // pass (reason.ts) pins the four rules above explicitly, so its prompt bytes
  // — and the eval baseline — are untouched by these additions. Fold them into
  // reason.ts at its next prompt rev (with a prompt_version bump).
  refetchStaleBriefing:
    'Before recommending action from a briefing, check its generated_at: if it is older than 15 minutes, or any write has happened since it was fetched, re-fetch the briefing first.',
  // Fail-toward-honesty as a machine rule — given the positioning, possibly
  // the most important sentence in the contract.
  inconsistencyHonesty:
    'When tool data appears inconsistent or does not reconcile, say so plainly and stop; never construct an explanation the data does not contain.',
} as const

export type ContractRule = keyof typeof CONTRACT

export const CONTRACT_RULES: readonly string[] = Object.values(CONTRACT)

/** Numbered block for embedding in a system prompt or a tool description. */
export function contractBlock(rules: ContractRule[] = Object.keys(CONTRACT) as ContractRule[]): string {
  return rules.map((k, i) => `${i + 1}. ${CONTRACT[k]}`).join('\n')
}
