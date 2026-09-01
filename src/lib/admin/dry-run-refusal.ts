// What WOULD this write do? Answered honestly, including when the answer is "nothing".
//
// ─────────────────────────────────────────────────────────────────────────────
// THE LESSON THIS ENCODES
//
// The first dry run of the review-queue corrections printed, beside each change,
// "(currently admin:paulkilty1@gmail.com)" — and then reported "would apply 6".
// Both statements were true. Together they were a lie: the script writes as
// `system:` at trust 50 and cannot overwrite an admin field, so two of the six
// would have been refused and the dry run promised they would not be.
//
// Naming the holder is not predicting the outcome. A dry run that cannot report
// a refusal is not a dry run, in the same way that an alarm that has only ever
// reported zero is not an alarm. Paul, 2026-09-01, making it a rule rather than
// a fix.
//
// So the prediction lives here, as a pure function over the same inputs the
// merger uses, and is tested against the merger's own decisions.

import {
  trustOf, supersedesAsStale, type ProvenanceEntry, type ProvenanceSource,
} from '@/lib/grant-merge'

export type PredictedOutcome =
  /** Nothing to do: the stored value already matches. */
  | { outcome: 'no_change' }
  /** The write lands. */
  | { outcome: 'applies' }
  /** A perishable claim withdrawn over a value the ladder would have protected. */
  | { outcome: 'supersedes'; heldBy: string; heldTrust: number }
  /** Refused. `heldBy` is who is holding it and at what trust. */
  | { outcome: 'refused'; reason: 'pinned' | 'lower_trust'; heldBy: string; heldTrust: number }

/**
 * Predict one field's fate, without writing anything.
 *
 * Mirrors `mergeFieldUpdate`'s case order deliberately, and the test asserts the
 * two agree on every case rather than trusting that they do.
 */
export function predictWrite(opts: {
  field:        string
  currentValue: unknown
  currentProv:  ProvenanceEntry | undefined
  newValue:     unknown
  source:       ProvenanceSource
  /** Set when the write carries a page quote. Required for a supersede. */
  citation?:    { snippet: string; confidence: 'high' | 'med' | 'low' }
  now?:         string
}): PredictedOutcome {
  const { field, currentValue, currentProv, newValue, source, citation } = opts
  const now = opts.now ?? new Date().toISOString()

  if (JSON.stringify(currentValue ?? null) === JSON.stringify(newValue ?? null)) {
    return { outcome: 'no_change' }
  }
  if (!currentProv) return { outcome: 'applies' }
  if (currentProv.source === source) return { outcome: 'applies' }

  const newProv: ProvenanceEntry = {
    source, set_at: now, pinned: false,
    ...(citation ? { citation } : {}),
  }
  const heldBy    = currentProv.source
  const heldTrust = trustOf(currentProv.source, currentProv.backfilled)

  if (supersedesAsStale(field, currentProv, newValue, newProv)) {
    return { outcome: 'supersedes', heldBy, heldTrust }
  }
  if (currentProv.pinned && !String(source).startsWith('admin:')) {
    return { outcome: 'refused', reason: 'pinned', heldBy, heldTrust }
  }
  if (trustOf(source) < heldTrust) {
    return { outcome: 'refused', reason: 'lower_trust', heldBy, heldTrust }
  }
  return { outcome: 'applies' }
}

/** One line a dry run can print, which always states the outcome. */
export function describePrediction(field: string, from: unknown, to: unknown, p: PredictedOutcome): string {
  const change = `${field}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`
  switch (p.outcome) {
    case 'no_change':  return `${change}  [no change]`
    case 'applies':    return `${change}  [applies]`
    case 'supersedes': return `${change}  [SUPERSEDES ${p.heldBy} (trust ${p.heldTrust}) as stale]`
    case 'refused':    return `${change}  [WOULD BE REFUSED: ${p.reason}, held by ${p.heldBy} at trust ${p.heldTrust}]`
  }
}
