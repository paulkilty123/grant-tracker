/**
 * May a brief refresh be skipped because the funder's page has not changed
 * since the brief was written?
 *
 * reenrich-stale rewrites every brief older than 90 days, whether or not the
 * page moved: six rows a night, about a penny each. The nightly verifier now
 * fingerprints the page it reads (page-hash.ts). When the brief was last
 * written, the fingerprint of the page at that time is stamped on it as
 * `_page_hash_at_enrich`. If the verifier's latest fingerprint matches, the
 * brief was written from the page as it stands and rewriting it would produce
 * the same words for the same money.
 *
 * Fails safe in one direction: no stamp, no fingerprint, or a mismatch all
 * mean "refresh as before". The only way to skip is a byte-identical page.
 */
export const BRIEF_HASH_KEY = '_page_hash_at_enrich'

export function currentPageHash(fieldEvidence: unknown): string | null {
  const stamp = (fieldEvidence as { _page_read?: { page_hash?: unknown } } | null)?._page_read
  return typeof stamp?.page_hash === 'string' ? stamp.page_hash : null
}

export function briefPageHash(funderBrief: unknown): string | null {
  const v = (funderBrief as Record<string, unknown> | null)?.[BRIEF_HASH_KEY]
  return typeof v === 'string' ? v : null
}

export type ReenrichSkip = { skip: true; reason: string } | { skip: false; reason: string }

export function reenrichUnchanged(funderBrief: unknown, fieldEvidence: unknown): ReenrichSkip {
  const page  = currentPageHash(fieldEvidence)
  const brief = briefPageHash(funderBrief)
  if (!page)          return { skip: false, reason: 'no page fingerprint yet' }
  if (!brief)         return { skip: false, reason: 'brief predates fingerprinting' }
  if (page !== brief) return { skip: false, reason: 'page changed since the brief was written' }
  return { skip: true, reason: 'page unchanged since the brief was written' }
}
