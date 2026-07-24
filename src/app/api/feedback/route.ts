import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

import { brand } from '@/config/brand'

const FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? brand.email.alerts
const NOTIFY_TO  = process.env.FEEDBACK_NOTIFY_EMAIL ?? brand.email.hello

const TYPE_LABELS: Record<string, string> = {
  feature:        'Feature idea',
  bug:            'Issue or bug',
  missing_funder: 'Missing funder',
  general:        'General feedback',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  )
}

export async function POST(req: NextRequest) {
  try {
    const { type, message, extra } = await req.json()

    if (!type || !TYPE_LABELS[type]) {
      return NextResponse.json({ error: 'Invalid feedback type' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const cleanExtra = (extra && typeof extra === 'object') ? extra : {}

    const { error: dbError } = await supabase.from('feedback').insert({
      type,
      message: message.trim(),
      extra: cleanExtra,
      user_id: user?.id ?? null,
      email:   user?.email ?? null,
    })

    if (dbError) throw dbError

    // Notify Paul via Resend. Best-effort — DB row is the source of truth.
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const typeLabel = TYPE_LABELS[type]
        const extraLines = Object.entries(cleanExtra)
          .filter(([, v]) => v !== null && v !== undefined && String(v).trim().length > 0)
          .map(([k, v]) => `<p><strong>${escapeHtml(k.replace(/_/g, ' '))}:</strong> ${escapeHtml(String(v))}</p>`)
          .join('')

        await resend.emails.send({
          from: FROM_EMAIL,
          to: NOTIFY_TO,
          replyTo: user?.email ?? undefined,
          subject: `[Feedback · ${typeLabel}] ${message.trim().slice(0, 60)}${message.trim().length > 60 ? '…' : ''}`,
          html: `
            <p><strong>Type:</strong> ${escapeHtml(typeLabel)}</p>
            <p><strong>From:</strong> ${escapeHtml(user?.email ?? '(anonymous)')}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap; border-left: 3px solid #8ECB3C; padding-left: 12px; margin-left: 0;">${escapeHtml(message.trim())}</p>
            ${extraLines ? `<hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />${extraLines}` : ''}
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="font-size: 12px; color: #888;">Sent from the in-app Feedback page. ${user?.email ? 'Reply to this email to respond directly to the submitter.' : 'Submitter was not signed in — no reply address available.'}</p>
          `,
        })
      } catch (emailErr) {
        console.error('[feedback] email send failed:', emailErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Submission failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
