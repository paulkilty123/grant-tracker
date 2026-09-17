import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/admin/admin-db'
import { Resend } from 'resend'
import { enforceInferenceRateLimit } from '@/lib/mcp-rate-limit'
import { MCP_CONTACT_EMAIL } from '@/lib/mcp-brand'
import { EMAIL_FROM_HEADER, EMAIL_NOTIFY_TO, EMAIL_ACCENT, EMAIL_BRAND_HOST } from '@/lib/mcp-brand'

const FROM_EMAIL = EMAIL_FROM_HEADER
const NOTIFY_TO  = EMAIL_NOTIFY_TO


// Vercel-style X-Forwarded-For parsing. First entry is the real client IP.
// Same shape as the copy in api/waitlist, which says the same of mcp-middleware.
function extractClientIP(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

function adminClient() {
  return getAdminDb()
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  )
}

export async function POST(req: NextRequest) {
  // Per-IP ceiling, checked before anything is written or sent. Until this,
  // the route was an unauthenticated write that also triggered an outbound
  // email on every call, with no brake of any kind on either.
  //
  // Same limiter, posture and numbers as api/waitlist: fail CLOSED, because an
  // Upstash outage must stop unbounded submissions rather than wave them
  // through. Over-blocking costs a message that has an email address sitting
  // next to the form as a fallback, and the 503 copy names it.
  const limit = await enforceInferenceRateLimit({
    scope: 'contact',
    identifier: `ip:${extractClientIP(req)}`,
    perHour: 5,
    perDay: 20,
  })
  if (!limit.allowed) {
    if (limit.reason === 'limiter_unavailable') {
      return NextResponse.json(
        { error: `We could not accept messages just now. Please email ${MCP_CONTACT_EMAIL} instead.` },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: 'That is a few too many messages. Please try again later.' },
      { status: 429, headers: limit.retry_after ? { 'Retry-After': String(limit.retry_after) } : undefined },
    )
  }

  try {
    const { name, email, message } = await req.json()

    if (!message || message.trim().length < 5) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const trimmedName    = name?.trim()    || null
    const trimmedEmail   = email.trim()
    const trimmedMessage = message.trim()

    // Insert into feedback table. The table has no top-level `name` column —
    // surface the name through the `extra` jsonb instead.
    const { error: dbError } = await adminClient()
      .from('feedback')
      .insert({
        type: 'contact',
        email: trimmedEmail,
        message: trimmedMessage,
        extra: trimmedName ? { name: trimmedName } : {},
      })

    if (dbError) throw dbError

    // Notify Paul via Resend. Best-effort — if email send fails we still
    // return 200 because the submission is safely stored in the DB.
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: FROM_EMAIL,
          to: NOTIFY_TO,
          replyTo: trimmedEmail,
          subject: `New contact form message${trimmedName ? ` from ${trimmedName}` : ''}`,
          html: `
            <p><strong>From:</strong> ${escapeHtml(trimmedName ?? '(no name)')} &lt;${escapeHtml(trimmedEmail)}&gt;</p>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap; border-left: 3px solid ${EMAIL_ACCENT}; padding-left: 12px; margin-left: 0;">${escapeHtml(trimmedMessage)}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="font-size: 12px; color: #888;">Sent via the contact form on ${EMAIL_BRAND_HOST}. Reply to this email to respond directly to the sender.</p>
          `,
        })
      } catch (emailErr) {
        // Log but don't fail the request — DB row is the source of truth.
        console.error('[contact] email send failed:', emailErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
