/**
 * Profile check: reads an organisation's profile the way a funder would and
 * says, in plain words, what is pulling its matches off course.
 *
 * Built 13 to 14 September 2026 from the twelve launch-week signups. Four of
 * the twelve had weak match lists and none of the four was the scorer's fault:
 *
 *   Paws and Pause    tags said mental health and employment, beneficiaries
 *                     said young people, homeless and poverty, mission said
 *                     dog daycare. The list led with youth violence funds.
 *   Redhill Fields    no income band, reach set to international for a
 *                     Nottinghamshire events group. Heritage repair funds.
 *   Bank of Dreams    a film and media tag pulled in BFI and photography.
 *   two sole traders  matched to almost nothing, correctly.
 *
 * Every finding here is one of those shapes, generalised. Rules only, no
 * model call, so it can run at signup, in the weekly email and over the whole
 * account list for nothing. The one thing rules cannot see, a mission that
 * contradicts its tags in words the tag labels do not use, is left to the
 * optional model read in /api/profile/review.
 *
 * Nothing here blocks. A finding is a sentence and an edit the reader can
 * make where they stand; every one can be ignored, and the weekly email keeps
 * asking until it is fixed or dismissed.
 */
import type { Organisation, BeneficiaryGroup } from '@/types'
import { BENEFICIARY_OPTIONS, BENEFICIARY_SYNONYMS, termMatches } from './tag-suggestions'

export type FindingId =
  | 'mission_missing'
  | 'mission_thin'
  | 'income_missing'
  | 'reach_too_wide'
  | 'beneficiaries_too_many'
  | 'beneficiaries_general_only'
  | 'beneficiaries_unmentioned'
  | 'niche_unmentioned'
  | 'niche_missing'
  | 'grant_range_missing'
  | 'structure_individual'

/** What the reader can do about it, on the spot. */
export type FindingAction =
  | { kind: 'edit_mission' }
  | { kind: 'set_income' }
  | { kind: 'set_reach'; suggest: 'local' | 'regional' }
  | { kind: 'remove_beneficiaries'; values: BeneficiaryGroup[] }
  | { kind: 'remove_niche'; values: string[] }
  | { kind: 'add_niche' }
  | { kind: 'set_grant_range' }
  | { kind: 'none' }

export interface ProfileFinding {
  id: FindingId
  /** fix: matches are wrong or missing without it. consider: probably sharper with it. */
  severity: 'fix' | 'consider'
  title: string
  body: string
  action: FindingAction
}

export interface ProfileCheckOptions {
  /** niche tag value → label, from the page's own taxonomy. */
  nicheLabels?: Record<string, string>
  /** How many live funders set an income floor or cap, for the income line. */
  incomeGatedFunders?: number | null
  /** Findings the caller has no use for: the wizard drops grant_range_missing because it asked one screen earlier. */
  skip?: FindingId[]
}

const MISSION_THIN_CHARS = 80
const MAX_BENEFICIARIES = 3  // more than this and the mission has to earn each one

/** UK place words a mission uses when it is local. Deliberately coarse. */
const LOCAL_WORDS = [
  'local', 'borough', 'county', 'town', 'village', 'parish', 'district', 'neighbourhood', 'estate', 'community in',
  'across dorset', 'across london', 'in london', 'in wales', 'in scotland', 'in yorkshire',
]

const INDIVIDUAL_STRUCTURES = new Set(['sole_trader', 'individual', 'partnership'])

function words(label: string): string[] {
  return label.toLowerCase().replace(/[&/]/g, ' ').split(/[\s,]+/).filter(w => w.length > 3 && !['communities', 'community', 'support', 'people', 'other'].includes(w))
}

/** True when any word of the label, or a synonym, appears in the mission. */
function mentioned(mission: string, label: string, synonyms: string[] = []): boolean {
  const terms = [label.toLowerCase(), ...synonyms, ...words(label)]
  return terms.some(t => t.length > 3 && termMatches(mission, t))
}

export function checkProfile(org: Organisation, opts: ProfileCheckOptions = {}): ProfileFinding[] {
  const out: ProfileFinding[] = []
  const mission = (org.mission ?? '').trim()
  const missionLower = mission.toLowerCase()
  const bens = (org.beneficiary_groups ?? []) as BeneficiaryGroup[]
  const niche = org.niche_tags ?? []
  const labels = opts.nicheLabels ?? {}

  // ── Structure first: an individual is not what the catalogue is for ─────
  if (org.legal_structure && INDIVIDUAL_STRUCTURES.has(org.legal_structure)) {
    out.push({
      id: 'structure_individual', severity: 'fix',
      title: 'Almost no funder here gives to individuals',
      body: 'The catalogue is built for charities, CICs and social enterprises. As a sole trader you will see only the handful open to individuals. If you are applying on behalf of a constituted group, set the profile up as that group instead.',
      action: { kind: 'none' },
    })
  }

  // ── Mission: what funders read first ────────────────────────────────────
  if (!mission) {
    out.push({
      id: 'mission_missing', severity: 'fix',
      title: 'Add a mission, it is what we read first',
      body: 'Two or three sentences on who you help and how. Without it we match on tags alone, and tags cannot tell a supported employment project from a business that happens to employ people.',
      action: { kind: 'edit_mission' },
    })
  } else if (mission.length < MISSION_THIN_CHARS) {
    out.push({
      id: 'mission_thin', severity: 'consider',
      title: 'Your mission is one line. Funders read it as the whole story',
      body: `"${mission}" is all a funder would see. Say who you help, what changes for them and where. The more specific it is, the fewer wrong matches you get.`,
      action: { kind: 'edit_mission' },
    })
  }

  // ── Income: a hard gate on a lot of funders ─────────────────────────────
  if (!org.annual_income_band) {
    const n = opts.incomeGatedFunders
    out.push({
      id: 'income_missing', severity: 'fix',
      title: n ? `${n} funders need to know your annual income` : 'Funders need to know your annual income',
      body: 'Many funders set an income floor or cap. Without your band we cannot put you forward for any of them, and the ones that are open to you cannot be told apart from the ones that are not.',
      action: { kind: 'set_income' },
    })
  }

  // ── Reach wider than the mission ────────────────────────────────────────
  const reach = org.geographic_reach
  if ((reach === 'international' || reach === 'national') && mission) {
    const readsLocal = LOCAL_WORDS.some(w => missionLower.includes(w))
      || (org.primary_location ? missionLower.includes(org.primary_location.split(',')[0].trim().toLowerCase()) : false)
    if (readsLocal) {
      out.push({
        id: 'reach_too_wide', severity: 'fix',
        title: `Your reach is set to ${reach}, but your mission reads local`,
        body: `That tells us to look past the funders that give in and around ${org.primary_location ? org.primary_location.split(',')[0].trim() : 'your area'}, which are the ones most likely to say yes to a group like yours. Regional or local suits better unless you deliver across the country.`,
        action: { kind: 'set_reach', suggest: reach === 'international' ? 'regional' : 'regional' },
      })
    }
  }

  // ── Beneficiaries: too many, or only "everyone", or not in the mission ──
  // The wizard allows a primary plus three, so four groups is its own maximum
  // and cannot be wrong by itself: 21 of 44 live profiles carry four. It is a
  // fix only when the mission supports at most one of them (Paws and Pause:
  // none of four), and a consider when it supports at least two.
  if (bens.length > MAX_BENEFICIARIES && mission) {
    const unmentioned = bens.filter(b => {
      const opt = BENEFICIARY_OPTIONS.find(o => o.value === b)
      return opt && b !== 'general_public' && !mentioned(missionLower, opt.label, BENEFICIARY_SYNONYMS[b] ?? [])
    })
    if (unmentioned.length) {
      const names = unmentioned.map(b => BENEFICIARY_OPTIONS.find(o => o.value === b)?.label ?? b)
      out.push({
        id: 'beneficiaries_too_many', severity: bens.length - unmentioned.length <= 1 ? 'fix' : 'consider',
        title: `${bens.length} beneficiary groups is pulling in funders for people you do not mention`,
        body: `Your mission does not mention ${list(names)}. Each group you tick brings in every funder for that group, so the list fills with funds for work you do not do. Keep the groups your mission names.`,
        action: { kind: 'remove_beneficiaries', values: unmentioned },
      })
    }
  } else if (bens.length > 1 && mission) {
    const unmentioned = bens.filter(b => {
      const opt = BENEFICIARY_OPTIONS.find(o => o.value === b)
      return opt && b !== 'general_public' && !mentioned(missionLower, opt.label, BENEFICIARY_SYNONYMS[b] ?? [])
    })
    if (unmentioned.length && unmentioned.length < bens.length) {
      const names = unmentioned.map(b => BENEFICIARY_OPTIONS.find(o => o.value === b)?.label ?? b)
      out.push({
        id: 'beneficiaries_unmentioned', severity: 'consider',
        title: `Your mission does not mention ${list(names)}`,
        body: 'If they are a real part of your work, add a line about them to the mission. If not, untick them and the funders for that group drop out of your list.',
        action: { kind: 'remove_beneficiaries', values: unmentioned },
      })
    }
  }
  if (bens.length === 1 && bens[0] === 'general_public') {
    out.push({
      id: 'beneficiaries_general_only', severity: 'consider',
      title: 'Who, specifically, does your work help?',
      body: '"General public" on its own matches nobody in particular. Most funders name a group. If your work reaches older people, families or a particular community, say so and those funders open up.',
      action: { kind: 'none' },
    })
  }

  // ── Niche tags the mission never mentions ───────────────────────────────
  if (niche.length && mission.length >= MISSION_THIN_CHARS && Object.keys(labels).length) {
    const unmentioned = niche.filter(t => labels[t] && !mentioned(missionLower, labels[t]))
    // Only worth saying when it is a minority of the tags: a mission that
    // mentions none of them is a thin mission, reported above.
    if (unmentioned.length && unmentioned.length <= Math.max(1, Math.floor(niche.length / 2))) {
      const names = unmentioned.map(t => labels[t])
      out.push({
        id: 'niche_unmentioned', severity: 'consider',
        title: `${list(names)}: is that really your work?`,
        body: `Your mission does not mention ${unmentioned.length === 1 ? 'it' : 'them'}. A specialism tag brings in every funder for that specialism, so a tag that is only sometimes true costs more than it gains.`,
        action: { kind: 'remove_niche', values: unmentioned },
      })
    }
  }
  if (!niche.length && (org.impact_sectors ?? []).length) {
    out.push({
      id: 'niche_missing', severity: 'consider',
      title: 'Get more specific about your work',
      body: 'Funders often fund something narrower than a whole sector. Two or three specialisms cut the irrelevant matches without losing the relevant ones.',
      action: { kind: 'add_niche' },
    })
  }

  // ── Grant range ─────────────────────────────────────────────────────────
  if (org.min_grant_target == null && org.max_grant_target == null) {
    out.push({
      id: 'grant_range_missing', severity: 'consider',
      title: 'How much are you looking for?',
      body: 'Without a range we show £500 grants and £500,000 grants in the same list. Tell us the range you can use and we drop the rest.',
      action: { kind: 'set_grant_range' },
    })
  }

  const skip = new Set(opts.skip ?? [])
  return out.filter(f => !skip.has(f.id))
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The one finding worth an email nudge: the first fix, else the first consider. */
export function topFinding(findings: ProfileFinding[]): ProfileFinding | null {
  return findings.find(f => f.severity === 'fix') ?? findings[0] ?? null
}
