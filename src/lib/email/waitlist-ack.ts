import { esc } from '@/lib/digest/text'
import { UI, BODY, C, logoLockup } from './tokens'

/**
 * The waitlist acknowledgement — template C of the first-run set.
 *
 * WHAT THIS EMAIL IS FOR. Somebody typed their address into a form on the
 * landing page and got a green tick. Until now that was the entire
 * relationship: `api/waitlist` wrote a row and returned. Fifteen people had
 * done it by 5 September and none of them had heard anything, while the form
 * kept promising to tell them when we open.
 *
 * So this email has exactly one job, and it is not marketing: confirm the
 * address landed somewhere, say when the next email arrives, and say that
 * nothing else will arrive before it. A waitlist that goes quiet reads as a
 * waitlist that lost you.
 *
 * WHAT IS DELIBERATELY NOT HERE.
 *
 *   - No "browse the catalogue" button. The reference mock has one, and there
 *     is nowhere for it to go: `/grants/[id]` pages are public and indexed,
 *     but there is no public index a human can browse. A button promising a
 *     catalogue that resolves to one arbitrary grant page is worse than no
 *     button, and inventing the index three days before launch is a product
 *     decision rather than a copy one. Flagged rather than faked.
 *
 *   - No trial or free-plan language. `TRIAL_IS_LIVE` is false, and the same
 *     rule that governs the Connect page governs this.
 *
 *   - No launch DATE, only "later this week". Sent Monday 7 September for a
 *     Thursday launch (Paul, 2026-09-05). If Thursday slips to Friday it is
 *     still true; a named day would be a broken promise sitting in an inbox.
 *     "Later this week", not "aiming to": a hedge reads as doubt, and doubt
 *     in the first email carries into the second.
 *
 * HOUSE COPY. No dashes anywhere in the user-facing strings — commas and full
 * stops. The reference mock uses em dashes throughout; CLAUDE.md's house copy
 * rule wins, and this is the version to copy from.
 */

export interface WaitlistAckOptions {
  /** Absolute origin, no trailing slash. Links and the logo resolve from it. */
  origin: string
  /** Signed link that takes this person off the list. */
  removalUrl: string
}

export const WAITLIST_ACK_SUBJECT = 'You are on the list for Shoots'

const PREHEADER =
  'We open later this week. One email the morning we do, then nothing else before then.'

/** Plain-text alternative. Sent alongside the HTML, not instead of it. */
export function renderWaitlistAckText(opts: WaitlistAckOptions): string {
  return [
    'You are on the list',
    '',
    'Thanks for signing up. Shoots opens later this week. You will get one',
    'email the morning it does, with a link straight to signup, and setting',
    'up takes about five minutes.',
    '',
    'That is the only other email you will get before then.',
    '',
    `Take me off the list: ${opts.removalUrl}`,
    '',
    'Shoots, funding for UK charities and social enterprises',
    opts.origin.replace(/^https?:\/\//, ''),
  ].join('\n')
}

export function renderWaitlistAck(opts: WaitlistAckOptions): string {
  const { origin, removalUrl } = opts

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(WAITLIST_ACK_SUBJECT)}</title>
<!--[if mso]><style>* { font-family: Arial, sans-serif !important; }</style><![endif]-->
<style>
  /* Fluid to 600px, same as the digest. A fixed 600 makes a 375px phone zoom
     out to fit and shrinks every size in the email by a third. */
  @media only screen and (max-width: 600px) {
    .gutter { padding-left: 18px !important; padding-right: 18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(PREHEADER)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
<tr><td align="center" style="padding:20px 12px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

<tr><td class="gutter" style="padding:8px 6px 20px;line-height:0;">
  ${logoLockup(origin)}
</td></tr>

<tr><td class="gutter" style="background:${C.page};border-radius:16px 16px 0 0;padding:30px 30px 0;">
  <p style="margin:0 0 10px;font-family:${UI};font-size:24px;font-weight:600;letter-spacing:-.4px;color:${C.deep};line-height:1.25;">You are on the list</p>
  <p style="margin:0 0 20px;font-family:${BODY};font-size:15.5px;line-height:1.65;color:${C.deep};">Thanks for signing up. Shoots opens later this week. You will get one email the morning it does, with a link straight to signup, and setting up takes about five minutes.</p>
</td></tr>

<tr><td class="gutter" style="background:${C.page};border-radius:0 0 16px 16px;padding:4px 30px 30px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.rule};padding-top:18px;">
    <p style="margin:0;font-family:${BODY};font-size:13.5px;line-height:1.6;color:${C.body};">That is the only other email you will get before then. <a href="${esc(removalUrl)}" style="color:${C.deep};font-weight:600;text-decoration:underline;">Take me off the list</a>.</p>
  </td></tr></table>
</td></tr>

<tr><td class="gutter" style="padding:22px 30px 0;">
  <p style="margin:0;font-family:${BODY};font-size:12.5px;line-height:1.6;color:${C.muted};">Shoots, funding for UK charities and social enterprises<br><a href="${origin}" style="color:${C.deep};font-weight:600;text-decoration:underline;">${esc(origin.replace(/^https?:\/\//, ''))}</a></p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}
