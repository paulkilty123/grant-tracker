// Equivalent legal forms across the UK's three charity regulators.
//
// A SCIO is a Scottish Charitable Incorporated Organisation — the Scottish
// incorporated charity form, registered with OSCR. A CIO is its England &
// Wales counterpart, registered with the Charity Commission. A funder writing
// "open to registered charities" is including both; it is simply not required
// to enumerate every legal form the phrase covers.
//
// The classifier reads the page literally, so absence of the literal string
// "SCIO" reads to it as evidence of exclusion. That is how Wee Grants — a
// Scotland-only fund from a Scottish funder for small charities — lost its
// `scio` tag on a re-read and became invisible to its core audience.
//
// THIS IS A DERIVATION, NOT AN INFERENCE. It does not guess at what a funder
// might accept; it expands a legal form the funder has ALREADY accepted into
// the equivalent form used by another UK regulator. That distinction is why it
// belongs at the write boundary rather than in a prompt: a prompt line is a
// request a model can drop on any re-read, and this rule must survive every
// future classifier pass including ones that have never heard of it.

import type { LegalStructure } from '@/types'

/** Charity forms whose presence means the funder accepts registered charities. */
const CHARITY_FORMS: LegalStructure[] = ['registered_charity', 'cio', 'scio']

/** Text that means the funder positively excludes incorporated charity forms.
 *  Rare, but funders do enumerate exclusions — see Wee Grants — and a
 *  derivation must never add back something the page rules out. */
const EXCLUDES_INCORPORATED_CHARITY =
  /(cannot be|not eligible|are excluded|do not fund|will not fund|are not accepted|ineligible)[^.]{0,120}\b(scio|cio|charitable incorporated)/i

const COVERS_SCOTLAND = /\bscot|\buk\b|united kingdom|\bbritain|\bgb\b|nationwide|england,? scotland/i
const COVERS_EW       = /\bengland|\bwales|\bwelsh|\buk\b|united kingdom|\bbritain|\bgb\b|nationwide/i

/**
 * Add equivalent charity forms a funder has implicitly accepted.
 *
 * Asymmetric on purpose. A Scotland-only fund gains `scio` but NOT `cio`: an
 * England & Wales CIO cannot apply to a Scotland-only fund, so adding it would
 * be a false positive that shows the fund to organisations who cannot win it.
 * A UK-wide fund gains both.
 *
 * Always returns a NEW array. Callers must compare by CONTENT, not reference —
 * `after !== before` is always true because the input is copied on entry, and
 * an earlier version of the backfill mistook that for "every row changed".
 */
export function deriveEquivalentStructures(
  structures: readonly string[] | null | undefined,
  geoText: string | null | undefined,
  eligibilityText?: string | null,
): string[] {
  const current = Array.isArray(structures) ? [...structures] : []
  if (current.length === 0) return current

  // Only expand when the funder has accepted SOME charity form. A fund open
  // only to CICs and community groups says nothing about charities, and
  // inventing one here would be exactly the inference this file avoids.
  if (!current.some(s => CHARITY_FORMS.includes(s as LegalStructure))) return current

  if (eligibilityText && EXCLUDES_INCORPORATED_CHARITY.test(eligibilityText)) return current

  const geo = String(geoText ?? '')
  const out = [...current]

  if (COVERS_SCOTLAND.test(geo) && !out.includes('scio')) out.push('scio')
  if (COVERS_EW.test(geo)       && !out.includes('cio'))  out.push('cio')

  return out
}
