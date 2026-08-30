import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Signed unsubscribe tokens for the new-opportunity alert email.
 *
 * The link has to work for someone who is logged out, on a phone, who may not
 * remember having an account. That rules out anything that resolves through
 * the session, and it rules out a bare org id in the URL — that would let
 * anyone unsubscribe anyone by editing a uuid.
 *
 * So: HMAC over the org id. No database column, no migration, no expiry. An
 * unsubscribe link must not stop working because it sat in an inbox for six
 * months; the whole point is that it is the escape hatch of last resort.
 *
 * The token is not a capability for anything except turning alerts OFF. It
 * grants no read access and cannot re-enable anything, so the blast radius of
 * a leaked one is that a person stops getting email they can switch back on
 * from the profile page.
 */

/** Server-side only. Never import this into a client component. */
function secret(): string {
  // ALERT_UNSUBSCRIBE_SECRET is the intended key. CRON_SECRET is the fallback
  // so the first send is not blocked on adding an env var, and because any
  // environment that can run the alert cron necessarily already has it.
  const s = process.env.ALERT_UNSUBSCRIBE_SECRET || process.env.CRON_SECRET
  if (!s) {
    throw new Error(
      'No ALERT_UNSUBSCRIBE_SECRET or CRON_SECRET set — refusing to build an ' +
      'unsubscribe token that cannot be verified later.',
    )
  }
  return s
}

function sign(orgId: string): string {
  return createHmac('sha256', secret()).update(`unsub:${orgId}`).digest('base64url')
}

/** `<orgId>.<signature>` — safe to put in a URL and in a mail header. */
export function unsubscribeToken(orgId: string): string {
  return `${orgId}.${sign(orgId)}`
}

/**
 * Returns the org id if the token is authentic, else null.
 *
 * Compared with timingSafeEqual rather than `===`. The comparison is cheap to
 * do properly and a byte-at-a-time early return is exactly the kind of thing
 * that is embarrassing to explain later.
 */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null

  const orgId = token.slice(0, dot)
  const given = token.slice(dot + 1)
  if (!orgId || !given) return null

  let expected: string
  try {
    expected = sign(orgId)
  } catch {
    return null
  }

  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on a length mismatch, which is itself a leak of one
  // bit, but a wrong length here means a malformed token rather than a near
  // miss, so rejecting outright is correct.
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? orgId : null
}

/** The link that goes in the email body and the List-Unsubscribe header. */
export function unsubscribeUrl(origin: string, orgId: string): string {
  return `${origin}/api/alerts/unsubscribe?t=${encodeURIComponent(unsubscribeToken(orgId))}`
}
