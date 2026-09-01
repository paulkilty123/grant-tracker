// Is this "page" a bot wall rather than the funder's page?
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS ITS OWN MODULE
//
// A Cloudflare interstitial is a successful HTTP response: 200, text/html,
// real prose. Nothing about the transport says it failed. So a reader that
// judges by status code accepts it, and a reader that judges by LENGTH accepts
// it too — the artscouncil.org.uk interstitial is 268 characters through the
// reader proxy and 491 through a direct fetch, both comfortably above any floor
// anyone has picked.
//
// This mattered because two readers had two different answers. `probe-read-
// exhausted.ts` had a signature list and a 400-character floor and got it
// right. `verify-row.ts` — the one that actually WRITES verdicts — had
// `text.length < 200` and got it wrong, so the interstitial was passed to the
// model as though it were the funder's page. The model answered honestly that
// the fund is not described on it, and the row was stamped
// `fixable_link: wrong_fund`.
//
// Measured on the review queue, 2026-09-01: 21 of the 87 rows carrying "the
// page does not describe this fund" were pointing at a bot wall. Thirteen of
// those already carried `_read_exhausted.reason = 'bot_wall'` — the system knew,
// in writing, that it had never read the page, and told the reviewer the funder
// was at fault anyway.
//
// The rule this encodes: A BOT CHECK IS A SUCCESSFUL HTTP RESPONSE CONTAINING
// PROSE. Size is not the distinguishing feature and never was. The signatures
// are the real test; the floor is only a backstop for empty and near-empty
// responses.

/**
 * Phrases that only ever appear on an interception page.
 *
 * Matched against the first 1,200 characters, lower-cased. A funder page that
 * happens to discuss CAPTCHAs further down is not a wall; a wall says so at the
 * top, because saying so is the entire content of the page.
 */
export const WALL_SIGNATURES = [
  'just a moment',
  'performing security verification',
  'security service to protect',
  'request unsuccessful',
  'incapsula incident',
  'attention required',
  'verify you are human',
  'verifying you are human',
  'checking your browser',
  'please wait while',
  'enable javascript and cookies',
  'access denied',
  'ddos protection',
  'unusual traffic',
  'captcha',
  // Imperva/Distil wording seen on coop.co.uk — 678 characters of apology and
  // no page. Long enough to clear every floor in the codebase.
  'pardon our interruption',
  'made us think you were a bot',
]

/**
 * Below this, there is nothing to judge whether it is a wall or not.
 *
 * A backstop, not the test. Kept at the probe's existing 400 rather than
 * verify-row's 200, because 200 was chosen before anyone had measured an
 * interstitial and every one measured since has been above it.
 */
export const MIN_USEFUL_CHARS = 400

export type WallVerdict = { walled: boolean; why: string }

export function looksLikeAWall(text: string): WallVerdict {
  const t = (text ?? '').trim()
  if (t.length === 0) return { walled: true, why: 'the page returned no text at all' }
  if (t.length < MIN_USEFUL_CHARS) {
    return { walled: true, why: `only ${t.length} characters returned, below the ${MIN_USEFUL_CHARS} floor` }
  }
  const lower = t.slice(0, 1200).toLowerCase()
  const hit = WALL_SIGNATURES.find(s => lower.includes(s))
  return hit ? { walled: true, why: `bot-wall signature: "${hit}"` } : { walled: false, why: '' }
}

/**
 * Reasons `_read_exhausted` records that mean NOBODY HAS READ THE PAGE.
 *
 * Distinct from `not_a_web_url`, which is a fact about the link rather than
 * about our ability to fetch it: a `mailto:` apply_url is a real defect a
 * reviewer can act on, and suppressing findings against it would hide one.
 */
const UNREAD_REASONS = new Set(['bot_wall', 'empty_page', 'both_paths_failed'])

/**
 * Has every attempt to read this row's page failed?
 *
 * Read from `field_evidence._read_exhausted`, written by
 * `scripts/probe-read-exhausted.ts`, which deletes the marker the moment either
 * path succeeds. So this is a live signal, not an accumulating one.
 *
 * Used to withdraw claims ABOUT THE PAGE from a row whose page was never read.
 * Deliberately not used to withdraw claims about the LINK — an unreachable link
 * is still a finding, and `read_exhausted` files it under "Nothing more we can
 * do", which is the honest place for it.
 */
export function readBlockedByAWall(fieldEvidence: unknown): boolean {
  const ex = (fieldEvidence as Record<string, unknown> | null | undefined)?.['_read_exhausted'] as
    { reason?: string } | undefined
  return !!ex && UNREAD_REASONS.has(String(ex.reason ?? ''))
}
