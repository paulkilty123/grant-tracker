// Goal agent tool layer — the canonical registry.
//
// This is the one interface to the agent's data and state, callable identically
// by the in-app orchestrator and (later) an external MCP client. The `description`
// on each entry is the CANONICAL statement of what the tool does and how a model
// should use it — it is the only steering the MCP surface gets, and the in-app
// reason.ts prompt is assembled to agree with it (never contradict it).
//
// Status: ✅ built through the full envelope · ○ designed, implementation pending.

import { addToPipeline, updatePipelineItem, getPipeline } from './pipeline'
import { getPlanState, getBriefing } from './plan'
import { assessOpportunityAgainstPlan } from './assess'
import { getFundingGoal, setFundingGoal, updateGoalPurposes, PURPOSE_CATEGORIES } from './goal'
import { recommendMix, RECOMMEND_MIX_DESCRIPTION } from './mix'
import { CONTRACT } from '../contract'

export { addToPipeline, updatePipelineItem, getPipeline, getPlanState, getBriefing, assessOpportunityAgainstPlan, getFundingGoal, setFundingGoal, updateGoalPurposes, recommendMix }

const PURPOSE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: [...PURPOSE_CATEGORIES], description: 'Purpose category. Use "other" only when nothing fits — it routes to your own labelled judgment via recommend_mix.' },
    label: { type: 'string', description: 'Short free-text label, e.g. "Minibus appeal", "Youth worker post".' },
    approx_amount: { type: 'number', description: 'Approximate whole pounds. Roughness is fine — omit if the user genuinely does not know.' },
  },
  required: ['category', 'label'],
}
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
  /** Canonical machine-readable param schema (JSON Schema). The in-app
   *  orchestrator builds its Anthropic tool definitions from this verbatim;
   *  the MCP route's zod schemas must agree with it (deriving them from this
   *  is a logged follow-on — MCP changes are out of orchestrator v1 scope). */
  input_schema?: Record<string, unknown>
}

const STAGES = ['identified', 'applying', 'submitted', 'won', 'declined']

// Descriptions double as MCP system-prompt steering (separate wordsmithing later).
export const TOOL_REGISTRY: ToolSpecEntry[] = [
  {
    name: 'add_to_pipeline',
    tier: 'apply',
    status: 'built',
    params: 'grant_name, funder_name?, opportunity_id?, stage?, amount_requested?, deadline?, grant_url?, source_recommendation_id?',
    description: `Record an opportunity in the organisation's pipeline so it can be tracked and counted against the plan. ${CONTRACT.scaffoldNotGhostwriter}`,
    input_schema: {
      type: 'object',
      properties: {
        grant_name: { type: 'string', description: 'Name of the grant or opportunity.' },
        funder_name: { type: 'string', description: 'Funder name, if known.' },
        opportunity_id: { type: 'string', description: 'Catalogue UUID when the opportunity came from the catalogue (e.g. a get_briefing candidate).' },
        stage: { type: 'string', enum: STAGES, description: "Defaults to 'identified'." },
        amount_requested: { type: 'number', description: 'Whole pounds.' },
        deadline: { type: 'string', description: 'ISO date (YYYY-MM-DD).' },
        grant_url: { type: 'string' },
      },
      required: ['grant_name'],
    },
  },
  {
    name: 'update_pipeline_item',
    tier: 'apply',
    status: 'built',
    params: 'pipeline_item_id, stage?, amount_requested?, deadline?, outcome_date?, outcome_notes?',
    description: `Update a pipeline item's stage, amounts, deadline, or outcome. Moving to won/declined records the outcome, which feeds the plan arithmetic and the audit log. Outcome notes are short scaffold, not application prose.`,
    input_schema: {
      type: 'object',
      properties: {
        pipeline_item_id: { type: 'string', description: 'The pipeline item UUID (returned by add_to_pipeline).' },
        stage: { type: 'string', enum: STAGES },
        amount_requested: { type: 'number', description: 'Whole pounds.' },
        deadline: { type: 'string', description: 'ISO date (YYYY-MM-DD).' },
        outcome_date: { type: 'string', description: 'ISO date, when moving to won/declined.' },
        outcome_notes: { type: 'string', description: 'Short scaffold note, not application prose.' },
      },
      required: ['pipeline_item_id'],
    },
  },
  {
    name: 'get_pipeline',
    tier: 'apply',
    status: 'built',
    params: '(none)',
    description: `Return the organisation's pipeline items with their ids, stages, amounts, deadlines, and outcome dates. Call this to resolve a pipeline_item_id when the user refers to an item by name — recording a win ("mark the X grant won") is update_pipeline_item, and it needs the id this returns.`,
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_plan_state',
    tier: 'companion',
    status: 'built',
    params: 'org_id',
    description: `Return the deterministic plan arithmetic against the goal — secured, in-pipeline (weighted and unweighted), gap, months remaining, required monthly run-rate, and funder/opportunity concentration. Numbers only; ${CONTRACT.neverRestateNumbers} ${CONTRACT.inconsistencyHonesty} With no goal set, returns a short "set a goal to see plan state" payload. Use this only when you need the bare arithmetic; for a strategic briefing with candidates and what has changed, call get_briefing instead.`,
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_briefing',
    tier: 'companion',
    status: 'built',
    params: 'org_id, since?',
    description: `The primary tool for "where do I stand / what should I do next" — assemble the plan state, what has changed since \`since\`, and the top eligibility-checked candidates against the gap, deterministically from existing data. This is the reasoning surface: ${CONTRACT.constraintFirst} ${CONTRACT.factsVsJudgment} ${CONTRACT.inconsistencyHonesty} The payload carries generated_at: ${CONTRACT.refetchStaleBriefing} With no goal set, returns an onboarding payload naming exactly what's needed to build a plan — relay it as-is.`,
    input_schema: {
      type: 'object',
      properties: {
        since: { type: 'string', description: 'ISO timestamp — include what has changed since this moment (e.g. the last briefing).' },
      },
      required: [],
    },
  },
  {
    name: 'assess_opportunity_against_plan',
    tier: 'companion',
    status: 'built',
    params: 'org_id, opportunity_id',
    description: `Return one opportunity's eligibility verdict, match breakdown, and verified fields alongside how it sits against the current gap and mix. You make the sequencing decision from what this returns; it does none of that reasoning itself.`,
    input_schema: {
      type: 'object',
      properties: {
        opportunity_id: { type: 'string', description: 'Catalogue opportunity id (from get_briefing candidates or search).' },
      },
      required: ['opportunity_id'],
    },
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
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_funding_goal',
    tier: 'companion',
    status: 'built',
    params: 'title, target_amount, start_date, end_date, mix_targets?, constraints?, secured_amount?',
    description: `Call this only once the user has stated a funding target and a deadline — never infer or invent them. Sets or replaces the organisation's funding goal; replacing supersedes the prior goal (kept as history, never deleted) and carries active purposes forward unless new ones are given. One active goal per org is a design principle, not a limitation: a side funding project is a purpose (update_goal_purposes), never a second goal. Constraints capture what the org will not take money for. mix_targets should be the CONFIRMED output of recommend_mix (funding-character percentages), or the user's own stated mix. Off-pipeline secured income given here is recorded as a won pipeline item, never a cached figure.`,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short goal title, e.g. "2026/27 operating year".' },
        target_amount: { type: 'number', description: 'Whole pounds. Must come from what the user stated.' },
        start_date: { type: 'string', description: 'ISO date (YYYY-MM-DD).' },
        end_date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Must come from what the user stated.' },
        purposes: {
          type: 'array',
          description: "What the money is for — the purpose split. Structure the user's rough answer; approximate amounts are fine.",
          items: PURPOSE_ITEM_SCHEMA,
        },
        mix_targets: {
          type: 'object',
          description: 'Funding-character percentages, e.g. {"unrestricted": 55, "project": 35, "capital": 10} — the confirmed recommend_mix output, or the mix the user themselves stated.',
          additionalProperties: { type: 'number' },
        },
        constraints: {
          type: 'array',
          description: 'What the org will not take money for, as the user stated it.',
          items: {
            type: 'object',
            properties: { kind: { type: 'string' }, text: { type: 'string' } },
            required: ['kind', 'text'],
          },
        },
        secured_amount: { type: 'number', description: 'Whole pounds already secured OUTSIDE the tracked pipeline (recorded as a won pipeline item with a pre-existing marker). Omit when all wins are already tracked.' },
      },
      required: ['title', 'target_amount', 'start_date', 'end_date'],
    },
  },
  {
    name: 'update_goal_purposes',
    tier: 'companion',
    status: 'built',
    params: 'add?, update?, retire?',
    description: `Add, edit, or retire purpose lines on the ACTIVE goal without replacing it. This is how a side funding project enters the plan ("we're also raising £50k for a minibus" = a new capital purpose) and how the purpose split stays current after setup. Retiring keeps history; nothing is deleted. If the purpose split changes materially, offer to re-run recommend_mix — the mix probably shifts too.`,
    input_schema: {
      type: 'object',
      properties: {
        add: { type: 'array', description: 'New purpose lines.', items: PURPOSE_ITEM_SCHEMA },
        update: {
          type: 'array',
          description: 'Edits to existing purposes by purpose_id (from get_plan_state or a prior write).',
          items: {
            type: 'object',
            properties: {
              purpose_id: { type: 'string' },
              label: { type: 'string' },
              approx_amount: { type: 'number' },
              category: { type: 'string', enum: [...PURPOSE_CATEGORIES] },
            },
            required: ['purpose_id'],
          },
        },
        retire: { type: 'array', description: 'purpose_ids to retire (kept as history).', items: { type: 'string' } },
      },
      required: [],
    },
  },
  {
    name: 'recommend_mix',
    tier: 'companion',
    status: 'built',
    params: 'purposes?',
    description: RECOMMEND_MIX_DESCRIPTION,
    input_schema: {
      type: 'object',
      properties: {
        purposes: {
          type: 'array',
          description: "The purpose split to derive from (during setup, before the goal exists). Omit to use the active goal's stored purposes.",
          items: PURPOSE_ITEM_SCHEMA,
        },
      },
      required: [],
    },
  },
]
