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

/**
 * The trial is on ONE plan, not on the product.
 *
 * This matters for where the phrase may appear: a CTA that leads to ordinary
 * signup lands people on Match, which does not trial. Putting "Free for 14
 * days" beside such a button promises a trial the click cannot deliver.
 */
export const TRIAL_PLAN = 'Apply'

/**
 * Whether a surface may ADVERTISE the trial.
 *
 * Deliberately a switch and not a date comparison against TRIAL_LIVE_FROM. A
 * date that flips itself on will publish the offer on the 10th whether or not
 * the billing behind it shipped, and the first person to find out would be a
 * stranger on the highest-traffic acquisition page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DO NOT FLIP THIS WHEN STRIPE GOES LIVE. There are TWO conditions and Stripe
 * is only the first.
 *
 *   1. The trial can be bought at all. That is Stripe, and 10 September.
 *   2. The surface doing the advertising can HONOUR it. That is not Stripe,
 *      and it is not a date.
 *
 * Condition 2 is the one that outlives the launch. The trial is Apply-only
 * (see TRIAL_PLAN). The public opportunity page's CTA goes to ordinary signup,
 * which lands people on MATCH, which does not trial. So on 11 September, with
 * checkout working perfectly, that page still cannot deliver what the words
 * beside its button would promise. The line has to move, or be qualified, or
 * the CTA has to lead somewhere that starts an Apply trial — and only then does
 * this become true for that surface.
 *
 * This is a live mistake, not a hypothetical: "Free for 14 days" shipped onto
 * that page on 29 August and was pulled back off the same afternoon for
 * condition 2, while condition 1 was equally unmet.
 *
 * If billing later needs "the trial is purchasable" as a separate fact from
 * "this surface may say so", split them then. One flag is honest while the
 * answer to both is no.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const TRIAL_IS_LIVE = true
// Flipped 14 September 2026. Both conditions above are met, and condition 2
// was met by design rather than by Stripe: since migration 078 (5 September)
// EVERY organisation created through ordinary signup starts with 14 days of
// Apply access, so the public opportunity page's CTA, which leads to ordinary
// signup, now delivers exactly what the words beside it promise. Paul's rule
// for launch: one signup path, every trial. Stripe is still not merged, which
// is fine here: the trial needs no card.

/** Intended live date, for the record. Decided 2026-08-28. */
export const TRIAL_LIVE_FROM = '2026-09-10'

/** Roughly how long onboarding takes. Confirmed 2026-08-28. */
export const SETUP_MINUTES = 5

/**
 * The trial, always bounded by its length. Never render the word "free" about
 * the product without this.
 */
export const TRIAL_PHRASE = `Free for ${TRIAL_DAYS} days, full access`

/** The setup expectation, with the hedge that keeps it honest. */
export const SETUP_PHRASE = `About ${SETUP_MINUTES} minutes to set up.`

/**
 * What actually goes beside a signup CTA today.
 *
 * Once the trial is live and the CTA leads somewhere that can honour it, this
 * is "Free for 14 days, full access. About 5 minutes to set up." Until then it is the
 * setup time alone, which is true now. The offer does not get announced early
 * on the strength of a date in a comment.
 */
export function ctaSupportLine(): string {
  return TRIAL_IS_LIVE ? `${TRIAL_PHRASE}. ${SETUP_PHRASE}` : SETUP_PHRASE
}

/**
 * The same line as sentences, for a surface that wants each sentence to stay
 * whole when the row wraps. Joined with a space this is ctaSupportLine().
 */
export function ctaSupportParts(): string[] {
  return TRIAL_IS_LIVE ? [`${TRIAL_PHRASE}.`, SETUP_PHRASE] : [SETUP_PHRASE]
}
