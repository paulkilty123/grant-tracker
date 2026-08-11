import { TRACKED_FIELDS, trustOf, type FieldProvenance, type ProvenanceEntry } from '@/lib/grant-merge'

/**
 * Shared types and rules for triaging match_feedback into the review queue.
 *
 * A flag says "this grant is wrong for me", which is not the same as "this row
 * is wrong". Charlotte's Buttle UK flag is the worked example: she reported they
 * do not work with children, and the row correctly lists children and young
 * people, and also correctly lists homeless, which is very likely why a
 * homelessness charity matched at all. Editing that row would damage an accurate
 * one. So every flag is classified before anything is written.
 */

export const TRIAGE_CLASSES = ['catalogue_gap', 'match_precision', 'taxonomy_gap'] as const
export type TriageClass = typeof TRIAGE_CLASSES[number]

export const RESOLUTIONS = ['applied', 'rejected', 'superseded'] as const
export type Resolution = typeof RESOLUTIONS[number]

export const TRIAGE_CLASS_LABEL: Record<TriageClass, string> = {
  catalogue_gap:   'Catalogue gap',
  match_precision: 'Match precision',
  taxonomy_gap:    'Taxonomy gap',
}

export const TRIAGE_CLASS_HELP: Record<TriageClass, string> = {
  catalogue_gap:   'A field on this row is missing or wrong, and can be corrected.',
  match_precision: 'The row is accurate. The match was wrong. Recorded only, nothing is written.',
  taxonomy_gap:    'The row is defensible. Our taxonomy cannot express the distinction.',
}

/**
 * The only fields a feedback correction may write.
 *
 * A deliberate subset of TRACKED_FIELDS. Feedback is evidence about who a funder
 * will fund and when, so it can correct eligibility and timing. It is not
 * evidence about a funder's brief, title, URL or award amounts, and letting an
 * accept write those would turn a one-line flag into an unbounded edit.
 */
export const CORRECTABLE_FIELDS = [
  'max_org_income',
  'min_org_income',
  'is_invite_only',
  'eligible_structures',
  'location_tag',
  'is_local',
  'deadline',
  'is_rolling',
  'next_open_date',
  'impact_sectors',
  'target_beneficiaries',
] as const
export type CorrectableField = typeof CORRECTABLE_FIELDS[number]

export function isCorrectableField(field: string): field is CorrectableField {
  return (CORRECTABLE_FIELDS as readonly string[]).includes(field)
}

// Every correctable field must be tracked, or the write would bypass the merger
// and its trust ladder entirely. Asserted at module load rather than in a test,
// so a future edit to either list fails immediately and loudly.
for (const f of CORRECTABLE_FIELDS) {
  if (!(TRACKED_FIELDS as readonly string[]).includes(f)) {
    throw new Error(`CORRECTABLE_FIELDS contains "${f}", which is not a TRACKED_FIELD`)
  }
}

/**
 * Classes that write nothing to the grant, so the reviewer's note is the only
 * record of the decision. The API requires a note for these.
 */
export const CLASSES_REQUIRING_NOTE: readonly TriageClass[] = ['match_precision', 'taxonomy_gap']

export function noteRequiredFor(cls: TriageClass): boolean {
  return CLASSES_REQUIRING_NOTE.includes(cls)
}

/** Provenance marker written when a flag routes a grant into the review queue. */
export const FEEDBACK_QUEUE_SOURCE = 'system:user_feedback:v1'

/** Source used for a correction accepted from a flag. See the user_verified tier. */
export function acceptSource(flagId: string): string {
  return `user_verified:feedback-${flagId}`
}

// ── Pin detection ────────────────────────────────────────────────────────────

export type FieldPin = {
  field:      string
  source:     string
  set_at:     string | null
  /** Effective trust after the backfilled adjustment, i.e. what a write competes with. */
  trust:      number
  /** True when this pin would reject a user_verified (70) write outright. */
  blocks:     boolean
}

/**
 * Pins on the fields a correction could target.
 *
 * Surfaced in the triage UI so an admin knows before accepting that a field is
 * frozen, rather than after, when the merger has silently refused the write.
 * Most of these come from Grant Manager saving whole form state (see
 * docs/known-issues.md), not from a deliberate per-field decision.
 */
export function pinsOnCorrectableFields(provenance: FieldProvenance | null | undefined): FieldPin[] {
  if (!provenance) return []
  const pins: FieldPin[] = []
  for (const field of CORRECTABLE_FIELDS) {
    const entry = provenance[field] as ProvenanceEntry | undefined
    if (!entry) continue
    const trust = trustOf(entry.source, entry.backfilled)
    // A pin blocks anything that is not an admin: source. A high-trust unpinned
    // value blocks too, if it outranks user_verified.
    const blocked = entry.pinned === true || trust > USER_VERIFIED_TRUST
    if (!blocked) continue
    pins.push({
      field,
      source: entry.source,
      set_at: entry.set_at ?? null,
      trust,
      blocks: true,
    })
  }
  return pins
}

/** Kept in step with TRUST_BY_TYPE.user_verified in grant-merge.ts. */
export const USER_VERIFIED_TRUST = 70

// ── Flag → UI shape ──────────────────────────────────────────────────────────

export type TriageGrant = {
  id:                   string
  title:                string | null
  funder:               string | null
  is_active:            boolean
  pipeline_state:       string | null
  max_org_income:       number | null
  min_org_income:       number | null
  is_invite_only:       boolean | null
  eligible_structures:  string[] | null
  location_tag:         string | null
  is_local:             boolean | null
  deadline:             string | null
  is_rolling:           boolean | null
  next_open_date:       string | null
  impact_sectors:       string[] | null
  target_beneficiaries: string[] | null
  apply_url:            string | null
}

export type TriageFlag = {
  id:                  string
  created_at:          string
  direction:           'up' | 'down'
  reasons:             string[]
  free_text:           string | null
  match_score_at_time: number
  /** Name of the organisation that raised it, for context. Never the user's email. */
  org_name:            string | null
  /** Null when the flag's grant_id resolves to nothing, or to more than one row. */
  grant:               TriageGrant | null
  unresolved:          'not_found' | 'ambiguous' | null
  pins:                FieldPin[]
  /** Populated once triaged, so a decision can be read back. */
  reviewer_note?:      string | null
  reviewed_at?:        string | null
  resolution?:         Resolution | null
  triage_class?:       TriageClass | null
}
