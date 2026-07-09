// Server-side inference bounds (build-spec §8) — checked BEFORE any model call.
//
// Counters derive from the capture layer's agent_turn_completed events rather
// than a second bookkeeping table: the instrumentation rail is the budget rail,
// so they cannot drift. Volumes are small (caps are double-digit turns/org/day),
// so summing payloads in JS over today's rows is fine at this scale; swap for a
// SQL aggregate/RPC if caps or usage grow.

import { serviceClient } from '../tools/db'
import {
  DAILY_TURN_CAP_PER_ORG, DAILY_TOKEN_CAP_PER_ORG, DAILY_TOKEN_CAP_GLOBAL,
} from './config'

export type BudgetVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'org_turn_cap' | 'org_token_cap' | 'global_token_cap'; message: string }

interface TurnRow {
  org_id: string | null
  payload: { input_tokens?: number; output_tokens?: number } | null
}

function startOfTodayUtc(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00Z`
}

export async function checkInferenceBudget(orgId: string): Promise<BudgetVerdict> {
  const sb = serviceClient()
  const [{ data }, { data: briefingRuns }] = await Promise.all([
    sb.from('events')
      .select('org_id, payload')
      .eq('event_type', 'agent_turn_completed')
      .gte('created_at', startOfTodayUtc())
      .limit(5000),
    // Briefing guidance generations (agent_runs) share the same token budget
    // and global kill-switch as conversational turns, so total agent spend per
    // org is bounded together. They do NOT count toward the turn cap.
    sb.from('agent_runs')
      .select('org_id, input_tokens, output_tokens')
      .eq('trigger', 'briefing')
      .gte('created_at', startOfTodayUtc())
      .limit(5000),
  ])
  const rows = (data ?? []) as TurnRow[]

  let globalTokens = 0
  let orgTokens = 0
  let orgTurns = 0
  for (const r of rows) {
    const t = (r.payload?.input_tokens ?? 0) + (r.payload?.output_tokens ?? 0)
    globalTokens += t
    if (r.org_id === orgId) { orgTokens += t; orgTurns += 1 }
  }
  for (const r of (briefingRuns ?? []) as Array<{ org_id: string | null; input_tokens: number | null; output_tokens: number | null }>) {
    const t = (r.input_tokens ?? 0) + (r.output_tokens ?? 0)
    globalTokens += t
    if (r.org_id === orgId) orgTokens += t
  }

  if (globalTokens >= DAILY_TOKEN_CAP_GLOBAL) {
    return { allowed: false, reason: 'global_token_cap', message: 'The strategist is at capacity today. Please try again tomorrow.' }
  }
  if (orgTurns >= DAILY_TURN_CAP_PER_ORG) {
    return { allowed: false, reason: 'org_turn_cap', message: "You've reached today's conversation limit. It resets at midnight UTC." }
  }
  if (orgTokens >= DAILY_TOKEN_CAP_PER_ORG) {
    return { allowed: false, reason: 'org_token_cap', message: "You've reached today's usage limit. It resets at midnight UTC." }
  }
  return { allowed: true }
}
