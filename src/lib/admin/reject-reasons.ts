/**
 * Why a row was rejected, as a code rather than a sentence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FREE PROSE CANNOT BE COUNTED, SO IT CANNOT FEED ANYTHING BACK
 *
 * Reject has always demanded a reason and always stored it as whatever was
 * typed. That makes a decent audit note and a useless signal: seven files write
 * `rejection_reason` and not one reads it, because "not really a grant, more of
 * a competition" and "this is a competition not a fund" are the same finding in
 * two strings nothing can group.
 *
 * The intended set has been documented in the schema since migration 022
 * (`historical_deadline, duplicate, malformed_url, non_funder, out_of_scope,
 * dead_url, quarantine`) and was never enforced anywhere, so nothing wrote it.
 * This is that set, made real.
 *
 * A NOTE IS STILL ALLOWED, and appended after the code. One column, still one
 * value, and `parseRejectReason` recovers both halves — so the codes can be
 * counted while the sentence a human wanted to leave survives next to them.
 *
 * Rows rejected before this simply parse as `code: null`, which is honest: we do
 * not know which bucket they were, and guessing from their prose would invent a
 * statistic.
 */

export type RejectReason = {
  code: string
  label: string
  /** Shown under the label. Says when to pick this one, not what it means. */
  detail: string
}

export const REJECT_REASONS: RejectReason[] = [
  { code: 'non_funder',         label: 'Not a funder',
    detail: 'A directory, a news item, an award, or an organisation that does not give money.' },
  { code: 'out_of_scope',       label: 'Out of scope',
    detail: 'Real funding, but not for UK charities, CICs or social enterprises.' },
  { code: 'duplicate',          label: 'Duplicate',
    detail: 'We already carry this fund under another row.' },
  { code: 'dead_url',           label: 'Dead link, no replacement',
    detail: 'The page is gone and the fund cannot be found anywhere on the funder’s site.' },
  { code: 'closed_for_good',    label: 'Closed permanently',
    detail: 'The funder says this fund has ended and is not coming back.' },
  { code: 'historical_deadline', label: 'Historic, never reopened',
    detail: 'A one-off round that closed and shows no sign of returning.' },
]

/** Codes this module knows. Anything else came from before the picker existed. */
const KNOWN = new Set(REJECT_REASONS.map(r => r.code))

/**
 * Store as `code` alone, or `code: note` when a note was written.
 *
 * The separator is the first colon, so a note containing colons survives intact.
 */
export function formatRejectReason(code: string, note?: string | null): string {
  const n = (note ?? '').trim()
  return n ? `${code}: ${n}` : code
}

/**
 * Recover the code and the note.
 *
 * Returns `code: null` for anything written before the picker, rather than
 * forcing it into the nearest bucket — a made-up code would be indistinguishable
 * from a real one the moment somebody counted them.
 */
export function parseRejectReason(stored: string | null | undefined): { code: string | null; note: string | null } {
  const s = (stored ?? '').trim()
  if (!s) return { code: null, note: null }
  const i = s.indexOf(':')
  const head = (i === -1 ? s : s.slice(0, i)).trim()
  const tail = i === -1 ? '' : s.slice(i + 1).trim()
  if (KNOWN.has(head)) return { code: head, note: tail || null }
  // Free prose from before the codes existed. Kept whole as the note.
  return { code: null, note: s }
}

export function rejectReasonLabel(code: string | null): string | null {
  if (!code) return null
  return REJECT_REASONS.find(r => r.code === code)?.label ?? code
}
