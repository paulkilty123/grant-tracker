// Quality flags on a grant row — one shape, one writer.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY
//
// The codebase computes a lot of quality signals and then loses them. As of the
// 2026-07-25 audit: per-field citation confidence, funder_brief._stale_dates,
// funder_brief._ungrounded_amounts, the reenrich reclassify diff, stale_since,
// cf-fund-verify's raw_data.verify.flags, and needs_intervention_reason are all
// calculated and persisted — and a grep of the entire admin UI for those keys
// returns nothing except one citation tooltip. The most expensive signals in the
// system are invisible at the point of decision.
//
// Rather than add a third and fourth ad-hoc shape (this file was created when the
// amount-conflict and multi-round checks both needed somewhere to live), flags go
// in ONE place with ONE shape, so the review surface and the future auto-publish
// gate each have a single thing to read.
//
// Storage: scraped_grants.raw_data.checks — an array of GrantFlag.
// raw_data is NOT in TRACKED_FIELDS, so writing here never interacts with the
// trust ladder and can never be blocked by an admin pin.
//
// NOTE: src/lib/cf-fund-verify.ts still writes its own raw_data.verify.flags.
// That predates this module and nothing reads it yet either. Converge it when the
// auto-publish gate is built, so there is exactly one flag surface to consume.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from './grant-merge'

/**
 * Flag codes. Additive — a reader must tolerate codes it does not recognise,
 * because a row may carry flags written by an older or newer deploy.
 */
export type GrantFlagCode =
  // Stored amount_max is much larger than the per-applicant figure derivable
  // from the text — the stored value is probably the whole fund's pot.
  | 'amount_pot_suspected'
  // Text implies a higher per-applicant ceiling than the stored amount_max.
  | 'amount_under_stated'
  // Not rolling, one deadline, no cycle captured, and the text says there will
  // be another round. Will go stale the moment this date passes.
  | 'possible_multi_round_uncaptured'

export type GrantFlag = {
  code:   GrantFlagCode
  detail: string
  /** Provenance-style source string of whatever raised it. */
  source: string
  /** ISO timestamp. */
  at:     string
  /**
   * The figure this flag is arguing for, as a number.
   *
   * The amount flags used to carry the derived figure ONLY inside `detail`, as
   * prose: "...the per-applicant figure derived from the text (£2,000)". So the
   * review card could tell a reviewer the right answer and offer no way to apply
   * it — Groundwork's Grassroots Grants was stored at £500–£10,000 where the
   * page says "up to £2,000", the card printed the £2,000, and correcting it
   * still meant reading the sentence and retyping the number.
   *
   * Stored structurally so a one-press "Use this figure" can exist without
   * parsing our own sentences back into numbers. Optional: flags written by an
   * older deploy will not have it, and a reader must cope.
   */
  suggested?: { amount_min?: number | null; amount_max?: number | null }
}

/**
 * Merge flags into raw_data.checks.
 *
 * Idempotent per source: flags previously written by the SAME source are
 * replaced, flags from other sources are preserved. So re-running enrichment
 * refreshes its own findings without duplicating them, and without clobbering
 * another checker's.
 *
 * Passing an empty `flags` array clears this source's flags — which is what you
 * want when a re-check finds the earlier problem resolved.
 */
export async function recordGrantFlags(opts: {
  db:              SupabaseClient
  grantId:         string
  /** The row's current raw_data. Pass it so existing keys are preserved. */
  existingRawData: unknown
  source:          string
  flags:           Array<{ code: GrantFlagCode; detail: string; suggested?: GrantFlag['suggested'] }>
}): Promise<void> {
  const { db, grantId, existingRawData, source, flags } = opts

  const raw = (existingRawData && typeof existingRawData === 'object' && !Array.isArray(existingRawData))
    ? { ...(existingRawData as Record<string, unknown>) }
    : {}

  const prior = Array.isArray(raw.checks) ? (raw.checks as GrantFlag[]) : []
  const kept  = prior.filter(f => f && typeof f === 'object' && f.source !== source)

  const at = new Date().toISOString()
  const next: GrantFlag[] = [
    ...kept,
    ...flags.map(f => ({ code: f.code, detail: f.detail, source, at, ...(f.suggested ? { suggested: f.suggested } : {}) })),
  ]

  // Nothing to do: this source had no flags before and has none now.
  if (next.length === 0 && prior.length === 0) return

  await mergeGrantUpdate({
    id:     grantId,
    source,
    db,
    fields: { raw_data: { ...raw, checks: next } },
  })
}

/** Read helper for consumers (review UI, auto-publish gate). */
export function readGrantFlags(rawData: unknown): GrantFlag[] {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return []
  const checks = (rawData as Record<string, unknown>).checks
  return Array.isArray(checks) ? (checks as GrantFlag[]).filter(f => f && typeof f === 'object') : []
}

/** Codes whose argument is about the stored amount. */
const AMOUNT_CODES: ReadonlySet<string> = new Set(['amount_pot_suspected', 'amount_under_stated'])

/**
 * The figure an amount flag is arguing for, if it carries one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SO THE REVIEWER DOES NOT RETYPE WHAT THE MACHINE ALREADY WORKED OUT
 *
 * The amount policy is gap-fill only: a re-read writes a derived figure into an
 * empty field and never overwrites one that is already there. That is the right
 * policy — dry-run on 2026-07-25 the extractor disagreed with 18 of 60 live rows
 * and was itself wrong on several, so a human has to decide.
 *
 * But the decision was made needlessly expensive. The derived figure existed
 * only inside the flag's prose, so Groundwork's Grassroots Grants printed "the
 * per-applicant figure derived from the text (£2,000)" on the card while its
 * stored value stayed £500-£10,000, and accepting the £2,000 meant reading the
 * sentence and typing the number in by hand.
 *
 * Returns null for flags written before `suggested` existed, and for a figure
 * that matches what is already stored — there is nothing to press in either case.
 */
export function amountSuggestionFrom(
  rawData: unknown,
  stored: { amount_min: number | null; amount_max: number | null },
): { amount_min: number | null; amount_max: number | null } | null {
  const checks = (rawData && typeof rawData === 'object' && !Array.isArray(rawData))
    ? (rawData as Record<string, unknown>).checks
    : null
  if (!Array.isArray(checks)) return null

  for (const raw of checks) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    if (!AMOUNT_CODES.has(String(c.code))) continue
    const sug = c.suggested
    if (!sug || typeof sug !== 'object') continue
    const s = sug as Record<string, unknown>
    const max = typeof s.amount_max === 'number' ? s.amount_max : null
    const min = typeof s.amount_min === 'number' ? s.amount_min : null
    if (max === null && min === null) continue
    // Already what the row holds. Offering it would be a button that does nothing.
    if (max === stored.amount_max && min === stored.amount_min) continue
    return { amount_min: min, amount_max: max }
  }
  return null
}
