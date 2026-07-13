// Tool dispatch — TOOL_REGISTRY name → envelope-wrapped ToolFn, plus the
// Anthropic tool definitions derived from the registry's canonical
// input_schema. The orchestrator never defines a tool shape of its own: the
// registry is the single source for name, description, and params, so the
// in-app model and a future external MCP client are steered identically.

import {
  TOOL_REGISTRY,
  addToPipeline, updatePipelineItem, getPipeline,
  getPlanState, getBriefing, assessOpportunityAgainstPlan,
  getFundingGoal, setFundingGoal, updateGoalPurposes, recommendMix,
  checkResearchedFunder, cacheResearchedFunder, flagForVerification,
  isEntitled,
  type ToolContext, type ToolResult, type Tier,
} from '../tools'

type AnyToolFn = (ctx: ToolContext, params: Record<string, unknown>) => Promise<ToolResult<unknown>>

const DISPATCH: Record<string, AnyToolFn> = {
  add_to_pipeline: addToPipeline as AnyToolFn,
  update_pipeline_item: updatePipelineItem as AnyToolFn,
  get_pipeline: getPipeline as AnyToolFn,
  get_plan_state: getPlanState as AnyToolFn,
  get_briefing: getBriefing as AnyToolFn,
  assess_opportunity_against_plan: assessOpportunityAgainstPlan as AnyToolFn,
  get_funding_goal: getFundingGoal as AnyToolFn,
  set_funding_goal: setFundingGoal as AnyToolFn,
  update_goal_purposes: updateGoalPurposes as AnyToolFn,
  recommend_mix: recommendMix as AnyToolFn,
  check_researched_funder: checkResearchedFunder as AnyToolFn,
  cache_researched_funder: cacheResearchedFunder as AnyToolFn,
  flag_for_verification: flagForVerification as AnyToolFn,
}

export interface AnthropicToolDef {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/** The tool definitions offered to the model for this tier: built, entitled,
 *  and carrying a canonical schema. (Entitlement is ALSO enforced inside the
 *  envelope on every call — this filter just avoids offering tools that would
 *  only ever error.) researchOnly entries (research agent v1, spec §4) are
 *  additionally gated on the caller passing research: true — a research
 *  thread's turn only, never the briefing generation path or the standard
 *  drawer. */
export function toolDefsForTier(tier: Tier, opts: { research?: boolean } = {}): AnthropicToolDef[] {
  return TOOL_REGISTRY
    .filter(t => t.status === 'built' && t.input_schema && isEntitled(tier, t.name) && (!t.researchOnly || opts.research))
    .map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema! }))
}

export function dispatchTool(
  ctx: ToolContext,
  name: string,
  params: Record<string, unknown>,
): Promise<ToolResult<unknown>> {
  const fn = DISPATCH[name]
  if (!fn) throw new Error(`Unknown tool '${name}'.`)
  return fn(ctx, params)
}
