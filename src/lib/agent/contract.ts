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
} as const

export type ContractRule = keyof typeof CONTRACT

export const CONTRACT_RULES: readonly string[] = Object.values(CONTRACT)

/** Numbered block for embedding in a system prompt or a tool description. */
export function contractBlock(rules: ContractRule[] = Object.keys(CONTRACT) as ContractRule[]): string {
  return rules.map((k, i) => `${i + 1}. ${CONTRACT[k]}`).join('\n')
}
