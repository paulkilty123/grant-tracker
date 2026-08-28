/**
 * The trial offer and the setup time, in one place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEVER WRITE A BARE "FREE".
 *
 * The product is free for fourteen days and then it is not. "Free" on its own
 * claims it costs nothing, which stops being true on day fifteen, and the page
 * that made the claim is the one a stranger read before signing up. Always the
 * bounded form: "Free for 14 days".
 *
 * That is why this is a constant and not a literal. `mcp-brand.ts` exists for
 * the same reason and for the same failure: /mcp ended up carrying three
 * different descriptions of one grant because each surface wrote its own copy.
 * A trial length is worse than a brand name to get wrong, because it is a
 * commercial promise. When the number changes it must change once.
 *
 * So: any surface that mentions the trial or the setup time reads from here.
 * If you are about to type "14 days" or "5 minutes" into a page, an email or a
 * prompt, import it instead.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `SETUP_MINUTES` keeps its "about". It was measured, not guessed, but it is
 * one number standing in for a range of organisations, and a visitor who finds
 * it takes fifteen has been misled at the worst possible moment. "About" is
 * doing real work; do not tidy it away.
 */

/** Length of the free trial, in days. */
export const TRIAL_DAYS = 14

/** Roughly how long onboarding takes. Confirmed 2026-08-28. */
export const SETUP_MINUTES = 5

/**
 * The trial, always bounded by its length. Never render the word "free" about
 * the product without this.
 */
export const TRIAL_PHRASE = `Free for ${TRIAL_DAYS} days`

/** The setup expectation, with the hedge that keeps it honest. */
export const SETUP_PHRASE = `Takes about ${SETUP_MINUTES} minutes to set up.`

/**
 * Both, as they sit beside a signup CTA:
 * "Free for 14 days. Takes about 5 minutes to set up."
 */
export const TRIAL_AND_SETUP_LINE = `${TRIAL_PHRASE}. ${SETUP_PHRASE}`
