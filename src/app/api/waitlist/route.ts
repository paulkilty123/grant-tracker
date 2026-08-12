import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { enforceInferenceRateLimit } from '@/lib/mcp-rate-limit'

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

  const { error } = await getAdminDb()
    .from('waitlist_signups')
    .insert({ email: trimmedEmail, source: resolvedSource })

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

  return NextResponse.json({ success: true })
}
