import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

import { brand } from '@/config/brand'

const FROM_EMAIL  = process.env.ALERT_FROM_EMAIL ?? brand.email.alerts
const NOTIFY_TO   = process.env.FEEDBACK_NOTIFY_EMAIL ?? brand.email.hello

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  )
}

export async function POST(req: NextRequest) {
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
            <p style="white-space: pre-wrap; border-left: 3px solid #8ECB3C; padding-left: 12px; margin-left: 0;">${escapeHtml(trimmedMessage)}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="font-size: 12px; color: #888;">Sent via the contact form on ${brand.domain}. Reply to this email to respond directly to the sender.</p>
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
