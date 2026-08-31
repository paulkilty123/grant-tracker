import type { Organisation } from '@/types'

/**
 * Profile completeness — the single ranking, shared by the profile page and the
 * weekly digest.
 *
 * This lived inside `dashboard/profile/page.tsx` until 2026-08-31, which meant
 * the digest could not read it: a Next page file may not export anything beyond
 * the page and its route config, so there was no way to import it without
 * breaking the build. The alternative was a second ranking in the digest, and
 * two rankings drift — the same reasoning that put `eligibility-disclosure.ts`
 * in one place.
 *
 * The profile page says WHAT is missing. The digest says what it COSTS, which
 * is the part a page cannot say — "Annual income: missing" is a status,
 * "Nine funders need to know your annual income" is a reason to act.
 */

export type ProfileCardId = 'about' | 'focus' | 'location' | 'funding' | 'story'

export type ProfileFieldLabel =
  | 'Legal structure'
  | 'Impact sector'
  | 'Who you serve'
  | 'Location'
  | 'Annual income'
  | 'Grant size range'
  | 'Specialisms'
  | 'Mission statement'

export interface MissingField {
  label: ProfileFieldLabel
  impact: 'high' | 'medium'
}

export interface CompletenessResult {
  pct: number
  missing: MissingField[]
}

/** Where each field is edited, for jump-to-card and for the digest's button. */
export const FIELD_TO_CARD: Record<ProfileFieldLabel, ProfileCardId> = {
  'Impact sector':     'focus',
  'Who you serve':     'focus',
  'Specialisms':       'focus',   // niche tags live in the focus/sectors editor
  'Location':          'location',
  'Legal structure':   'about',
  'Annual income':     'about',
  'Grant size range':  'funding',
  'Mission statement': 'story',
}

export function computeCompleteness(org: Organisation): CompletenessResult {
  const fields: { label: ProfileFieldLabel; filled: boolean; impact: 'high' | 'medium' }[] = [
    { label: 'Impact sector',    filled: (org.impact_sectors?.length ?? 0) > 0,             impact: 'high'   },
    { label: 'Who you serve',    filled: (org.beneficiary_groups?.length ?? 0) > 0,          impact: 'high'   },
    { label: 'Location',         filled: !!org.primary_location,                             impact: 'high'   },
    { label: 'Legal structure',  filled: !!org.legal_structure,                              impact: 'high'   },
    { label: 'Specialisms',      filled: (org.niche_tags?.length ?? 0) > 0,                  impact: 'medium' },
    { label: 'Annual income',    filled: !!org.annual_income_band,                           impact: 'medium' },
    { label: 'Grant size range', filled: !!(org.min_grant_target || org.max_grant_target),   impact: 'medium' },
    { label: 'Mission statement',filled: !!org.mission,                                      impact: 'medium' },
  ]
  const filledCount = fields.filter(f => f.filled).length
  const pct = Math.round((filledCount / fields.length) * 100)
  const missing = fields.filter(f => !f.filled).map(({ label, impact }) => ({ label, impact }))
  return { pct, missing }
}

/* ───────────────────────────────────────────────────────────────────────────
   The digest's half: what each gap actually costs.
   ─────────────────────────────────────────────────────────────────────────── */

export interface ProfilePrompt {
  field:  ProfileFieldLabel
  /** Headline. Names the thing before the reason — see spec §5b. */
  title:  string
  /** One idea per sentence. No "field", no "band", no "unlock". */
  body:   string
  /** Button label. Says the thing in the reader's words, not ours. */
  cta:    string
  card:   ProfileCardId
  /**
   * True where the copy above reads naturally with a real count spliced in.
   * Only `Annual income` does today. The count must come from a real query or
   * the prompt ships without one — an invented figure on a product that sells
   * verified data is the worst possible place to guess (spec §4b).
   */
  countable: boolean
}

/**
 * Priority order, highest consequence first.
 *
 * Legal structure leads whenever it is missing, ahead of the other three
 * `high` fields. Every other gap DEGRADES matching; this one GATES it — it is
 * the only field where the honest answer is "we cannot tell you anything
 * reliable", and it is what makes "Who can apply" read "not fully stated" on
 * the public pages. Filling it improves what that organisation sees everywhere
 * at once.
 */
export const PROFILE_PROMPTS: ProfilePrompt[] = [
  {
    field: 'Legal structure',
    title: 'Funders need to know what kind of organisation you are',
    body:  'Most funders only accept certain legal structures. Without yours we can’t tell you what you’re eligible for, and we’d rather say nothing than guess.',
    cta:   'Add your legal structure',
    card:  'about',
    countable: false,
  },
  {
    field: 'Impact sector',
    title: 'Tell us what you work on',
    body:  'Sector is the biggest single thing we match on. Without it we’re matching on your location and not much else.',
    cta:   'Add what you work on',
    card:  'focus',
    countable: false,
  },
  {
    field: 'Who you serve',
    title: 'Who does your work help?',
    body:  'A lot of funders only fund work with specific groups. Without yours, we can’t put you forward for any of them.',
    cta:   'Add who you serve',
    card:  'focus',
    countable: false,
  },
  {
    field: 'Location',
    title: 'Where do you work?',
    body:  'Most funders have a geographic limit. Without yours we can only show you the ones open UK-wide.',
    cta:   'Add where you work',
    card:  'location',
    countable: false,
  },
  {
    field: 'Annual income',
    title: 'Funders need to know your annual income',
    body:  'We can’t match you to funders who set an income limit, and open ones do.',
    cta:   'Add your annual income',
    card:  'about',
    countable: true,
  },
  {
    field: 'Grant size range',
    title: 'How much are you looking for?',
    body:  'We’re showing you £500 grants and £500,000 grants in the same list. Tell us the range you can use and we’ll drop the rest.',
    cta:   'Add the range you need',
    card:  'funding',
    countable: false,
  },
  {
    field: 'Specialisms',
    title: 'Get more specific about your work',
    body:  'Funders often fund something narrower than a whole sector. The more specific you are, the fewer irrelevant matches you get.',
    cta:   'Add your specialisms',
    card:  'focus',
    countable: false,
  },
  {
    field: 'Mission statement',
    title: 'Add your mission',
    body:  'We read it when matching, and it’s the fastest way to pick up work that doesn’t sit neatly in one sector.',
    cta:   'Add your mission',
    card:  'story',
    countable: false,
  },
]

/**
 * The one prompt this digest should carry, or null if the profile is complete.
 *
 * One per email, never a list: four gaps is a chore, one is a task.
 * `exclude` carries the fields already prompted recently — the caller passes
 * what `digest_sent_items` remembers, so a prompt stops after two ignores
 * rather than becoming furniture.
 */
export function pickProfilePrompt(
  org: Organisation,
  exclude: ProfileFieldLabel[] = [],
): ProfilePrompt | null {
  const missing = new Set(computeCompleteness(org).missing.map(m => m.label))
  const skip = new Set(exclude)
  return PROFILE_PROMPTS.find(p => missing.has(p.field) && !skip.has(p.field)) ?? null
}

/**
 * The income prompt's headline, with a real count if one was computed.
 *
 * Falls back to the countless wording rather than inventing a number. Kept
 * beside the copy so the two cannot drift apart.
 */
export function promptTitleWithCount(prompt: ProfilePrompt, count: number | null): string {
  if (!prompt.countable || count == null || count <= 0) return prompt.title
  if (prompt.field === 'Annual income') {
    return `${count} funder${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} to know your annual income`
  }
  return prompt.title
}
