// Vercel Cron handler — runs daily at 07:30 UTC
// Checks for pipeline items with deadlines exactly 7 or 14 days away
// and emails the organisation owner a reminder via Resend.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const FROM_EMAIL = process.env.ALERT_FROM_EMAIL ?? 'alerts@granttracker.co.uk'
const APP_URL    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://granttracker.co.uk'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function isoDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().split('T')[0]
}

function formatAmount(amountMin: number | null, amountMax: number | null, amountRequested: number | null): string {
  const lo = amountMin
  const hi = amountMax ?? amountRequested
  if (lo && hi && lo !== hi) return `£${lo.toLocaleString('en-GB')} – £${hi.toLocaleString('en-GB')}`
  if (hi)  return `Up to £${hi.toLocaleString('en-GB')}`
  if (lo)  return `£${lo.toLocaleString('en-GB')}`
  return 'Amount varies'
}

const STAGE_LABELS: Record<string, string> = {
  identified:  '🔵 Identified',
  researching: '🟡 Researching',
  applying:    '🟣 Applying',
  submitted:   '🟢 Submitted',
}

interface ReminderItem {
  id: string
  grant_name: string
  funder_name: string
  deadline: string
  stage: string
  amount_requested: number | null
  amount_min: number | null
  amount_max: number | null
  org_id: string
  days: number
}

function buildReminderHtml(orgName: string, items: ReminderItem[]): string {
  const urgentItems  = items.filter(i => i.days === 7)
  const warningItems = items.filter(i => i.days === 14)

  const itemRow = (item: ReminderItem) => `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid #e8ddd0;vertical-align:top;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div style="flex:1;">
            <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:#1a3c2e;">${item.grant_name}</p>
            <p style="margin:0 0 6px;font-size:13px;color:#6b6b6b;">${item.funder_name}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <span style="background:#f0f7f2;color:#4a7c59;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;">
                ${STAGE_LABELS[item.stage] ?? item.stage}
              </span>
              <span style="background:#fdf6ec;color:#c9963a;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;">
                ${formatAmount(item.amount_min, item.amount_max, item.amount_requested)}
              </span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <p style="margin:0;font-size:20px;font-weight:800;color:${item.days === 7 ? '#dc2626' : '#c9963a'};">
              ${item.days} days
            </p>
            <p style="margin:2px 0 0;font-size:11px;color:#6b6b6b;">
              ${new Date(item.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
      </td>
    </tr>`

  const section = (title: string, colour: string, rows: ReminderItem[]) =>
    rows.length === 0 ? '' : `
    <div style="margin-bottom:28px;">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${colour};">
        ${title}
      </p>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e8ddd0;">
        <tbody>${rows.map(itemRow).join('')}</tbody>
      </table>
    </div>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background:#f7f4ef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:32px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#4a7c59;">Grant Tracker</p>
        <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#1a3c2e;">Upcoming grant deadlines</h1>
        <p style="margin:0;font-size:14px;color:#6b6b6b;">
          You have ${items.length} grant deadline${items.length === 1 ? '' : 's'} approaching for <strong>${orgName}</strong>
        </p>
      </div>

      <!-- Body -->
      <div style="background:#ffffff;border-radius:16px;padding:24px 28px;margin-bottom:24px;border:1px solid #e8ddd0;">
        ${section('⚠️ Due in 7 days — action needed', '#dc2626', urgentItems)}
        ${section('📅 Due in 14 days — heads up', '#c9963a', warningItems)}
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:28px 0;">
        <a href="${APP_URL}/dashboard/pipeline"
           style="background:#1a3c2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;display:inline-block;">
          Open Funding Pipeline →
        </a>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #e8ddd0;padding-top:20px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9b9b9b;">
          Deadline reminders from Grant Tracker for ${orgName}.<br>
          <a href="${APP_URL}/dashboard/profile" style="color:#4a7c59;">Manage settings</a>
        </p>
      </div>
    </div>
  </body></html>`
}

export async function GET(req: NextRequest) {
  // Auth check — Vercel sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({
      error: 'RESEND_API_KEY not configured — add it to your environment variables',
    }, { status: 500 })
  }

  const supabase = adminClient()
  const resend   = new Resend(process.env.RESEND_API_KEY)

  const in7  = isoDate(7)
  const in14 = isoDate(14)

  // Fetch pipeline items with deadlines in 7 or 14 days, ignoring closed stages
  const { data: rows, error: dbErr } = await supabase
    .from('pipeline_items')
    .select('id, grant_name, funder_name, deadline, stage, amount_requested, amount_min, amount_max, org_id')
    .in('deadline', [in7, in14])
    .not('stage', 'in', '("won","declined")')

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  if (!rows?.length) {
    return NextResponse.json({ success: true, emailsSent: 0, message: 'No upcoming deadlines today' })
  }

  // Annotate each row with days remaining
  const items: ReminderItem[] = rows.map(r => ({
    ...r as Omit<ReminderItem, 'days'>,
    days: (r as { deadline: string }).deadline === in7 ? 7 : 14,
  }))

  // Group by org_id
  const orgMap = new Map<string, ReminderItem[]>()
  for (const item of items) {
    const list = orgMap.get(item.org_id) ?? []
    list.push(item)
    orgMap.set(item.org_id, list)
  }

  const results: object[] = []

  for (const [orgId, orgItems] of Array.from(orgMap.entries())) {
    // Fetch org name + owner
    const { data: org } = await supabase
      .from('organisations')
      .select('name, owner_id')
      .eq('id', orgId)
      .single()

    if (!org) continue

    // Fetch owner email from auth
    const { data: userData } = await supabase.auth.admin.getUserById(org.owner_id)
    const email = userData?.user?.email
    if (!email) continue

    const urgentCount  = orgItems.filter((i: ReminderItem) => i.days === 7).length
    const warningCount = orgItems.filter((i: ReminderItem) => i.days === 14).length
    const subjectParts = []
    if (urgentCount)  subjectParts.push(`${urgentCount} due in 7 days`)
    if (warningCount) subjectParts.push(`${warningCount} due in 14 days`)

    const { error: sendErr } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: `⏰ Grant deadlines: ${subjectParts.join(', ')} — ${org.name}`,
      html:    buildReminderHtml(org.name, orgItems),
    })

    if (sendErr) {
      results.push({ org: org.name, sent: false, error: sendErr.message })
    } else {
      results.push({ org: org.name, sent: true, itemCount: orgItems.length, urgentCount, warningCount })
    }
  }

  return NextResponse.json({ success: true, emailsSent: results.filter((r: any) => r.sent).length, results })
}
