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
// ⚠️ RULEBOOK STATUS: DRAFT. The mappings and reasoning lines below are a
// structural placeholder awaiting Paul's line-by-line rulebook review session
// (spec §9) — that session is a SHIP GATE for this tool, not a nicety. The
// version string moves off "-draft" only when the review has happened.

import { defineTool } from './envelope'
import { emitEvent } from '../../events/emit'
import { getPurposes } from './repository'
import { PURPOSE_CATEGORIES, type PurposeCategory, type PurposeInput } from './goal'
import { CONTRACT } from '../contract'

export const RULEBOOK_VERSION = 'mix-rules-v0.1-draft'

export type MixCharacter = 'unrestricted' | 'project' | 'capital' | 'investment'

interface Rule {
  mapping: Partial<Record<MixCharacter, number>> // percentages, sum 100
  reasoning: string
}

// DRAFT — every line below is reviewed by Paul before ship (spec §9).
const RULEBOOK: Partial<Record<PurposeCategory, Rule>> = {
  core: {
    mapping: { unrestricted: 100 },
    reasoning: 'Core running costs point at unrestricted funders — harder to win, but each award covers months of running costs rather than one activity.',
  },
  programme: {
    mapping: { project: 85, unrestricted: 15 },
    reasoning: 'Programme delivery maps to project funding, with a slice of unrestricted to keep overhead recovery honest.',
  },
  staffing: {
    mapping: { unrestricted: 50, project: 50 },
    reasoning: 'Posts split by what the role serves: delivery posts sit in project budgets; organisational posts need unrestricted income.',
  },
  capital: {
    mapping: { capital: 100 },
    reasoning: 'Equipment and building costs sit with capital funders — a distinct funder population from revenue grants.',
  },
  capacity: {
    mapping: { project: 70, unrestricted: 30 },
    reasoning: 'Capacity building is fundable as a defined project by infrastructure funders; some support it through unrestricted grants.',
  },
  working_capital: {
    mapping: { investment: 100 },
    reasoning: 'Working capital ahead of contracted income is repayable-finance territory: describe the landscape and signpost readiness support; the decision to borrow is never advice this tool or its caller gives.',
  },
  // 'other' has no rule — deliberate: it is the fallback channel.
}

export interface MixComponent {
  category: string
  label: string
  approx_amount: number | null
  off_rulebook: boolean
  mapping: Partial<Record<MixCharacter, number>> | null
  reasoning: string | null
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
    return { rulebook_version: RULEBOOK_VERSION, status: 'no_purposes', recommended_mix: null, purposes_total: null, components: [], off_rulebook_categories: [] }
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
      components.push({ category: p.category, label: p.label, approx_amount: p.approx_amount ?? null, off_rulebook: true, mapping: null, reasoning: null })
      continue
    }
    const weight = typeof p.approx_amount === 'number' && p.approx_amount > 0 ? p.approx_amount : defaultWeight
    for (const [character, pct] of Object.entries(rule.mapping) as Array<[MixCharacter, number]>) {
      blend.set(character, (blend.get(character) ?? 0) + weight * (pct / 100))
    }
    components.push({ category: p.category, label: p.label, approx_amount: p.approx_amount ?? null, off_rulebook: false, mapping: rule.mapping, reasoning: rule.reasoning })
  }

  const covered = components.filter(c => !c.off_rulebook).length
  const status = covered === 0 ? 'all_fallback' : offRulebook.size > 0 ? 'partial_fallback' : 'rule_derived'
  return {
    rulebook_version: RULEBOOK_VERSION,
    status,
    recommended_mix: covered > 0 ? roundToHundred(blend) : null,
    purposes_total: purposesTotal,
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
  `Derive the recommended funding mix from the purpose split using the deterministic rulebook — the model delivers and explains the recommendation, it never derives it. Rule-derived output is delivered as firm, with the per-component reasoning returned here; any component marked off_rulebook is yours to reason about and MUST be presented explicitly as your judgment, not a standard mapping. Mix vocabulary is funding character (unrestricted, project, capital, investment), never source. A recommendation never silently becomes the plan: confirm it with the user before writing it via set_funding_goal. ${CONTRACT.noRepayableFinance}`
