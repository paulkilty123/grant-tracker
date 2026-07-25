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
  flags:           Array<{ code: GrantFlagCode; detail: string }>
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
    ...flags.map(f => ({ code: f.code, detail: f.detail, source, at })),
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
