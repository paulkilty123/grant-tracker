import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Signed removal tokens for the waitlist acknowledgement.
 *
 * Same shape and same reasoning as `alerts-unsubscribe.ts`: the link has to
 * work for somebody logged out, on a phone, who filled in a form on a landing
 * page days ago. That rules out the session, and a bare row id in the URL
 * would let anyone remove anyone by editing a uuid.
 *
 * The token is over the ROW ID, not the address. An unsubscribe link sits in
 * an inbox and gets forwarded, quoted and indexed; putting the subscriber's
 * email in the query string puts it in every one of those places for no gain.
 *
 * No expiry. A removal link must not stop working because it sat unread for
 * six months, which is the whole point of it.
 *
 * The blast radius of a leaked token is that somebody is taken OFF a list.
 * It grants no read access and cannot add anyone.
 */

/** Server-side only. Never import this into a client component. */
function secret(): string {
  // Shares ALERT_UNSUBSCRIBE_SECRET so a rotation is one variable, not two,
  // and falls back to CRON_SECRET for the same reason alerts does: any
  // environment that can send this email already has it.
  const s = process.env.ALERT_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET
  if (!s) {
    throw new Error(
      'No ALERT_UNSUBSCRIBE_SECRET or CRON_SECRET set — refusing to build a ' +
      'waitlist removal token that cannot be verified later.',
    )
  }
  return s
}

// The prefix is what stops a token minted here being replayed against the
// alert unsubscribe route, and vice versa. Same key, different domain.
function sign(rowId: string): string {
  return createHmac('sha256', secret()).update(`waitlist:${rowId}`).digest('base64url')
}

/** `<rowId>.<signature>` — safe to put in a URL. */
export function waitlistRemovalToken(rowId: string): string {
  return `${rowId}.${sign(rowId)}`
}

/** Returns the row id if the token is authentic, else null. */
export function verifyWaitlistRemovalToken(token: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const rowId = token.slice(0, dot)
  const given = token.slice(dot + 1)

  const expected = sign(rowId)
  // Compared with timingSafeEqual rather than `===`, which needs equal
  // lengths, so check that first and bail before the comparison throws.
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? rowId : null
}

/** The full link that goes in the email. */
export function waitlistRemovalUrl(origin: string, rowId: string): string {
  return `${origin}/api/waitlist/unsubscribe?t=${encodeURIComponent(waitlistRemovalToken(rowId))}`
}
