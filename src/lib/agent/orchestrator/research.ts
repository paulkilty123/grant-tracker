// Research agent v1 (design spec §4): the thread-kind capability flag.
//
// Anthropic's server tools (web_search / web_fetch) are executed by Anthropic
// itself — the model calls them, the API resolves them inline, and the
// resolved `server_tool_use` + `web_search_tool_result` / `web_fetch_tool_result`
// blocks come back in the SAME response. Nothing here is dispatched through
// dispatchTool() (dispatch.ts) — server tools never appear in a `tool_use`
// block, only in-registry client tools do — so the loop's existing filter
// (`b.type === 'tool_use'`) already ignores them correctly.
//
// This module is imported ONLY by the orchestrator loop, and the loop only
// offers these tools when the caller explicitly passes `research: true` (set
// from a thread's `kind === 'research'`, never from the briefing generation
// path (reason.ts) or an ordinary drawer turn — spec §4: "never in the
// briefing generation path or the standard drawer in v1").

import type Anthropic from '@anthropic-ai/sdk'
import { contractBlock } from '../contract'

/** Per-turn ceiling on live calls, on top of the monthly org budget
 *  (budget.ts checkResearchBudget) — "generous but bounded" applied twice. */
const MAX_USES_PER_TURN = 5

export const RESEARCH_SERVER_TOOLS: Anthropic.ToolUnion[] = [
  {
    name: 'web_search',
    type: 'web_search_20260209',
    max_uses: MAX_USES_PER_TURN,
    user_location: { type: 'approximate', country: 'GB' },
  },
  {
    name: 'web_fetch',
    type: 'web_fetch_20260309',
    max_uses: MAX_USES_PER_TURN,
  },
]

// Appended after the frozen SYSTEM_PROMPT cache breakpoint, its own separate
// breakpoint (static per `allowed` value, so it still caches — two variants,
// not per-turn text) — never touches the shared briefing/chat prefix that
// non-research turns rely on.
//
// `allowed` reflects cost lever 1 (the monthly budget, checkResearchBudget):
// over budget, web_search/web_fetch are NOT in this turn's tools array at all
// (loop.ts), so the model must be told plainly rather than left to notice a
// missing tool on its own (design spec §4.1: "the adviser says so plainly and
// continues catalogue-only" — never a silent degrade).
export function researchSteering(allowed: boolean): string {
  const capability = allowed
    ? 'you also have web_search and web_fetch in this thread.'
    : 'web_search and web_fetch are NOT available this turn — this organisation is over its monthly research budget. Say so plainly if asked to research something live, and continue from the catalogue only. (check_researched_funder still works — the shared cache from past research is not budget-limited.)'
  return `RESEARCH MODE — ${capability}

${contractBlock(['catalogueFirstResearch', 'researchProvenance', 'discrepancyFlagging'])}

- Before researching a named funder live, call check_researched_funder — if it returns a fresh profile, use it instead of searching; only search live if it is absent or the user needs something the cached summary does not cover.
- After live research turns up something worth keeping about a funder (what they fund, how to approach, watch-outs), call cache_researched_funder with a short summary and the source URLs — this is a cost saving for every future thread and org that asks about the same funder, not a user-facing action, so do it without asking.
- Nothing you find here writes to the catalogue. A researched fact stays a researched fact until a human verifies it.
- No add-to-pipeline offer on a not-yet-catalogued find — Save, Pin, Research deeper, and flag-for-verification are the only actions on one (flag-for-verification is not built yet — for now, say a human needs to check it before it can be tracked).`
}
