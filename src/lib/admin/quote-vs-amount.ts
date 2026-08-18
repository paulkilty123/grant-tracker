import { buildAwardText, extractGrantAmounts } from '@/lib/grant-amounts'

/**
 * Does a brief quote parade fund totals under a per-applicant heading?
 *
 * Asda Foundation is the case this was written for. Its TYPICAL AWARD citation
 * reads "£529,977 Outdoor Community Spaces Fund £510,465 Young Futures Fund
 * £1,255,314 Local Community Spaces Fund ..." on a row whose recorded amount is
 * £500 to £20,000. Those are the sizes of the pots, not of a grant, and the card
 * presented them flat, under a confidence badge, directly beneath the real
 * figure. A reviewer comparing the two has no way to tell which is the award.
 *
 * The test is the one settled on 2026-08-18 for amount flags: ONLY A PER-GRANT
 * FIGURE MAY DISPUTE A STORED AMOUNT. `extractGrantAmounts` already carries the
 * pool-cue list and reports `max_cued`, meaning the winning figure came with an
 * explicit per-grant qualifier ("up to £X", "grants of £X"). So a cued figure is
 * a real disagreement worth reading, and an uncued one that dwarfs the stored
 * maximum is a pot. Reusing that function rather than writing a second reader
 * keeps one answer to "is this figure about one applicant".
 *
 * Returns null when there is nothing to say, which includes the case where we
 * hold no maximum to compare against: with nothing stored, a big figure in a
 * quote is a lead rather than a contradiction.
 */
export type QuoteAmountMismatch = { quoted: number; stored: number; times: number }

/**
 * Three times, matching the wording the amount flags already use ("3.1x the
 * per-applicant figure"). Deliberately not tighter: a fund can genuinely award
 * twice its typical grant to one applicant, and a warning that fires on normal
 * variation is one a reviewer learns to scroll past.
 */
const DWARFS = 3

export function quoteOverstatesAward(
  snippet: string | null | undefined,
  storedMax: number | null | undefined,
): QuoteAmountMismatch | null {
  if (!snippet || !storedMax || storedMax <= 0) return null

  const found = extractGrantAmounts(buildAwardText([snippet]))
  if (!found.amount_max) return null
  // A per-grant qualifier makes this a genuine dispute about the award, which
  // is a different finding and not this one's to report.
  if (found.max_cued) return null
  if (found.amount_max < storedMax * DWARFS) return null

  return {
    quoted: found.amount_max,
    stored: storedMax,
    times: Math.round((found.amount_max / storedMax) * 10) / 10,
  }
}
