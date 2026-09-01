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
  /** The domain has lapsed and is being sold. The funder is not coming back to it. */
  | 'parked_domain'
  /** The page is a meta-refresh stub. The real URL is in the tag: repoint, do not retire. */
  | 'meta_refresh'
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

/**
 * The domain lapsed and a registrar is selling it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS ITS OWN REASON RATHER THAN `empty` OR `directory_listing`
 *
 * Found by the watchlist session on 2026-09-01 and verified here. pilabs.co
 * serves 114 bytes whose entire body is
 *
 *   <script>window.onload=function(){window.location.href="/lander"}</script>
 *
 * and `/lander` is GoDaddy's "The domain name Pilabs.co is for sale!" page.
 * Both halves defeat a different check, and the second is the dangerous one:
 *
 *   the stub    extracts to ZERO TEXT, because htmlToText strips scripts. So it
 *               lands on `empty` — which this module now treats as SELF-RESOLVING,
 *               on the Hygiene Bank evidence. A parked domain would therefore
 *               rotate for ever, which is the opposite of what it needs.
 *   the lander  is 694 characters of real prose and passes every check there is.
 *               Anything that follows the redirect fingerprints a domain-sale
 *               page as the funder's own.
 *
 * The second is the same class as the bot wall: a page that looks like content
 * and is not the funder's. That is what earns it a name rather than a fold into
 * `directory_listing` — the action is the same, retire, but neither the
 * detector nor the admin line can be shared, and "directory listing" on a
 * domain-sale page would be a false explanation.
 *
 * THE PAIRING IS REQUIRED. "domain" alone appears on funder pages — a tech-for-
 * good funder discussing domain names is ordinary — so every signature here
 * carries the sale, not just the noun.
 */
const PARKED_SIGNATURES = [
  'domain name is for sale',
  'this domain is for sale',
  'domain is for sale',
  'is for sale!',
  'buy this domain',
  'lease to own',
  'the domain name',
  'domain for sale',
  'this domain has expired',
  'domain is available for purchase',
  'hugedomains',
  'afternic',
  'sedoparking',
  'sedo.com',
  'dan.com',
]

/**
 * Sedo's lander titles itself `<domain> - <name> Resources and Information.`
 *
 * mustardseedmaze.com serves exactly that and NONE of the sale phrases above
 * appear in what production extracts, so the signature list missed it entirely.
 * Matched as a pattern rather than a phrase because "resources and information"
 * on its own is ordinary English that a funder could reasonably use; anchored to
 * a bare domain and a dash, it is the vendor's template.
 */
const PARKED_TITLE = /\b[a-z0-9-]+\.(com|co\.uk|org|net|io|uk)\s*[-–—]\s*[^.]{0,60}resources and information/i

/**
 * An attribute only ad-serving parking pages carry. Present in the raw HTML of
 * mustardseedmaze.com and invisible after extraction.
 */
const PARKED_HTML = /data-adblockkey=/i

/**
 * A document whose only content is a redirect.
 *
 * Needs the RAW HTML, because text extraction is exactly what destroys the
 * evidence: strip the script and nothing is left, so the caller sees `empty` and
 * cannot tell a parked domain from a flaky fetch. Optional, so a caller with
 * only text keeps the previous behaviour.
 *
 * Bounded by length: a real page can carry a redirect script somewhere in a
 * large document, and this is only interested in one that IS the document.
 */
const REDIRECT_ONLY_BYTES = 600

const REDIRECT_STUB = /window\.location|location\.href|location\.replace/i

/**
 * A page that is nothing but `<meta http-equiv="refresh">`.
 *
 * SEPARATED FROM `parked_domain` ON 2026-09-01, having briefly been folded into
 * it, which was wrong in both directions. sheffield.gov.uk/grants is 446 bytes
 * of meta refresh and was being reported as a domain for sale; sutton.gov.uk's
 * is 646 bytes and cleared the stub's byte bound entirely, so it was reported as
 * an empty page. Neither is a parked domain and neither is empty: both are
 * COUNCIL PAGES THAT MOVED, and the real pages behind them are 162,199 and
 * 51,651 bytes.
 *
 * This is the actionable reason in the set. Every other one says a page cannot
 * be read; this one says where the page went, because the destination is right
 * there in the tag. We follow HTTP 3xx and not meta refresh, so anything reading
 * a council site hits this — the watchlist found five in a single pass.
 *
 * No byte bound, deliberately. The test is that the document produced NO TEXT,
 * which is what a stub does; a real page that happens to carry a refresh tag has
 * content, and its content is what matters.
 */
const META_REFRESH = /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=['"]?([^"'>]+)/i

/** Below this, a page has not said enough to classify. A BACKSTOP, not the test. */
export const MIN_USEFUL_CHARS = 400

export function classifyPage(
  text: string | null | undefined,
  /** The raw HTML, when the caller has it. Only the parked-domain stub needs it:
   *  the signal is a script tag, and extracting text destroys it. */
  html?: string | null,
): PageRead {
  const t = (text ?? '').trim()

  // A redirect stub is checked BEFORE the empty test, because that is the test
  // it would otherwise fall into — and `empty` is self-resolving, so a dead
  // domain would rotate for ever.
  const raw = (html ?? '').trim()

  // A page that moved. Checked first because the answer is a URL rather than a
  // verdict, and because both other stub tests would claim it wrongly.
  //
  // BELOW THE FLOOR, not zero. The first version tested `t.length === 0` and
  // would have missed the real thing: sutton.gov.uk/w/local-funding is 646 bytes
  // and its body says "Redirecting to /committees-and-elections/...", so it
  // extracts to roughly 250 characters rather than none. Production happened to
  // report zero for that URL, which is what made the wrong condition look right.
  // A stub's only text is its own redirect notice, so the floor is the honest
  // test and a real page clears it.
  const moved = t.length < MIN_USEFUL_CHARS ? raw.match(META_REFRESH) : null
  if (moved) {
    return { ok: false, reason: 'meta_refresh',
             detail: `the page redirects to ${moved[1].trim().slice(0, 200)} via a meta refresh, which we do not follow` }
  }

  if (raw && raw.length <= REDIRECT_ONLY_BYTES && REDIRECT_STUB.test(raw) && t.length === 0) {
    return { ok: false, reason: 'parked_domain',
             detail: `${raw.length} bytes whose only content is a redirect, which is how a parked domain answers` }
  }

  // WHY THERE IS NO "LARGE HTML AND NO TEXT MEANS A SHELL" RULE HERE.
  //
  // There was one, for about an hour on 2026-09-01, and it was wrong in the
  // destructive direction. `js_shell` is NOT self-resolving, so labelling a page
  // that way stops a watcher permanently — and the inference cannot support
  // that weight, because at least three different things produce a big document
  // with no extractable text:
  //
  //   a genuine client-side shell
  //   a page our egress is blocked from, which still answers with something
  //   a page that read badly once
  //
  // Both of the examples it was built on turned out to be the other two.
  // southwark.gov.uk returns 32,609 bytes to this machine and ZERO characters
  // AND ZERO LINKS to production, so the document production receives is not the
  // document — that is an egress difference, not a rendering one. And
  // wellcome.org, which the rule was written around, reads perfectly from
  // production an hour later: 7,702 characters and 48 links. One bad read.
  //
  // So an absence stays `empty`, which is self-resolving and keeps the row in
  // rotation. Naming something a permanent fault requires POSITIVE evidence of
  // that fault, and "no text came out" is evidence of nothing in particular.
  if (t.length === 0) return { ok: false, reason: 'empty', detail: 'the page returned no text at all' }

  const head = t.slice(0, IDENTIFYING_WINDOW).toLowerCase()

  // 1. Interception. First, because a wall is the case that most looks like a
  //    page and most needs a different response from every other failure.
  const wall = botWallSignature(t)
  if (wall) return { ok: false, reason: 'bot_wall', detail: `bot-wall signature: "${wall}"` }

  // 2. A registrar selling the domain. Checked before the 404 and directory
  //    tests because a lander is long, prose-rich, and would otherwise sail
  //    through as a readable page.
  const parked = PARKED_SIGNATURES.find(p => head.includes(p))
  if (parked) {
    return { ok: false, reason: 'parked_domain', detail: `the domain is being sold: "${parked}"` }
  }
  if (PARKED_TITLE.test(head) || (raw && PARKED_HTML.test(raw.slice(0, 2000)))) {
    return { ok: false, reason: 'parked_domain', detail: 'a registrar parking page, by its title and markup' }
  }

  // 3. The server is serving a filesystem. thefsi.org, 133 characters.
  if (DIRECTORY_INDEX.test(t)) {
    return { ok: false, reason: 'directory_listing', detail: 'a bare web-server directory index, not a site' }
  }

  // 4. A 200 that says 404. Needs the numeral AND the wording, in the window.
  if (/\b404\b/.test(head) && NOT_FOUND_PHRASES.some(p => head.includes(p))) {
    return { ok: false, reason: 'soft_404', detail: 'HTTP 200 on a page that says it is a 404' }
  }

  // 5. A shell that needs a browser. Distinct from a wall: nobody is blocking
  //    us, the page simply has no server-rendered content.
  if (t.length < MIN_USEFUL_CHARS && /enable\s+(js|javascript)|requires javascript|javascript is (required|disabled)/i.test(head)) {
    return { ok: false, reason: 'js_shell', detail: 'renders nothing without a browser' }
  }

  // 6. The backstop. Anything this short has not told us what it is.
  if (t.length < MIN_USEFUL_CHARS) {
    return { ok: false, reason: 'too_short', detail: `only ${t.length} characters returned, below the ${MIN_USEFUL_CHARS} floor` }
  }

  return { ok: true, text: t }
}

/**
 * Can this reason stop being true on its own?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A DIFFERENT QUESTION FROM ANY OTHER PREDICATE HERE
 *
 * Written for the watchlist, which has a decision the verification engine does
 * not: whether to STOP WATCHING a page for ever. That is destructive — a funder
 * that leaves the rotation is a funder nothing will look at again — so it needs
 * a different test from "did today's read work".
 *
 * The parallel watchlist session got this right and I got it wrong, so the
 * reasoning is recorded rather than just the answer. I argued that resuming a
 * stopped watcher should need two consecutive GOOD reads, to mirror the two
 * consecutive failures required to stop. That is wrong, and wrong in a way that
 * would have been permanent: a walled host by definition does not produce good
 * reads, so the rule would have kept every genuinely walled funder stopped for
 * ever. Barnet and Sobell both failed twice running and both belong in the
 * rotation, because A WALL LIFTING IS PRECISELY THE EVENT THE WATCHLIST EXISTS
 * TO CATCH.
 *
 * The asymmetry is not between stopping and resuming. It is that STOPPING is the
 * destructive move and must be expensive, while resuming costs one fetch per
 * rotation and an honest error line. Getting a stop wrong took three working
 * funders out of intake in one afternoon; getting a resume wrong costs a log
 * entry.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `empty` IS TRUE HERE, AND THAT IS A DELIBERATE DISAGREEMENT
 *
 * The mapping proposed alongside this had `empty` as non-self-resolving. This
 * repo already documents the opposite, in the comment that justifies the
 * two-failure rule: The Hygiene Bank returned zero characters on one probe and a
 * full page four minutes later. An empty response is a flaky fetch at least as
 * often as it is a dead site, so treating it as permanent is the exact mistake
 * that rule was written to prevent.
 *
 * The Pi Labs stop that prompted the mapping is still right, and this does not
 * weaken it — because that decision does not rest on the reason. It rests on two
 * consecutive empty reads AND a history of never once having produced a
 * fingerprint. That third clause is doing the work, and a caller stopping a
 * watcher should require it explicitly rather than reading it out of the reason.
 *
 * Deliberately kept SEPARATE from `isHostLevel` in host-backoff.ts, which asks
 * whether a reason is worth remembering per host rather than per URL. The two
 * axes disagree on `directory_listing` — not worth a host backoff, because one
 * dead path says nothing about the domain, but genuinely permanent for the URL
 * itself — and both are right for their own question. Merging them would force
 * one answer where there are two.
 */
const SELF_RESOLVING: ReadonlySet<UnreadableReason> = new Set<UnreadableReason>([
  // A WAF's mood, an IP reputation, a rate limit. Lifts without anyone acting.
  'bot_wall',
  // A partial render or a truncated response. Sobell returned 608 characters
  // earlier the same day it returned 83.
  'too_short',
  // The URL is wrong today and the funder may restore the page. It does not
  // resolve on its own in the way a wall does, but the watchlist exists to catch
  // a page appearing, and one fetch a rotation is the whole cost of finding out.
  'soft_404',
  // The Hygiene Bank: zero characters, then a full page four minutes later.
  'empty',
])

/**
 * Reasons a caller may stop watching for. Everything else keeps rotating.
 *
 * `js_shell`, `directory_listing`, `parked_domain` and `meta_refresh` are the
 * four: a page that renders nothing without a browser is a property of how the
 * site is built, a bare directory index means the site is not serving a site at
 * all, a domain a registrar is selling is not one the funder is coming back to,
 * and a stub that redirects will go on redirecting until somebody repoints the
 * row. None changes on its own.
 *
 * `meta_refresh` is the odd one: not self-resolving, but not a reason to RETIRE
 * either. The detail carries the destination, so the action is to repoint. A
 * caller that treats every non-self-resolving reason as "retire" would throw
 * away five working council pages, which is what the watchlist nearly did.
 */
export function selfResolving(reason: UnreadableReason): boolean {
  return SELF_RESOLVING.has(reason)
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
  'bot_wall', 'soft_404', 'directory_listing', 'parked_domain', 'meta_refresh',
  'js_shell', 'empty', 'too_short',
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
