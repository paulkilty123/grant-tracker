// Goal agent tool layer — the canonical registry.
//
// This is the one interface to the agent's data and state, callable identically
// by the in-app orchestrator and (later) an external MCP client. The `description`
// on each entry is the CANONICAL statement of what the tool does and how a model
// should use it — it is the only steering the MCP surface gets, and the in-app
// reason.ts prompt is assembled to agree with it (never contradict it).
//
// Status: ✅ built through the full envelope · ○ designed, implementation pending.

import { addToPipeline, updatePipelineItem } from './pipeline'
import { getPlanState, getBriefing } from './plan'
import { assessOpportunityAgainstPlan } from './assess'
import { getFundingGoal, setFundingGoal } from './goal'
import { CONTRACT } from '../contract'

export { addToPipeline, updatePipelineItem, getPlanState, getBriefing, assessOpportunityAgainstPlan, getFundingGoal, setFundingGoal }
export { defineTool } from './envelope'
export { requireTool, isEntitled, allowedTools } from './entitlement'
export { assertScaffoldOnly } from './authorship'
export * from './types'

export interface ToolSpecEntry {
  name: string
  tier: 'apply' | 'companion'
  status: 'built' | 'designed'
  params: string
  description: string
}

// Descriptions double as MCP system-prompt steering (separate wordsmithing later).
export const TOOL_REGISTRY: ToolSpecEntry[] = [
  {
    name: 'add_to_pipeline',
    tier: 'apply',
    status: 'built',
    params: 'grant_name, funder_name?, opportunity_id?, stage?, amount_requested?, deadline?, grant_url?, source_recommendation_id?',
    description: `Record an opportunity in the organisation's pipeline so it can be tracked and counted against the plan. Scaffold only — this records the intent to pursue and never any application content. ${CONTRACT.scaffoldNotGhostwriter}`,
  },
  {
    name: 'update_pipeline_item',
    tier: 'apply',
    status: 'built',
    params: 'pipeline_item_id, stage?, amount_requested?, deadline?, outcome_date?, outcome_notes?',
    description: `Update a pipeline item's stage, amounts, deadline, or outcome. Moving to won/declined records the outcome, which feeds the plan arithmetic and the audit log. Outcome notes are short scaffold, not application prose.`,
  },
  {
    name: 'get_plan_state',
    tier: 'companion',
    status: 'built',
    params: 'org_id',
    description: `Return the deterministic plan arithmetic against the goal — secured, in-pipeline (weighted and unweighted), gap, months remaining, required monthly run-rate, and funder/opportunity concentration. Numbers only; ${CONTRACT.neverRestateNumbers} With no goal set, returns a short "set a goal to see plan state" payload.`,
  },
  {
    name: 'get_briefing',
    tier: 'companion',
    status: 'built',
    params: 'org_id, since?',
    description: `Assemble the plan state, what has changed since \`since\`, and the top eligibility-checked candidates against the gap — deterministically, from existing data. This is the reasoning surface: ${CONTRACT.constraintFirst} ${CONTRACT.factsVsJudgment} With no goal set, returns an onboarding payload naming exactly what's needed to build a plan — relay it as-is.`,
  },
  {
    name: 'assess_opportunity_against_plan',
    tier: 'companion',
    status: 'built',
    params: 'org_id, opportunity_id',
    description: `Return one opportunity's eligibility verdict, match breakdown, and verified fields alongside how it sits against the current gap and mix. You make the sequencing decision from what this returns; it does none of that reasoning itself.`,
  },
  {
    name: 'get_org_context',
    tier: 'companion',
    status: 'designed',
    params: 'org_id',
    description: `Return the accumulated org model — structure, income, sectors, beneficiaries, and learned facts (corrections, constraints, relationships, history) — each factual field with its provenance.`,
  },
  {
    name: 'get_funding_goal',
    tier: 'companion',
    status: 'built',
    params: 'org_id',
    description: `Return the organisation's active funding goal — target amount, secured-to-date, funding-type mix, and deadline — or null if none is set. Secured is derived from pipeline 'won'; ${CONTRACT.neverRestateNumbers}`,
  },
  {
    name: 'set_funding_goal',
    tier: 'companion',
    status: 'built',
    params: 'title, target_amount, start_date, end_date, mix_targets?, constraints?, secured_amount?',
    description: `Set or replace the organisation's funding goal. Replacing supersedes the prior goal (kept as history, never deleted). Constraints capture what the org will not take money for; mix_targets are percentages by funding type. Secured-to-date is derived from pipeline 'won' unless stated explicitly.`,
  },
]
