/**
 * field_evidence — when was this field last checked against the funder's page,
 * and what did the page actually say.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT field_provenance
 *
 * `field_provenance` answers "who last WROTE this, and when". That is a
 * different question from "when was this last CHECKED", and they cannot share a
 * column, because `mergeFieldUpdate` treats an unchanged value as `idempotent`
 * and writes nothing. That rule is correct and should stay — confirming a
 * machine got it right is not the same as deciding it must never improve — but
 * it means a verification run that AGREES with the stored value leaves no trace
 * whatsoever. The engine has been computing a `confirmed[]` array every run and
 * throwing it away, because there was nowhere to put it.
 *
 * Until a confirmation is recordable, the publish gate cannot require evidence.
 * That is the whole of why this exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THREE STATES, AND WHY THE THIRD MATTERS
 *
 *   agrees: true    the page states this, and it matches what we hold
 *   agrees: false   the page states something else — a correction is owed
 *   agrees: null    we read the page and it did not address this field
 *
 * A null-agrees stamp is NOT evidence. It carries no quote and must never
 * satisfy a publish gate. It is stored because without it a page that was silent
 * is indistinguishable from a page never read: the engine would re-read the same
 * timing-less rows on every pass forever, and there would be nowhere to record
 * the answer for the 137 rows that carry no timing information at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOT SUBJECT TO THE TRUST LADDER, DELIBERATELY
 *
 * These writes bypass `mergeGrantUpdate`. Recording that a page was read is not
 * a claim about what the value should be, so an `ai_*` check must be able to
 * stamp a field whose VALUE an `admin:` source owns — otherwise the 121
 * admin-pinned amounts and 54 admin-pinned deadlines would be permanently
 * unverifiable, which is the opposite of the point.
 *
 * The stamp records the reading. It never changes the value.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Shape ────────────────────────────────────────────────────────────────────

export type EvidenceStamp = {
  /** The sentence on the page. Null only when `agrees` is null. */
  quote:      string | null
  /** The page this fact came from — per field, not per row, so that a row can
   *  honestly say its dates came from one page and its eligibility from
   *  another once multi-page sourcing lands. */
  source_url: string | null
  /** ISO 8601, UTC. */
  checked_at: string
  /** Who checked. `verify:v1` today. */
  by:         string
  agrees:     boolean | null
}

export type FieldEvidence = Record<string, EvidenceStamp>

/**
 * Fields the engine can stamp.
 *
 * `apply_url` is deliberately absent: its evidence already exists as
 * `url_status` + `url_last_checked`, and a second home for the same fact is a
 * second thing to keep in step. The gate reads those columns for the link and
 * this one for everything else.
 */
export const EVIDENCE_FIELDS = [
  'deadline',
  'is_rolling',
  'max_org_income',
  'is_invite_only',
  'still_listed',
  'is_grant',
] as const

export type EvidenceField = (typeof EVIDENCE_FIELDS)[number]

/** Default freshness window, matching gate policy c3's 90 days. */
export const DEFAULT_MAX_AGE_DAYS = 90

// ── Reading ──────────────────────────────────────────────────────────────────

type AgeOpts = {
  /** Defaults to now. Injected so tests are not time-dependent. */
  asOf?:       Date
  maxAgeDays?: number
}

function stampOf(evidence: FieldEvidence | null | undefined, field: string): EvidenceStamp | null {
  if (!evidence || typeof evidence !== 'object') return null
  const s = (evidence as Record<string, unknown>)[field]
  if (!s || typeof s !== 'object') return null
  const stamp = s as Partial<EvidenceStamp>
  if (typeof stamp.checked_at !== 'string') return null
  return {
    quote:      typeof stamp.quote === 'string' ? stamp.quote : null,
    source_url: typeof stamp.source_url === 'string' ? stamp.source_url : null,
    checked_at: stamp.checked_at,
    by:         typeof stamp.by === 'string' ? stamp.by : 'unknown',
    agrees:     typeof stamp.agrees === 'boolean' ? stamp.agrees : null,
  }
}

/** Days since the field was last checked, or null if it never was. */
export function evidenceAgeDays(
  evidence: FieldEvidence | null | undefined,
  field: string,
  asOf: Date = new Date(),
): number | null {
  const stamp = stampOf(evidence, field)
  if (!stamp) return null
  const t = Date.parse(stamp.checked_at)
  if (!Number.isFinite(t)) return null
  return Math.floor((asOf.getTime() - t) / 86_400_000)
}

function isFresh(stamp: EvidenceStamp, opts: AgeOpts): boolean {
  const max = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS
  const t = Date.parse(stamp.checked_at)
  if (!Number.isFinite(t)) return false
  const days = Math.floor(((opts.asOf ?? new Date()).getTime() - t) / 86_400_000)
  return days >= 0 ? days <= max : true   // a clock-skewed future stamp is fresh, not stale
}

function hasQuote(stamp: EvidenceStamp): boolean {
  return typeof stamp.quote === 'string' && stamp.quote.trim().length > 0
}

/**
 * Has this field been checked against the page, found to match, and quoted —
 * recently enough to still be worth something?
 *
 * This is the question a publish gate asks. It is deliberately strict:
 * `agrees: false` returns FALSE, because a field the page contradicts is not
 * merely unverified, it is known wrong, and a gate that treated "we checked and
 * it disagreed" as satisfied would be worse than one with no evidence at all.
 * Use `isContradicted` to tell the two apart when reporting.
 */
export function isConfirmed(
  evidence: FieldEvidence | null | undefined,
  field: string,
  opts: AgeOpts = {},
): boolean {
  const stamp = stampOf(evidence, field)
  if (!stamp) return false
  return stamp.agrees === true && hasQuote(stamp) && isFresh(stamp, opts)
}

/** The page was read and said something OTHER than what we hold. A correction is owed. */
export function isContradicted(
  evidence: FieldEvidence | null | undefined,
  field: string,
  opts: AgeOpts = {},
): boolean {
  const stamp = stampOf(evidence, field)
  if (!stamp) return false
  return stamp.agrees === false && hasQuote(stamp) && isFresh(stamp, opts)
}

/**
 * Was the page read at all for this field, within the window — including the
 * case where it turned out to say nothing?
 *
 * This is the scheduling question ("do I need to fetch this row again"), not the
 * publishing question. Never use it as a gate condition.
 */
export function wasChecked(
  evidence: FieldEvidence | null | undefined,
  field: string,
  opts: AgeOpts = {},
): boolean {
  const stamp = stampOf(evidence, field)
  if (!stamp) return false
  return isFresh(stamp, opts)
}

/** The stamp itself, normalised, for rendering on the admin row. */
export function readStamp(
  evidence: FieldEvidence | null | undefined,
  field: string,
): EvidenceStamp | null {
  return stampOf(evidence, field)
}

// ── Building ─────────────────────────────────────────────────────────────────

export type EvidenceInput = {
  field:      string
  quote:      string | null
  source_url: string | null
  agrees:     boolean | null
}

export type BuiltPatch = {
  patch: FieldEvidence
  /**
   * Fields whose caller offered a verdict with no quote behind it. They are
   * downgraded to `agrees: null` rather than dropped or thrown, so a bug in a
   * caller costs one field's evidence instead of a whole run — but they are
   * REPORTED rather than downgraded silently, because a silent downgrade is the
   * exact failure this tranche exists to remove.
   */
  unquoted: string[]
}

export function buildEvidencePatch(
  inputs: EvidenceInput[],
  meta: { by: string; checkedAt?: Date },
): BuiltPatch {
  const checked_at = (meta.checkedAt ?? new Date()).toISOString()
  const patch: FieldEvidence = {}
  const unquoted: string[] = []

  for (const input of inputs) {
    const quoted = typeof input.quote === 'string' && input.quote.trim().length > 0
    let agrees = input.agrees

    // NO QUOTE, NO VERDICT — the rule the engine already applies to field
    // proposals, enforced again at the point of storage so it cannot be lost by
    // a future caller.
    if (agrees !== null && !quoted) {
      unquoted.push(input.field)
      agrees = null
    }

    patch[input.field] = {
      quote:      agrees === null ? null : input.quote!.trim(),
      source_url: input.source_url,
      checked_at,
      by:         meta.by,
      agrees,
    }
  }

  return { patch, unquoted }
}

// ── Writing ──────────────────────────────────────────────────────────────────

export type RecordResult = {
  /** Field names actually present in the row after the merge. */
  stamped:  string[]
  evidence: FieldEvidence
}

/**
 * Merge a patch into a row's `field_evidence` and confirm it landed.
 *
 * Goes through the `merge_field_evidence` RPC rather than a read-modify-write,
 * so concurrent stamps on the same row cannot lose each other, and so the merged
 * object comes back for verification. A null return means the row id matched
 * nothing — which is also what a cookie-scoped client resolving to anon looks
 * like under RLS. That has silently reported success in this codebase before,
 * so it throws here rather than returning quietly.
 */
export async function recordFieldEvidence(opts: {
  id:    string
  patch: FieldEvidence
  db:    SupabaseClient
}): Promise<RecordResult> {
  const { id, patch, db } = opts
  if (Object.keys(patch).length === 0) return { stamped: [], evidence: {} }

  const { data, error } = await db.rpc('merge_field_evidence', { row_id: id, patch })
  if (error) throw new Error(`field_evidence write failed for ${id}: ${error.message}`)
  if (data === null || data === undefined) {
    throw new Error(
      `field_evidence write for ${id} matched no row — check the client is service-role, not a session client`,
    )
  }

  const evidence = data as FieldEvidence
  const missing = Object.keys(patch).filter(f => !(f in evidence))
  if (missing.length > 0) {
    throw new Error(`field_evidence write for ${id} did not persist: ${missing.join(', ')}`)
  }

  return { stamped: Object.keys(patch), evidence }
}
