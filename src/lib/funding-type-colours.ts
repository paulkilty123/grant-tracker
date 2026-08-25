/**
 * The four funding-type colours, defined once.
 *
 * These same four categories were wearing THREE different palettes: the
 * dashboard's set, the search page's pills, and the search page's type cards.
 * Grants alone were ΔE 23.1 apart between two of them — far enough that they
 * read as different categories rather than one category styled twice.
 *
 * Validated as a CATEGORICAL set: every pair is separated well clear of the
 * floor and every hue clears 3:1 against a white card, so the set survives
 * being re-sorted or shown in any order. Do not lighten them back toward the
 * old pastels — that is what failed. And do not add a fifth without re-running
 * the whole set: these were validated against each other, so moving one moves
 * every pair it belongs to.
 *
 * `accelerator` and `blended_finance` are deliberately absent. The pool is
 * filtered by CANONICAL_TYPES before any of this runs, so they never arrive.
 */
export type FundingTypeKey = 'grant' | 'programme' | 'investment' | 'in_kind'

export interface TypeColour {
  /** Display label. Sentence case, so "In-kind" not "In-Kind". */
  label: string
  /** Saturated hue: rails, bar segments, tab dots. */
  rail: string
  /** Tint: chip and panel backgrounds. */
  tint: string
  /** Foreground on the tint, and on white. */
  fg: string
}

export const FUNDING_TYPE_COLOUR: Record<FundingTypeKey, TypeColour> = {
  grant:      { label: 'Grant',      rail: '#22874C', tint: '#E4F1EA', fg: '#1B6B3D' },
  programme:  { label: 'Programme',  rail: '#94402A', tint: '#F2E8E5', fg: '#7A331F' },
  investment: { label: 'Investment', rail: '#3C79AC', tint: '#E8EFF5', fg: '#2A5A85' },
  in_kind:    { label: 'In-kind',    rail: '#B08A20', tint: '#F6EFD9', fg: '#7A5E11' },
}

/** Neutral for the "all" scope, and for a row whose type is unknown. */
export const TYPE_NEUTRAL: TypeColour = { label: 'All', rail: '#1D3C3E', tint: '#F0EDE2', fg: '#1D3C3E' }

export function typeColour(key: string | null | undefined): TypeColour | null {
  if (!key) return null
  return FUNDING_TYPE_COLOUR[key as FundingTypeKey] ?? null
}
