/**
 * Is a page that returned HTTP 200 actually a real page?
 *
 * A 200 is weaker evidence than it looks. Three things return one while
 * carrying no funder content at all, and each needs a different response:
 *
 *   PARKED   — the domain is registered but hosts nothing. Parking pages answer
 *              EVERY path with 200, so probing /grants, /apply and /funding all
 *              "succeed". boothcharities.org is the case that prompted this:
 *              "boothcharities.org is parked free, courtesy of 123 Reg", and it
 *              answered 200 on every path tried. The Booth Charities genuinely
 *              has no website, and three separate checks concluded it did.
 *
 *   SOFT 404 — a real site serving its not-found page with a 200 status.
 *
 *   TOO THIN — too little text to enrich from. Two causes, same consequence: a
 *              JavaScript shell whose content renders client-side, or a real but
 *              near-empty stub. Edward Holt Trust's /grant-application is the
 *              second kind — 600 characters saying only "you should receive an
 *              acknowledgement email, check your spam folder". The enricher read
 *              it faithfully and produced a brief whose one insider tip was about
 *              spam folders. Neither wants deleting; both want a better source
 *              page or the reader proxy.
 *
 * Single-sourced because the same question is asked by the dead-row triage and
 * by the pre-publication review, and a rule inlined in two places drifts. That
 * has already cost this codebase four separate copies of one enrichment test.
 */

/** Domain-parking and for-sale boilerplate. */
const PARKED_RE = /\bis parked\b|parked free|parked domain|get this domain|buy this domain|domain (?:is )?for sale|this domain may be for sale|domain name is for sale|courtesy of 123 ?reg|godaddy\.com\/domainsearch|sedoparking|hugedomains|namecheap parking|future home of/i

/** A real site serving its not-found page with a 200. */
const SOFT_404_RE = /page not found|404 error|no longer exists|has been moved|sorry, we (?:can'?t|cannot) find|this page (?:is|has been) (?:unavailable|removed)/i

export type PageHealth = 'ok' | 'parked' | 'soft404' | 'too_thin' | 'empty'

/**
 * Judge a fetched page from its HTML.
 *
 * `finalUrl` is optional but worth passing: parking services redirect to a
 * /lander or /parking path, which is a stronger signal than the body text and
 * survives a page whose boilerplate we do not recognise.
 */
export function assessPage(html: string, finalUrl?: string): { health: PageHealth; visibleChars: number } {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (finalUrl && /\/(lander|parking|park)(\/|$|\?)/i.test(finalUrl)) {
    return { health: 'parked', visibleChars: text.length }
  }
  // Checked against the first slice only: a long real page can quote "for sale"
  // in passing, whereas parking boilerplate is always at the top and is usually
  // the whole page.
  if (PARKED_RE.test(text.slice(0, 2000))) return { health: 'parked', visibleChars: text.length }
  if (text.length === 0) return { health: 'empty', visibleChars: 0 }
  // Soft-404 before the length test: those pages are often long enough to look
  // healthy, and they carry site-wide "how to apply" navigation that reads as a
  // live fund.
  if (SOFT_404_RE.test(text.slice(0, 3000))) return { health: 'soft404', visibleChars: text.length }
  // 800, not 400. At 400 a 600-character stub page reads as healthy — which is
  // exactly how Edward Holt Trust shipped with a brief about spam folders. No
  // funder describes who can apply, what they fund and their exclusions in
  // under 800 characters.
  if (text.length < 800) return { health: 'too_thin', visibleChars: text.length }
  return { health: 'ok', visibleChars: text.length }
}

/** Should this page be treated as usable evidence about a funder? */
export function isUsablePage(health: PageHealth): boolean {
  return health === 'ok'
}

/** One-line explanation for a report or a review blocker. */
export function describeHealth(health: PageHealth, chars: number): string {
  switch (health) {
    case 'parked':   return 'domain is parked — no site here, and it answers 200 on every path'
    case 'soft404':  return 'returns 200 but the content is a not-found page'
    case 'too_thin': return `only ${chars} chars of text — a stub or JS-rendered page, not enough to enrich from`
    case 'empty':    return 'returned 200 with no readable content at all'
    case 'ok':       return `${chars} chars of readable text`
  }
}
