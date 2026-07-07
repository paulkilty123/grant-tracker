// Entitlement — org → tier → allowed tools.
//
// The tier is resolved once at the auth boundary (from a web session or an MCP
// OAuth token → org → tier) and carried on ctx.tier, so this check is PURE and
// identical for both surfaces. Wiring the real tier source (the Companion
// subscription / apply_access on organisations) is a one-place change in
// resolveTier() at the boundary; this map is the policy.

import { EntitlementError, type Tier, type ToolContext } from './types'

const TIER_TOOLS: Record<Tier, ReadonlySet<string>> = {
  free: new Set<string>(),
  apply: new Set<string>(['add_to_pipeline', 'update_pipeline_item', 'get_pipeline']),
  companion: new Set<string>([
    'add_to_pipeline', 'update_pipeline_item', 'get_pipeline',
    'get_funding_goal', 'set_funding_goal', 'get_plan_state', 'get_briefing',
    'assess_opportunity_against_plan', 'get_org_context',
  ]),
  internal: new Set<string>(['*']),
}

export function isEntitled(tier: Tier, tool: string): boolean {
  const s = TIER_TOOLS[tier]
  return !!s && (s.has('*') || s.has(tool))
}

export function requireTool(ctx: ToolContext, tool: string): void {
  if (!isEntitled(ctx.tier, tool)) {
    throw new EntitlementError(`Tier '${ctx.tier}' is not entitled to '${tool}'.`)
  }
}

export function allowedTools(tier: Tier): string[] {
  return Array.from(TIER_TOOLS[tier] ?? [])
}
