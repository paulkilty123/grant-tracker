import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getOrgsWithAlertsEnabled, getUnsentAlerts, markAlertsSent } from '@/lib/alerts'
import type { AlertGrant } from '@/lib/alerts'
import type { Organisation } from '@/types'

export const dynamic = 'force-dynamic'

const FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? 'alerts@granttracker.co.uk'
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://granttracker.co.uk'

// ── Email HTML template ───────────────────────────────────────────────────────
function buildEmailHtml(orgName: string, grants: AlertGrant[]): string {
  const scoreColour = (s: number) =>
    s >= 80 ? '#4a7c59' : s >= 65 ? '#c9963a' : '#6b6b6b'

  const grantCards = grants.map(({ grant, score, reason }) => `
    <div style="background:#ffffff;border:1px solid #e8ddd0;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;">
          <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#1a3c2e;">${grant.title}</p>
          <p style="margin:0;font-size:13px;color:#6b6b6b;">${grant.funder}</p>
        </div>
        <div style="background:${scoreColour(score)}22;border-radius:20px;padding:4px 10px;margin-left:12px;flex-shrink:0;">
          <span style="font-size:12px;font-weight:700;color:${scoreColour(score)};">${score}% match</span>
        </div>
      </div>
      <p style="margin:8px 0;font-size:13px;color:#2d2d2d;line-height:1.5;">${grant.description}</p>
      <p style="margin:8px 0;font-size:12px;color:#4a7c59;background:#f0f7f2;border-radius:8px;padding:8px 12px;">● ${reason}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
        <div>
          <span style="font-size:18px;font-weight:700;color:#c9963a;">
            ${grant.amountMin && grant.amountMax
              ? `£${grant.amountMin.toLocaleString()} – £${grant.amountMax.toLocaleString()}`
              : grant.amountMax
              ? `Up to £${grant.amountMax.toLocaleString()}`
              : 'Amount varies'}
          </span>
          <span style="font-size:11px;color:#9b9b9b;margin-left:6px;">
            ${grant.isRolling ? '· Rolling deadline' : grant.deadline ? `· Deadline: ${grant.deadline}` : ''}
          </span>
        </div>
        ${grant.applyUrl ? `
          <a href="${grant.applyUrl}" style="background:#1a3c2e;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;">
            View grant →
          </a>` : ''}
      </div>
    </div>
  `).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f7f4ef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

        <!-- Header -->
        <div style="text-align:center;margin-bottom:32px;">
          <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:8px;">
            <div style="background:#1a3c2e;border-radius:10px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;">
              <span style="color:#a8d5b5;font-size:18px;font-weight:900;">£</span>
            </div>
            <span style="font-size:20px;font-weight:800;color:#1a3c2e;letter-spacing:-0.5px;">RANT · TRACKER</span>
          </div>
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#1a3c2e;">New matching grants for ${orgName}</h1>
          <p style="margin:8px 0 0;font-size:14px;color:#6b6b6b;">
            We found ${grants.length} grant${grants.length === 1 ? '' : 's'} that match your organisation profile
          </p>
        </div>

        <!-- Grant cards -->
        ${grantCards}

        <!-- CTA -->
        <div style="text-align:center;margin:32px 0;">
          <a href="${APP_URL}/dashboard/search"
             style="background:#1a3c2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;display:inline-block;">
            View all matching grants →
          </a>
        </div>

        <!-- Footer -->
        <div style="border-top:1px solid #e8ddd0;padding-top:20px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9b9b9b;">
            You're receiving this because you enabled grant alerts for ${orgName}.<br>
            <a href="${APP_URL}/dashboard/profile" style="color:#4a7c59;">Manage alert settings</a>
            &nbsp;·&nbsp;
            <a href="${APP_URL}/dashboard/profile" style="color:#9b9b9b;">Unsubscribe</a>
          </p>
        </div>

      </div>
    </body>
    </html>
  `
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Simple auth: require a secret header so only the scheduler can call this
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  try {
    const orgs = await getOrgsWithAlertsEnabled()
    const results = []

    for (const org of orgs) {
      const minScore = (org as Organisation & { alert_min_score?: number }).alert_min_score ?? 70
      const grants = await getUnsentAlerts(org, minScore)

      if (grants.length === 0) {
        results.push({ org: org.name, sent: 0, reason: 'No new matching grants' })
        continue
      }

      // Send email
      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to:   org.owner_email,
        subject: `${grants.length} new grant${grants.length === 1 ? '' : 's'} matching ${org.name}`,
        html: buildEmailHtml(org.name, grants),
      })

      if (error) {
        results.push({ org: org.name, sent: 0, error: error.message })
        continue
      }

      // Mark as sent so we don't resend them
      await markAlertsSent(org.id, grants.map(g => g.grant.id))
      results.push({ org: org.name, sent: grants.length })
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Alert send failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
