/**
 * Does a funder's own sentence NAME a legal form, positively, as an applicant?
 *
 * WHY THIS IS NOT JUST "THE EXTRACTOR PROPOSED IT". On 2026-08-20 a widening
 * pass was about to add six legal forms to the Red Hill Trust on the strength of
 * one quote: *"Grants are only awarded to organisations, not individuals."* That
 * sentence names no form at all. Applying it would have told CICs and
 * unincorporated groups they could apply to a traditional grant-making trust.
 *
 * And across that run the extractor proposed `not_registered` on 50 rows while
 * naming it in none of their quotes.
 *
 * So the rule: a form is only added when the words for it appear in the sentence
 * the verifier pulled off the page. Not "the quote is about eligibility", not
 * "the model is usually right" — the words are there, or the form is not added
 * and a person looks instead.
 *
 * The vocabulary below is drawn from how funders write, not from our own column
 * names: nobody publishes "ltd_guarantee". Terms that could mean two things are
 * left out entirely rather than guessed at.
 */

const NAMES: Record<string, RegExp> = {
  registered_charity: /\bcharit(y|ies|able)\b/i,
  cio:                /\bCIO\b|charitable incorporated organisation/i,
  scio:               /\bSCIO\b|scottish charitable incorporated/i,
  cic_guarantee:      /\bCIC\b|community interest compan/i,
  cic_shares:         /\bCIC\b|community interest compan/i,
  ltd_guarantee:      /limited compan|compan(y|ies) limited|\bltd\b/i,
  ltd_shares:         /limited compan|compan(y|ies) limited|\bltd\b/i,
  llp:                /\bLLP\b|limited liability partnership/i,
  cooperative:        /co-?operative|\bco-?op\b|community benefit societ/i,
  unincorporated:     /unincorporated|voluntary (group|organisation|sector)|community group|constituted group|not-for-profit group/i,
  not_registered:     /not (yet )?registered|unregistered|without charitable status|do not have charitable status|don't need to be (a )?(registered|constituted)|informal group/i,
  sole_trader:        /sole trader/i,
  individual:         /\bindividual/i,
}

/**
 * Words that flip a mention into its opposite, looked for in the 45 characters
 * BEFORE the form is named.
 *
 * `on behalf of` matters as much as `not`, and is easier to miss because it
 * reads as a positive mention in every other respect. The Percy Bilton Charity's
 * page says *"Social Workers, Community Psychiatric Nurses and Occupational
 * Therapists ... may apply ON BEHALF OF individuals in financial need"* — the
 * professional applies and the individual benefits. Hackney's crisis fund has
 * the same shape. Reading either as "individuals may apply" puts a fund in front
 * of someone who cannot receive it.
 */
const NEGATED_BEFORE = /\b(not|non|cannot|can't|no|never|exclud\w*|except|ineligible|unable|rather than|instead of|on behalf of|behalf)\b[^.;]{0,45}$/i

/**
 * And the same words AFTER it, because English puts the negative on either side.
 *
 * "Unregistered groups are not eligible" opens with the form and negates it four
 * words later, so a backward-only guard reads it as an invitation. Caught by its
 * own test before this shipped, which is the entire argument for the tests
 * carrying real sentences off real funder pages rather than invented ones.
 */
const NEGATED_AFTER = /^[^.;]{0,40}\b(are not|is not|cannot|can't|will not|won't|do not|don't|are excluded|are ineligible|not eligible|ineligible|not accepted|not considered)\b/i

/** Is this a form the vocabulary knows how to look for? */
export function isNameableForm(form: string): boolean {
  return form in NAMES
}

/** Does `quote` name `form` as something that MAY apply? */
export function namedPositively(quote: string, form: string): boolean {
  const re = NAMES[form]
  if (!re) return false
  const m = quote.match(re)
  if (!m || m.index === undefined) return false
  const before = quote.slice(Math.max(0, m.index - 45), m.index)
  const after  = quote.slice(m.index + m[0].length)
  return !NEGATED_BEFORE.test(before) && !NEGATED_AFTER.test(after)
}

/** The subset of `forms` that `quote` actually names. */
export function formsNamedIn(quote: string, forms: readonly string[]): string[] {
  if (!quote || !quote.trim()) return []
  return forms.filter(f => namedPositively(quote, f))
}
