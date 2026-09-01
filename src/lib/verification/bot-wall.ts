// One detector: is this response an interception page?
//
// It used to be the whole story, and that was the mistake. A bot wall is only
// one of the ways a fetch returns 200 and no funder page — soft 404s, directory
// listings and JS shells all look identical to a length check, and each needs a
// different response. The contract that distinguishes them lives in
// `page-readable.ts`; this file is the detector that answers one question for it.
//
// WHY THE SIGNATURES ARE THE TEST AND SIZE IS NOT
//
// A bot check is a successful HTTP response containing prose. Measured from
// production's egress on 2026-09-01: Cloudflare's interstitial is 268 characters
// through the reader proxy and 491 direct, Imperva's is 678. `verify-row.ts`
// used `text.length < 200`, so all three cleared it, went to the model as though
// they were the funder's page, and came back — correctly — saying the fund was
// not on it. That was then written to the row as `fixable_link: wrong_fund`, a
// claim about the funder.
//
// 21 of the 87 rows carrying that verdict were bot walls. 13 already had
// `_read_exhausted.reason = 'bot_wall'` written against them by
// `probe-read-exhausted.ts`, which has had this list all along. Two readers, two
// answers about one page, and the one that was wrong wrote the verdicts.

/**
 * Phrases that only ever appear on an interception page.
 *
 * Matched against the first 1,200 characters only. That bound is what makes a
 * signature list safe: a wall says what it is at the top, because saying so is
 * the entire content of the page, whereas a cyber-security funder mentioning
 * DDoS protection does it somewhere in its own prose. Both directions are
 * tested in `page-readable.test.ts`.
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
  // Imperva/Distil wording, seen on coop.co.uk at 678 characters — long enough
  // to clear every floor anyone has picked.
  'pardon our interruption',
  'made us think you were a bot',
  // Bare "Cloudflare" is deliberately NOT here: a funder may say its site is
  // served through Cloudflare. The Ray ID only appears on the block page.
  'cloudflare ray id',
]

/** How much of a page identifies it. See the note on WALL_SIGNATURES. */
export const IDENTIFYING_WINDOW = 1200

/** The matched signature, or null. Null is not "readable" — see `classifyPage`. */
export function botWallSignature(text: string): string | null {
  const head = (text ?? '').trim().slice(0, IDENTIFYING_WINDOW).toLowerCase()
  return WALL_SIGNATURES.find(s => head.includes(s)) ?? null
}
