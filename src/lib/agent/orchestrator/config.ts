// Orchestrator config — model routing + server-side inference bounds.
//
// MODEL ROUTING (structure wired, DEFAULT PROVISIONAL — Paul picks before this
// ships to users; see the routing options + per-session costs in the session
// notes / build-spec §14). Two lanes:
//   'chat'       — ordinary conversational turns (pipeline updates, questions,
//                  clarifications). Candidate for the cheap model.
//   'strategist' — briefing synthesis and sequencing turns (the constraint-led
//                  readout). The lane that justifies the strong model.
// Until a default is chosen, both lanes inherit AGENT_MODEL (reason.ts's
// Sonnet 4.6) so the harness runs on the model the one-shot reasoner is tuned
// on. Override per-lane with env for A/Bs without a deploy.

import { AGENT_MODEL } from '../llm'

export type TurnKind = 'chat' | 'strategist'

export const CHAT_MODEL = process.env.AGENT_CHAT_MODEL ?? AGENT_MODEL
export const STRATEGIST_MODEL = process.env.AGENT_STRATEGIST_MODEL ?? AGENT_MODEL

export function pickModel(kind: TurnKind): string {
  return kind === 'strategist' ? STRATEGIST_MODEL : CHAT_MODEL
}

/** Hard ceiling on model-call round-trips within one user turn. A turn that
 *  needs more than this is looping, not working. */
export const MAX_LOOP_ITERATIONS = 6

/** Per-model-call output budget. Turns are conversational, not documents. */
export const MAX_TOKENS_PER_CALL = 4096

// ── Server-side inference bounds (build-spec §8: generous but bounded, from
// day one, enforced server-side). Checked before any model call; counters are
// derived from the capture layer's agent_turn_completed events, so there is no
// second bookkeeping system to drift.
export const DAILY_TURN_CAP_PER_ORG = Number(process.env.AGENT_DAILY_TURN_CAP ?? 60)
export const DAILY_TOKEN_CAP_PER_ORG = Number(process.env.AGENT_DAILY_TOKEN_CAP ?? 1_500_000)
/** Global kill-switch budget across all orgs — the spend backstop. */
export const DAILY_TOKEN_CAP_GLOBAL = Number(process.env.AGENT_GLOBAL_DAILY_TOKEN_CAP ?? 20_000_000)

/** Research agent v1 cost lever 1 (design spec §4.1): research actions per org
 *  per calendar month. A "research action" is one turn whose tool_names
 *  included web_search or web_fetch — thread chatter that never searches
 *  doesn't count. Provisional N — set from real research-thread usage once
 *  there is some; generous and mostly invisible until actually hit. */
export const RESEARCH_ACTIONS_MONTHLY_CAP_PER_ORG = Number(process.env.AGENT_RESEARCH_MONTHLY_CAP ?? 40)

/** Feature flag + per-org allowlist (build-spec §2). AGENT_ENABLED must be
 *  'true'; if AGENT_ORG_ALLOWLIST is set (comma-separated org ids), the org
 *  must be on it. Flag off = the route 404s and production is byte-identical. */
export function agentEnabledForOrg(orgId: string): boolean {
  if (process.env.AGENT_ENABLED !== 'true') return false
  const allowlist = (process.env.AGENT_ORG_ALLOWLIST ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (allowlist.length === 0) return true
  return allowlist.includes(orgId)
}
