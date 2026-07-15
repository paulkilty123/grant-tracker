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
import { checkResearchedFunder, cacheResearchedFunder, flagForVerification, composeResearchNote } from './research'
import { CONTRACT } from '../contract'

export { addToPipeline, updatePipelineItem, getPipeline, getPlanState, getBriefing, assessOpportunityAgainstPlan, getFundingGoal, setFundingGoal, updateGoalPurposes, recommendMix, checkResearchedFunder, cacheResearchedFunder, flagForVerification, composeResearchNote }
export { PURPOSE_CATEGORIES } from './goal'

const PURPOSE_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: [...PURPOSE_CATEGORIES], description: 'Purpose category. Use "other" only when nothing fits — it routes to your own labelled judgment via recommend_mix.' },
    label: { type: 'string', description: 'Short free-text label, e.g. "Minibus appeal", "Youth worker post".' },
    approx_amount: { type: 'number', description: 'Approximate whole pounds. Roughness is fine — omit if the user genuinely does not know.' },
    refinement: { type: 'string', description: "The user's answer to a recommend_mix clarifying question, e.g. staffing 'delivery post' / 'organisational post', capacity 'finance and fundraising'. Omit until asked and answered." },
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
  /** Research agent v1 (design spec §4): only ever offered to the model on a
   *  research-thread turn (dispatch.ts's toolDefsForTier filters on this) —
   *  never the briefing generation path or the standard drawer. The MCP route
   *  hand-picks its own tool set and never imports these regardless. */
  researchOnly?: boolean
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
        purpose_id: { type: 'string', description: 'Assign to a goal purpose when the opportunity clearly serves one (get_plan_state lists purposes). A nudge, never a requirement.' },
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
        purpose_id: { type: 'string', description: 'Assign this item to a goal purpose (get_plan_state lists purposes); pass null to unassign.' },
      },
      required: ['pipeline_item_id'],
    },
  },
  {
    name: 'get_pipeline',
    tier: 'apply',
    status: 'built',
    params: '(none)',
    description: `Return the organisation's pipeline items with their ids, stages, amounts, deadlines, outcome dates, and short notes (declined items carry their triage reason in notes). Call this to resolve a pipeline_item_id when the user refers to an item by name — recording a win ("mark the X grant won") is update_pipeline_item, and it needs the id this returns.`,
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_plan_state',
    tier: 'companion',
    status: 'built',
    params: 'org_id',
    description: `Return the deterministic plan arithmetic against the goal — secured, in-pipeline (weighted and unweighted), gap, months remaining, required monthly run-rate, and funder/opportunity concentration. When purposes exist it also carries per-purpose progress and the mix composition (pipeline versus target, attributed via purpose assignments); mix.attributable=false means composition could not be derived — never claim a slice is unaddressed in that case. Numbers only; ${CONTRACT.neverRestateNumbers} ${CONTRACT.inconsistencyHonesty} With no goal set, returns a short "set a goal to see plan state" payload. Use this only when you need the bare arithmetic; for a strategic briefing with candidates and what has changed, call get_briefing instead.`,
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
    description: `Return the organisation's active funding goal — target amount, secured-to-date, funding-type mix, and deadline — or null if none is set. Secured is derived from pipeline 'won'; ${CONTRACT.neverRestateNumbers} ${CONTRACT.dateGrounding}`,
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_funding_goal',
    tier: 'companion',
    status: 'built',
    params: 'title, target_amount, start_date, end_date, mix_targets?, constraints?, secured_amount?',
    description: `Call this only once the user has stated a funding target and a deadline — never infer or invent them. Sets or replaces the organisation's funding goal; replacing supersedes the prior goal (kept as history, never deleted) and carries active purposes forward unless new ones are given. If the response's purposes_reconciliation_warning is non-null, the carried-forward or restated purposes do not add up to the new target — say so plainly and ask before proceeding, never treat it as fine. One active goal per org is a design principle, not a limitation: a side funding project is a purpose (update_goal_purposes), never a second goal. Constraints capture what the org will not take money for. Derive any mix from recommend_mix (the deterministic rulebook) rather than inventing one, and never let a recommended mix silently become the plan: present it and get the user's explicit go-ahead in a confirm turn BEFORE writing it here — mix_targets is the CONFIRMED output of recommend_mix (funding-character percentages), or the user's own stated mix. Off-pipeline secured income given here is recorded as a won pipeline item, never a cached figure. When the user gives a relative period ("18 months from today", "by the end of next year"), compute start_date/end_date from as_of on the most recent tool result, never from your own sense of the date. Over an external MCP connection specifically, writing the very FIRST goal for an org (none exists yet) is refused (SetupSurfaceError) — direct the user to sign in at granttracker.co.uk and use the app's guided setup instead; this refusal does not apply once a goal exists, and does not apply to the in-app conversation, where first-time setup proceeds through this tool exactly as normal (gather purposes over several turns, run recommend_mix, confirm, THEN call this). ${CONTRACT.neverRestateNumbers} ${CONTRACT.inconsistencyHonesty} ${CONTRACT.dateGrounding}`,
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
  {
    name: 'check_researched_funder',
    tier: 'companion',
    status: 'built',
    researchOnly: true,
    params: 'funder_name',
    description: `Research agent v1 cost lever: check the shared research cache for this funder before running a live web search. Returns found=false when nothing is cached, or stale=true when the cached profile is older than the freshness window — either way, search live. A found, non-stale result is safe to use directly (still say it is researched, not catalogue data — ${CONTRACT.researchProvenance}).`,
    input_schema: {
      type: 'object',
      properties: {
        funder_name: { type: 'string', description: 'The funder name as you would search for it.' },
      },
      required: ['funder_name'],
    },
  },
  {
    name: 'cache_researched_funder',
    tier: 'companion',
    status: 'built',
    researchOnly: true,
    params: 'funder_name, summary, focus_notes?, source_urls',
    description: `Research agent v1 cost lever: after live research turns up something worth keeping about a funder, save a short summary here so every future thread and org asking about the same funder skips the live search. This is a cost-saving cache, not a user-facing action — call it without asking, once per funder per research session. Keep the summary to a paragraph (what they fund, how to approach, watch-outs); this never writes to the catalogue and is not the verified record.`,
    input_schema: {
      type: 'object',
      properties: {
        funder_name: { type: 'string', description: 'The funder name, as you would want it displayed.' },
        summary: { type: 'string', description: 'A short paragraph: what they fund, how to approach, watch-outs.' },
        focus_notes: { type: 'array', items: { type: 'string' }, description: 'Optional short bullet-style facts, e.g. "rolling deadline", "UK-registered charities only".' },
        source_urls: { type: 'array', items: { type: 'string' }, description: 'The URLs the summary was researched from.' },
      },
      required: ['funder_name', 'summary', 'source_urls'],
    },
  },
  {
    name: 'flag_for_verification',
    tier: 'companion',
    status: 'built',
    researchOnly: true,
    params: 'funder_name, summary, focus_notes?, source_urls',
    description: `Research agent v1 enrichment staging flow: stage a researched-live finding for human catalogue verification. Only ever call this when the user explicitly asks to flag, verify, or add a researched find toward the catalogue — never as a default follow-up to research, and never in place of cache_researched_funder (call that too, or first, regardless). This creates an inactive, unreviewed catalogue entry; it does NOT make the finding usable or add-to-pipeline-eligible, and the user should be told plainly that a human needs to verify it against the funder's own source before it goes live. Never say this means the finding is now "in the catalogue" or "verified" — say it has been staged for review.`,
    input_schema: {
      type: 'object',
      properties: {
        funder_name: { type: 'string', description: 'The funder name, as you would want it displayed.' },
        summary: { type: 'string', description: 'A short paragraph: what they fund, how to approach, watch-outs.' },
        focus_notes: { type: 'array', items: { type: 'string' }, description: 'Optional short bullet-style facts, e.g. "rolling deadline", "UK-registered charities only".' },
        source_urls: { type: 'array', items: { type: 'string' }, description: 'The URLs the summary was researched from — the reviewer checks these against the funder\'s own source before activation.' },
      },
      required: ['funder_name', 'summary', 'source_urls'],
    },
  },
  {
    name: 'compose_research_note',
    tier: 'companion',
    status: 'built',
    researchOnly: true,
    params: 'read, shortlist?, weaker?',
    description: `Research agent v1.1 (compose-then-render): the ONLY way a research-thread reply reaches the user — every substantive response in this thread must end by calling this, never by writing a final answer as plain text. "read" is your honest headline read in 2-4 sentences. "shortlist" lists funds actually worth pursuing, in the order you would prioritise them, each with a short verdict in your own words for THIS question, never a template line. "weaker" holds funds that matched on paper but you are not recommending, each with a one-line reason why not. A "ref" in either list must be an id you already have from a real tool result earlier in THIS turn (a get_briefing candidate's opportunity_id, an assess_opportunity_against_plan opportunity_id, or a cache_researched_funder funder_key) — never invented; an unresolvable ref is silently dropped, never rendered. Empty shortlist and weaker are fine for a purely informational question with nothing to rank.`,
    input_schema: {
      type: 'object',
      properties: {
        read: { type: 'string', description: 'Your headline read, 2-4 sentences, in your own words.' },
        shortlist: {
          type: 'array',
          description: 'Funds worth pursuing, in priority order.',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: 'An opportunity_id or funder_key already seen from a real tool result this turn.' },
              verdict: { type: 'string', description: 'Your own words: why this fund, for this question, now.' },
            },
            required: ['ref', 'verdict'],
          },
        },
        weaker: {
          type: 'array',
          description: 'Funds that matched but are not recommended.',
          items: {
            type: 'object',
            properties: {
              ref: { type: 'string', description: 'An opportunity_id or funder_key already seen from a real tool result this turn.' },
              reason: { type: 'string', description: 'One line: why this does not make the shortlist.' },
            },
            required: ['ref', 'reason'],
          },
        },
      },
      required: ['read'],
    },
  },
]
