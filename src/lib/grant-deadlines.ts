// Deadline-shape detection helpers. Pure, no DB access.
//
// The multi-round pattern lived in src/lib/cf-fund-verify.ts, so the check that
// catches "this text implies several rounds but we only captured one date" ran
// for community-foundation funds and nothing else. Everywhere else a multi-round
// fund captured a single date, that date passed, and the grant went stale —
// expire-grants cannot roll a deadline forward without a cycle to roll to.
//
// "Deadlines are not captured properly, especially multi-round ones" is the third
// of the three error classes Paul reports hitting most in Needs Review. Moved
// here 2026-07-25 so every source gets the same check.

/**
 * Phrasings that imply a recurring or multi-round application cycle.
 *
 * Not proof of multiple rounds — just enough signal to defer to a human rather
 * than publish a single date that is likely to go stale the moment that round
 * closes. Kept deliberately narrow: explicit round numbering, an explicit
 * per-year count, or an explicit "multi-round" / "several rounds" phrase.
 */
export const MULTI_ROUND_PATTERN = /\bround\s*(one|two|three|four|1|2|3|4|i|ii|iii|iv)\b|\b(twice|two|three|four)\s+(?:(?:times|rounds?|deadlines?|windows?|calls?|intakes?)\s+)?(a|per)\s*year\b|\bmulti-?round\b|\bseveral\s+rounds?\b/i
// The optional noun group was widened 2026-07-25. The inherited pattern allowed
// only "times" between the number and "a year", so "we run two ROUNDS a year"
// did not match — a straightforwardly multi-round phrasing. This also fixes the
// same miss in the CF pipeline, which shares this constant. Widening only ever
// causes MORE rows to be held for review rather than auto-published, which is
// the safe direction.

/**
 * Additional cycle phrasings worth flagging that the pattern above misses.
 * Separated so the CF pipeline's long-standing behaviour is unchanged — it keeps
 * using MULTI_ROUND_PATTERN alone — while the general check below can be a
 * little broader, since it only ever raises a flag and never writes a value.
 */
const RECURRING_CYCLE_HINTS = /\b(?:quarterly|termly|biannual(?:ly)?|bi-annual(?:ly)?|each\s+(?:quarter|term)|every\s+(?:quarter|three\s+months|six\s+months|four\s+months)|(?:board|panel|trustees?)\s+meet(?:s|ings?)?\b|deadlines?\s+(?:are|fall|in)\b|closing\s+dates?\s+(?:are|fall)\b|application\s+windows?\b|rounds?\s+(?:open|close)\b)/i

export type MultiRoundCheck = {
  /** True when the text implies a cycle but no structured cycle was captured. */
  suspected: boolean
  /** The phrase that triggered it, for the flag detail. */
  matched: string | null
}

/**
 * Detect an uncaptured recurring cycle.
 *
 * Fires only when ALL of these hold:
 *   - the grant is not rolling (a rolling grant has no round to miss)
 *   - a single deadline IS set (nothing to go stale otherwise, and a row with no
 *     deadline is already caught by the separate deadline_missing check)
 *   - deadline_cycle is empty (nothing structured to roll forward to)
 *   - the source text implies a cycle
 *
 * That combination is precisely the silent-rot case: one date, no cycle, and
 * wording that says there will be another round.
 */
export function detectUncapturedMultiRound(input: {
  isRolling:     boolean | null | undefined
  deadline:      string | null | undefined
  deadlineCycle: unknown[] | null | undefined
  /** Deadline citation snippet, brief.decision_timeline, description, etc. */
  sourceTexts:   Array<string | null | undefined>
}): MultiRoundCheck {
  const { isRolling, deadline, deadlineCycle, sourceTexts } = input

  if (isRolling) return { suspected: false, matched: null }
  if (!deadline) return { suspected: false, matched: null }
  if ((deadlineCycle?.length ?? 0) > 0) return { suspected: false, matched: null }

  for (const raw of sourceTexts) {
    if (!raw) continue
    const m = raw.match(MULTI_ROUND_PATTERN) ?? raw.match(RECURRING_CYCLE_HINTS)
    if (m) return { suspected: true, matched: m[0] }
  }
  return { suspected: false, matched: null }
}
