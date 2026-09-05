import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getAdminDb } from '@/lib/admin/admin-db'
import { enforceInferenceRateLimit } from '@/lib/mcp-rate-limit'
import { EMAIL_FROM_HEADER, EMAIL_APP_URL, EMAIL_REPLY_TO } from '@/lib/mcp-brand'
import { waitlistRemovalUrl } from '@/lib/waitlist-unsubscribe'
import {
  renderWaitlistAck, renderWaitlistAckText, WAITLIST_ACK_SUBJECT,
} from '@/lib/email/waitlist-ack'

/**
 * Waitlist signup, posted by the static landing document at
 * public/landing/index.html.
 *
 * The submission IS the consent event: the privacy policy's basis for
 * marketing to these addresses rests on being able to show when someone
 * submitted the form, so the row's created_at is the record and the table
 * comment says so. A repeat submission keeps the ORIGINAL timestamp rather
 * than refreshing it, because the first submission is the consent.
 *
 * Rate limiting rides on enforceInferenceRateLimit, the same fail-CLOSED
 * limiter as the signup path, with signup's numbers. Fail-closed is the right
 * direction here for the same reason it is there: this is an unauthenticated
 * write with no other brake on it, so an Upstash outage must stop signups
 * rather than let a script fill the table. The MCP limiters fail open, and
 * borrowing those would have been the wrong posture.
 */

export const dynamic = 'force-dynamic'

// Vercel-style X-Forwarded-For parsing. First entry is the real client IP.
// Same shape as extractClientIP in mcp-middleware.
function extractClientIP(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

// Deliberately permissive: shape only, no TLD allowlist. Anything stricter
// rejects real addresses, and a wrong address costs a lost signup rather than
// anything dangerous. This is also what lets a .invalid address through for
// end-to-end verification.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LEN = 254

/** Surfaces allowed to write here. Unknown values are stored as 'other'. */
const KNOWN_SOURCES = new Set(['landing'])

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })
  }

  const { email, source } = (body ?? {}) as { email?: unknown; source?: unknown }

  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.trim().length > MAX_EMAIL_LEN) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  const trimmedEmail = email.trim()
  const resolvedSource =
    typeof source === 'string' && KNOWN_SOURCES.has(source) ? source : 'other'

  // Per-IP ceiling, checked before the write. Fails closed: on
  // limiter_unavailable we refuse rather than accept unbounded submissions.
  const limit = await enforceInferenceRateLimit({
    scope: 'waitlist',
    identifier: `ip:${extractClientIP(req)}`,
    perHour: 5,
    perDay: 20,
  })
  if (!limit.allowed) {
    if (limit.reason === 'limiter_unavailable') {
      return NextResponse.json(
        { error: 'We could not accept signups just now. Please try again shortly.' },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: 'That is a few too many attempts. Please try again later.' },
      { status: 429, headers: limit.retry_after ? { 'Retry-After': String(limit.retry_after) } : undefined },
    )
  }

  const { data: inserted, error } = await getAdminDb()
    .from('waitlist_signups')
    .insert({ email: trimmedEmail, source: resolvedSource })
    .select('id')
    .single()

  if (error) {
    // 23505 is the unique violation on lower(email). Already on the list is a
    // success from the visitor's point of view, and answering differently
    // would turn this endpoint into an oracle for who has signed up.
    if (error.code === '23505') {
      return NextResponse.json({ success: true, already: true })
    }
    console.error('[waitlist] insert failed:', error.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  // The acknowledgement. Deliberately AFTER the row is committed and outside
  // the success path's control flow: being on the list is the thing the
  // visitor asked for, and it has already happened. A Resend outage must not
  // turn a stored signup into an error page that invites them to submit again.
  //
  // Not sent on the 23505 branch above. A repeat submission means they are
  // already on the list and have already been acknowledged; re-sending would
  // make the form a way to mail an address repeatedly.
  await sendAck(inserted.id, trimmedEmail)

  return NextResponse.json({ success: true })
}

/**
 * Send the acknowledgement and record that we did.
 *
 * Swallows its own failures ON PURPOSE, and shouts about them. The caller's
 * response is already decided by the time this runs.
 *
 * `ack_sent_at` is stamped only on a confirmed send, so a failure here leaves
 * the row pending and the backfill script picks it up on the next run. That is
 * the safe direction: the cost of a miss is one late email, the cost of
 * stamping optimistically is somebody who never hears from us and whom nothing
 * will ever retry.
 */
async function sendAck(rowId: string, to: string): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Local dev has no key. Say so rather than failing silently, because "no
    // email arrived" and "no sender configured" look identical from outside.
    console.warn('[waitlist] RESEND_API_KEY not set — acknowledgement not sent to', to)
    return
  }

  try {
    const removalUrl = waitlistRemovalUrl(EMAIL_APP_URL, rowId)
    const { error } = await new Resend(key).emails.send({
      from: EMAIL_FROM_HEADER,
      // Nothing in this email asks for a reply, but somebody will send one,
      // and alerts@ is not read. A reply-to costs a header and is the
      // difference between a question reaching a person and vanishing.
      replyTo: EMAIL_REPLY_TO,
      to,
      subject: WAITLIST_ACK_SUBJECT,
      html: renderWaitlistAck({ origin: EMAIL_APP_URL, removalUrl }),
      text: renderWaitlistAckText({ origin: EMAIL_APP_URL, removalUrl }),
      headers: {
        // One-click removal from the client's own chrome. Gmail and Outlook
        // both surface it, and a reader who uses it does not press "spam"
        // instead, which is what actually protects the sending domain.
        'List-Unsubscribe': `<${removalUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
    if (error) {
      console.error('[waitlist] acknowledgement refused by Resend:', error.message)
      return
    }

    const { error: stampError } = await getAdminDb()
      .from('waitlist_signups')
      .update({ ack_sent_at: new Date().toISOString() })
      .eq('id', rowId)
    if (stampError) {
      // The email went out and the row does not know it. Loud, because the
      // backfill will now send a second copy to this person.
      console.error(
        '[waitlist] SENT but failed to stamp ack_sent_at for row', rowId,
        '— backfill will duplicate:', stampError.message,
      )
    }
  } catch (e) {
    console.error('[waitlist] acknowledgement threw:', e instanceof Error ? e.message : e)
  }
}
