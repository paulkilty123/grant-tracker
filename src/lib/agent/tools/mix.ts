// recommend_mix — Layer 1 of the recommendation architecture (design spec §2).
//
// The purpose-to-mix mapping lives HERE as explicit logic, so both surfaces
// produce identical recommendations from identical inputs and the
// recommendation itself cannot be confabulated. The model delivers and
// explains it; it does not derive it.
//
// Layer 2 (labelled model judgment) engages only for purposes the rulebook
// does not cover: those come back marked off_rulebook and every firing is
// logged (mix_fallback_fired), so the rulebook grows from real usage exactly
// as the catalogue does.
//
// Mix vocabulary is FUNDING CHARACTER — unrestricted / project / capital /
// investment — never source (spec §4). Sources (corporate, contracts, trusts)
// are attributes of opportunities within the mix.
//
// RULEBOOK STATUS: v1.0 — reviewed line by line by Paul (markup applied 11 Jul
// 2026; record in docs/goal-agent/mix-rulebook-review.md). The reasoning lines
// are product copy delivered verbatim in the firm register. Changes go through
// the review doc first, then here, with a version bump.

import { defineTool } from './envelope'
import { emitEvent } from '../../events/emit'
import { getPurposes } from './repository'
import { PURPOSE_CATEGORIES, type PurposeCategory, type PurposeInput } from './goal'
import { CONTRACT } from '../contract'

export const RULEBOOK_VERSION = 'mix-rules-v1.0'

export type MixCharacter = 'unrestricted' | 'project' | 'capital' | 'investment'
export const MIX_CHARACTERS: readonly MixCharacter[] = ['unrestricted', 'project', 'capital', 'investment'] as const

interface Rule {
  mapping: Partial<Record<MixCharacter, number>> // percentages, sum 100 (the default when unrefined)
  reasoning: string
  /** Ask-with-refinement (R3/R5): the follow-up the Companion asks when the
   *  purpose carries no refinement. The default mapping stands if skipped. */
  clarify?: string
  /** Sharper mapping derived from a stated refinement; null = keep default. */
  refine?: (refinement: string) => Partial<Record<MixCharacter, number>> | null
  /** Opportunity types worth recommending alongside the mix (R5/R6) — the
   *  right support is often not a grant; the catalogue carries these. */
  opportunityTypes?: string[]
}

const RULEBOOK: Partial<Record<PurposeCategory, Rule>> = {
  // R1 — confirmed v1.0
  core: {
    mapping: { unrestricted: 100 },
    reasoning: 'Core running costs point at unrestricted funders — harder to win, but each award covers months of running costs rather than one activity.',
  },
  // R2 — split lightened to 90/10, reasoning rewritten (full cost recovery)
  programme: {
    mapping: { project: 90, unrestricted: 10 },
    reasoning: "Programme delivery maps to project funding — build full cost recovery into each budget so your overheads are covered within the grant itself; a small unrestricted slice covers what individual funders won't.",
  },
  // R3 — ask-with-refinement: delivery → project, organisational → unrestricted, 50/50 when mixed or skipped
  staffing: {
    mapping: { unrestricted: 50, project: 50 },
    reasoning: 'Posts split by what the role serves: delivery posts sit in project budgets; organisational posts need unrestricted income.',
    clarify: 'Is that a delivery post or an organisational post?',
    refine: (r) => {
      if (/deliver/i.test(r)) return { project: 100 }
      if (/organis|back.?office|admin|ops|central/i.test(r)) return { unrestricted: 100 }
      return null // mixed or unclear → default 50/50
    },
  },
  // R4 — confirmed v1.0
  capital: {
    mapping: { capital: 100 },
    reasoning: 'Equipment and building costs sit with capital funders — a distinct funder population from revenue grants.',
  },
  // R5 — ask-with-refinement + widened landscape: the right support is often not money
  capacity: {
    mapping: { project: 70, unrestricted: 30 },
    reasoning: 'Capacity building is funded through project grants and unrestricted capacity-building grants — and the right support is often not money: organisational-development programmes and in-kind support cover this ground too.',
    clarify: 'Which areas need strengthening — for example finance, digital, governance, fundraising itself?',
    opportunityTypes: ['programme', 'in_kind'],
  },
  // R6 — held on-rulebook, landscape widened; the advice boundary applies verbatim
  working_capital: {
    mapping: { investment: 100 },
    reasoning: 'Working capital ahead of contracted income is repayable-finance territory. The landscape spans social investment, incubator and accelerator programmes (some carry funding), and impact investment (which may or may not take equity) — describe it and signpost; the decision to borrow or give equity is never advice this layer gives.',
    opportunityTypes: ['investment', 'programme'],
  },
  // R8(a) — match funding as a purpose. R8(b), the strategist half (raise match
  // after a recorded win), lives in the orchestrator prompt + the briefing's
  // considerations block, not here.
  match_funding: {
    mapping: { project: 100 },
    reasoning: 'Match funding comes from funders comfortable co-funding alongside a lead award — they match against money already secured, so name the secured grant in the ask; a confirmed win expands what you can credibly request.',
  },
  // R7 'other' has no rule — deliberate: it is the fallback channel.
}

export interface MixComponent {
  category: string
  label: string
  approx_amount: number | null
  off_rulebook: boolean
  mapping: Partial<Record<MixCharacter, number>> | null
  reasoning: string | null
  /** Ask this before finalising the mix; the default mapping stands if the
   *  user skips it. Null when refined or no refinement is needed. */
  clarify: string | null
  /** Opportunity types (programme, in_kind, investment) worth surfacing
   *  alongside grants for this purpose. */
  recommended_opportunity_types: string[] | null
}

export interface RecommendMixPayload {
  rulebook_version: string
  status: 'rule_derived' | 'partial_fallback' | 'all_fallback' | 'no_purposes'
  /** Amount-weighted blend across rule-covered purposes, percentages summing
   *  to 100. Null when nothing was rule-covered. */
  recommended_mix: Partial<Record<MixCharacter, number>> | null
  /** Sum of the stated approximate amounts — so the total is a tool-provided
   *  figure the caller can state verbatim, never its own arithmetic. Null when
   *  no amounts were given. */
  purposes_total: number | null
  /** True only when EVERY rule-covered purpose carries a positive £ amount, so
   *  the mix is genuinely amount-weighted. False ⇒ the blend fell back to equal
   *  weighting; the caller must get the rough £ split before presenting a mix
   *  (F1: never derive proportions from descriptions or a difficulty heuristic). */
  amounts_complete: boolean
  components: MixComponent[]
  off_rulebook_categories: string[]
}

export interface RecommendMixParams extends Record<string, unknown> {
  /** Purpose split from the setup conversation. Omit to use the active goal's
   *  stored purposes. */
  purposes?: PurposeInput[]
}

// Largest-remainder rounding so the mix always presents as integers summing 100.
function roundToHundred(weights: Map<MixCharacter, number>): Partial<Record<MixCharacter, number>> {
  const total = Array.from(weights.values()).reduce((a, b) => a + b, 0)
  if (total <= 0) return {}
  const entries = Array.from(weights.entries()).map(([k, v]) => {
    const exact = (v / total) * 100
    return { k, floor: Math.floor(exact), rem: exact - Math.floor(exact) }
  })
  let leftover = 100 - entries.reduce((s, e) => s + e.floor, 0)
  entries.sort((a, b) => b.rem - a.rem)
  const out: Partial<Record<MixCharacter, number>> = {}
  for (const e of entries) {
    out[e.k] = e.floor + (leftover > 0 ? 1 : 0)
    if (leftover > 0) leftover -= 1
  }
  for (const k of Object.keys(out) as MixCharacter[]) if (out[k] === 0) delete out[k]
  return out
}

export function deriveMix(purposes: PurposeInput[]): RecommendMixPayload {
  if (!purposes.length) {
    return { rulebook_version: RULEBOOK_VERSION, status: 'no_purposes', recommended_mix: null, purposes_total: null, amounts_complete: false, components: [], off_rulebook_categories: [] }
  }
  const known = purposes.map(p => p.approx_amount).filter((a): a is number => typeof a === 'number' && a > 0)
  const purposesTotal = known.length ? Math.round(known.reduce((a, b) => a + b, 0)) : null
  const defaultWeight = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1

  const blend = new Map<MixCharacter, number>()
  const components: MixComponent[] = []
  const offRulebook = new Set<string>()

  for (const p of purposes) {
    const rule = RULEBOOK[p.category]
    if (!rule) {
      offRulebook.add(p.category)
      components.push({ category: p.category, label: p.label, approx_amount: p.approx_amount ?? null, off_rulebook: true, mapping: null, reasoning: null, clarify: null, recommended_opportunity_types: null })
      continue
    }
    const refinement = typeof p.refinement === 'string' ? p.refinement.trim() : ''
    const mapping = (refinement && rule.refine ? rule.refine(refinement) : null) ?? rule.mapping
    const clarify = !refinement && rule.clarify ? rule.clarify : null
    const weight = typeof p.approx_amount === 'number' && p.approx_amount > 0 ? p.approx_amount : defaultWeight
    for (const [character, pct] of Object.entries(mapping) as Array<[MixCharacter, number]>) {
      blend.set(character, (blend.get(character) ?? 0) + weight * (pct / 100))
    }
    components.push({ category: p.category, label: p.label, approx_amount: p.approx_amount ?? null, off_rulebook: false, mapping, reasoning: rule.reasoning, clarify, recommended_opportunity_types: rule.opportunityTypes ?? null })
  }

  const ruleCovered = components.filter(c => !c.off_rulebook)
  const covered = ruleCovered.length
  const status = covered === 0 ? 'all_fallback' : offRulebook.size > 0 ? 'partial_fallback' : 'rule_derived'
  const amountsComplete = covered > 0 && ruleCovered.every(c => typeof c.approx_amount === 'number' && c.approx_amount > 0)
  return {
    rulebook_version: RULEBOOK_VERSION,
    status,
    recommended_mix: covered > 0 ? roundToHundred(blend) : null,
    purposes_total: purposesTotal,
    amounts_complete: amountsComplete,
    components,
    off_rulebook_categories: Array.from(offRulebook),
  }
}

export const recommendMix = defineTool<RecommendMixParams, RecommendMixPayload>({
  name: 'recommend_mix',
  handler: async (ctx, p) => {
    let purposes: PurposeInput[] = p.purposes ?? []
    if (!purposes.length) {
      purposes = (await getPurposes(ctx.orgId)).map(row => ({
        category: (PURPOSE_CATEGORIES.includes(row.category as PurposeCategory) ? row.category : 'other') as PurposeCategory,
        label: row.label,
        approx_amount: row.approx_amount,
        refinement: row.refinement,
      }))
    }
    return deriveMix(purposes)
  },
  logEvent: async (ctx, _p, r) => {
    await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
      'agent_tool_called', { tool_name: 'recommend_mix', result_count: r.components.length, degraded: r.status === 'no_purposes' })
    if (r.off_rulebook_categories.length) {
      await emitEvent({ surface: ctx.surface, orgId: ctx.orgId, userId: ctx.userId },
        'mix_fallback_fired', { categories: r.off_rulebook_categories, rulebook_version: r.rulebook_version })
    }
  },
})

/** Canonical steering for the registry entry — kept beside the rulebook so the
 *  description and the logic move together. */
export const RECOMMEND_MIX_DESCRIPTION =
  `If the org has no funding goal yet, this is first-time setup: over an external MCP connection, direct the user to granttracker.co.uk to set up their goal in the app instead of running the mix conversation here — set_funding_goal will also refuse to write a first goal that way. Once a goal exists, derive the recommended funding mix from the purpose split using the deterministic rulebook — the model delivers and explains the recommendation, it never derives it. The mix is AMOUNT-WEIGHTED: the proportions come only from the rulebook's blend across the purposes' approximate £ amounts. NEVER set the mix from the purposes' descriptions, and NEVER inflate a share on a "harder-to-win-so-weight-it-more" basis — difficulty affects how you sequence the work, not the target proportions. If amounts_complete is false, ask the user for the rough £ split across the purposes on its OWN turn FIRST, then call recommend_mix again with those amounts; do not present a mix built on missing or equal-weighted amounts. When you present the recommendation, itemise every component that makes up each headline share — including the small unrestricted buffer inside programme delivery (it is in that component's mapping) — never state a headline percentage whose parts you cannot show. Rule-derived output is delivered as firm, with the per-component reasoning returned here; any component marked off_rulebook is yours to reason about and MUST be presented explicitly as your judgment, not a standard mapping. A component may carry a clarifying question — ask it on its OWN turn, one question at a time, before finalising (never bundled with the recommendation or a mix preview); the default stands if the user skips it. Components also carry recommended_opportunity_types (programmes, in-kind, investment) worth surfacing alongside grants, because the right support is often not money. Mix vocabulary is funding character (unrestricted, project, capital, investment), never source. Present the recommended mix as prose, one short line per component (character, share, reason) — never a markdown table, some clients render tables raw. A recommendation never silently becomes the plan: confirm it with the user before writing it via set_funding_goal. ${CONTRACT.noRepayableFinance}`
