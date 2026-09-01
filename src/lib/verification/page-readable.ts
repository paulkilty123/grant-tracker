// Did we actually read the funder's page, or did we read something else?
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS REPLACES A LENGTH CHECK
//
// `verify-row.ts` decided a fetch had failed on `text.length < 200`. A bot wall
// is 260 to 680 characters of real prose served with HTTP 200, so it cleared the
// floor, went to the model as though it were the funder's page, and came back
// saying the fund was not described on it. That answer was written to the row as
// `fixable_link: wrong_fund` — a claim about the FUNDER, from a page nobody read.
//
// A bot wall is only the case we noticed. Measured across the 21 walled rows in
// the review queue on 2026-09-01, the same 200-to-700-character shape is
// produced by at least five different things, and a length test cannot tell any
// of them apart:
//
//   Cloudflare interstitial   268 chars  artscouncil.org.uk, london.gov.uk
//   Imperva interstitial      678 chars  coop.co.uk
//   a soft 404                323 chars  waitrose.com, still HTTP 200
//   a bare directory listing  133 chars  thefsi.org, the site is gone
//   a JS shell                 41 chars  "Enable JavaScript and cookies"
//
// Each needs a different response. A wall should be retried through the proxy
// and then backed off per host. A soft 404 is a link to fix. A directory listing
// means the funder's site no longer exists. Collapsing them into "too short"
// throws away the one thing that decides what to do next.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE CONTRACT
//
// One function, one discriminated union, and the union is the point: a caller
// cannot reach `text` without having handled the failure, so it is not possible
// to derive a verdict about a funder from a page we did not read. That is the
// invariant `verify-row` could previously break by accident.
//
// ORDER MATTERS AND IS NOT THE ORIGINAL ORDER. The old `looksLikeAWall` tested
// the length floor FIRST, so 17 of the 21 walls were reported as "too short"
// when 13 of them carried a Cloudflare signature two words in. The verdict was
// right and the reason was wrong, and the reason is what the backoff and the
// review queue key off. Signatures now run before the floor, and the floor is
// what it always claimed to be: a backstop for pages that identify themselves as
// nothing at all.

import { botWallSignature, IDENTIFYING_WINDOW } from './bot-wall'
export { WALL_SIGNATURES } from './bot-wall'

/** Why a fetch that "succeeded" did not produce the funder's page. */
export type UnreadableReason =
  /** An interception page: Cloudflare, Imperva, a CAPTCHA gate. Retry, then back off. */
  | 'bot_wall'
  /** HTTP 200 on a page that says it is a 404. The link is wrong, not the reader. */
  | 'soft_404'
  /** A bare web-server directory index. The site is not serving a site any more. */
  | 'directory_listing'
  /** A shell that renders nothing without a browser. */
  | 'js_shell'
  /** Nothing at all came back. */
  | 'empty'
  /** Something came back, too little to judge, and it named itself as nothing. */
  | 'too_short'

export type PageRead =
  | { ok: true;  text: string }
  | { ok: false; reason: UnreadableReason; detail: string }

/**
 * A page that returns 200 and says it is missing.
 *
 * Both halves are required. "Page not found" alone appears in the body of real
 * pages (a site's own help text, a 404-handling explainer); paired with a bare
 * `404` in the same window it is the page itself.
 */
const NOT_FOUND_PHRASES = [
  'not found', 'no longer here', 'could not be found', 'page you are looking for',
  'page does not exist', 'seems to have moved', 'requested resource was not found',
]

/** A web server serving its filesystem instead of a site. */
const DIRECTORY_INDEX = /^\s*index of \//i

/** Below this, a page has not said enough to classify. A BACKSTOP, not the test. */
export const MIN_USEFUL_CHARS = 400

export function classifyPage(text: string | null | undefined): PageRead {
  const t = (text ?? '').trim()
  if (t.length === 0) return { ok: false, reason: 'empty', detail: 'the page returned no text at all' }

  const head = t.slice(0, IDENTIFYING_WINDOW).toLowerCase()

  // 1. Interception. First, because a wall is the case that most looks like a
  //    page and most needs a different response from every other failure.
  const wall = botWallSignature(t)
  if (wall) return { ok: false, reason: 'bot_wall', detail: `bot-wall signature: "${wall}"` }

  // 2. The server is serving a filesystem. thefsi.org, 133 characters.
  if (DIRECTORY_INDEX.test(t)) {
    return { ok: false, reason: 'directory_listing', detail: 'a bare web-server directory index, not a site' }
  }

  // 3. A 200 that says 404. Needs the numeral AND the wording, in the window.
  if (/\b404\b/.test(head) && NOT_FOUND_PHRASES.some(p => head.includes(p))) {
    return { ok: false, reason: 'soft_404', detail: 'HTTP 200 on a page that says it is a 404' }
  }

  // 4. A shell that needs a browser. Distinct from a wall: nobody is blocking
  //    us, the page simply has no server-rendered content.
  if (t.length < MIN_USEFUL_CHARS && /enable\s+(js|javascript)|requires javascript|javascript is (required|disabled)/i.test(head)) {
    return { ok: false, reason: 'js_shell', detail: 'renders nothing without a browser' }
  }

  // 5. The backstop. Anything this short has not told us what it is.
  if (t.length < MIN_USEFUL_CHARS) {
    return { ok: false, reason: 'too_short', detail: `only ${t.length} characters returned, below the ${MIN_USEFUL_CHARS} floor` }
  }

  return { ok: true, text: t }
}

/**
 * Reasons that mean NOBODY READ THE PAGE, so nothing may be asserted about the
 * funder on the strength of it.
 *
 * `soft_404` and `directory_listing` are deliberately included: those are real
 * findings about the LINK, and the caller should raise them as such, but neither
 * licenses a statement about what the funder does or does not offer.
 */
const NOTHING_WAS_READ = new Set<UnreadableReason>([
  'bot_wall', 'soft_404', 'directory_listing', 'js_shell', 'empty', 'too_short',
])

export function nothingWasRead(reason: UnreadableReason): boolean {
  return NOTHING_WAS_READ.has(reason)
}

/**
 * Back-compatible shim for callers that only want the boolean.
 *
 * `probe-read-exhausted.ts` stores four reason strings of its own and maps onto
 * these; keeping the old shape means that mapping stays in one place rather than
 * being re-derived at each call site.
 */
export function looksLikeAWall(text: string): { walled: boolean; why: string } {
  const r = classifyPage(text)
  return r.ok ? { walled: false, why: '' } : { walled: true, why: r.detail }
}

/**
 * Has every attempt to read this row's page failed?
 *
 * Read from `field_evidence._read_exhausted`, written by
 * `scripts/probe-read-exhausted.ts`, which deletes the marker the moment either
 * path succeeds. So this is a live signal, not an accumulating one.
 *
 * Deliberately excludes `not_a_web_url`: that is a fact about the LINK rather
 * than about our ability to fetch it, and a `mailto:` apply_url is a real defect
 * a reviewer can act on. Suppressing findings against it would hide one.
 */
const UNREAD_MARKERS = new Set(['bot_wall', 'empty_page', 'both_paths_failed', 'soft_404', 'directory_listing'])

export function readBlockedByAWall(fieldEvidence: unknown): boolean {
  const ex = (fieldEvidence as Record<string, unknown> | null | undefined)?.['_read_exhausted'] as
    { reason?: string } | undefined
  return !!ex && UNREAD_MARKERS.has(String(ex.reason ?? ''))
}
