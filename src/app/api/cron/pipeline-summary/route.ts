// Vercel Cron handler — runs every Friday at 08:00 UTC
// Sends each organisation owner a weekly summary of their funding pipeline.
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

interface PipelineRow {
  id: string
  grant_name: string
  funder_name: string
  stage: string
  deadline: string | null
  amount_min: number | null
  amount_max: number | null
  amount_requested: number | null
  is_urgent: boolean
}

const STAGE_ORDER = ['identified', 'researching', 'applying', 'submitted', 'won', 'declined']
const STAGE_EMOJIS: Record<string, string> = {
  identified:  '🔵',
  researching: '🟡',
  applying:    '🟣',
  submitted:   '🟢',
  won:         '🏆',
  declined:    '❌',
}
const STAGE_LABELS: Record<string, string> = {
  identified:  'Identified',
  researching: 'Researching',
  applying:    'Applying',
  submitted:   'Submitted',
  won:         'Won',
  declined:    'Declined',
}

function formatAmount(min: number | null, max: number | null, requested: number | null): string {
  const lo = min
  const hi = max ?? requested
  if (lo && hi && lo !== hi) return `£${lo.toLocaleString('en-GB')} – £${hi.toLocaleString('en-GB')}`
  if (hi) return `Up to £${hi.toLocaleString('en-GB')}`
  if (lo) return `£${lo.toLocaleString('en-GB')}`
  return ''
}

function daysUntil(dateStr: string): number {
  const now  = new Date(); now.setHours(0,0,0,0)
  const then = new Date(dateStr); then.setHours(0,0,0,0)
  return Math.round((then.getTime() - now.getTime()) / 86_400_000)
}

function buildSummaryHtml(orgName: string, items: PipelineRow[]): string {
  const activeItems = items.filter(i => i.stage !== 'won' && i.stage !== 'declined')
  const wonItems    = items.filter(i => i.stage === 'won')

  // Group active items by stage
  const byStage = new Map<string, PipelineRow[]>()
  for (const stage of STAGE_ORDER.filter(s => s !== 'won' && s !== 'declined')) {
    const stageItems = activeItems.filter(i => i.stage === stage)
    if (stageItems.length > 0) byStage.set(stage, stageItems)
  }

  // Upcoming deadlines (next 30 days, active only)
  const upcoming = activeItems
    .filter(i => i.deadline)
    .map(i => ({ ...i, days: daysUntil(i.deadline!) }))
    .filter(i => i.days >= 0 && i.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)

  // Total potential value of active pipeline
  const totalPotential = activeItems.reduce((sum, i) => sum + (i.amount_max ?? i.amount_requested ?? 0), 0)
  const totalWon       = wonItems.reduce((sum, i) => sum + (i.amount_max ?? i.amount_requested ?? 0), 0)

  const stageSection = (stage: string, stageItems: PipelineRow[]) => `
    <div style="margin-bottom:20px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6b6b6b;">
        ${STAGE_EMOJIS[stage]} ${STAGE_LABELS[stage]} (${stageItems.length})
      </p>
      ${stageItems.map(item => {
        const amount = formatAmount(item.amount_min, item.amount_max, item.amount_requested)
        const deadline = item.deadline ? daysUntil(item.deadline) : null
        const deadlineStr = deadline !== null
          ? deadline === 0 ? '⚠️ Due today!'
          : deadline < 0  ? `Overdue by ${Math.abs(deadline)}d`
          : deadline <= 7 ? `⚠️ ${deadline}d left`
          : `${deadline} days`
          : ''
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0ebe4;">
          <div>
            <p style="margin:0;font-size:14px;font-weight:600;color:#1a3c2e;">${item.grant_name}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#6b6b6b;">${item.funder_name}${item.is_urgent ? ' · <span style="color:#dc2626;">⚠ Urgent</span>' : ''}</p>
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:16px;">
            ${amount ? `<p style="margin:0;font-size:13px;font-weight:700;color:#c9963a;">${amount}</p>` : ''}
            ${deadlineStr ? `<p style="margin:2px 0 0;font-size:11px;color:${deadline !== null && deadline <= 7 ? '#dc2626' : '#6b6b6b'};">${deadlineStr}</p>` : ''}
          </div>
        </div>`
      }).join('')}
    </div>`

  const upcomingSection = upcoming.length === 0 ? '' : `
    <div style="background:#fff8ed;border:1px solid #fde9ba;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#c9963a;">
        📅 Deadlines in the next 30 days
      </p>
      ${upcoming.map(item => {
        const urgentColour = item.days <= 7 ? '#dc2626' : '#c9963a'
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #fde9ba;">
          <div>
            <span style="font-size:13px;font-weight:600;color:#1a3c2e;">${item.grant_name}</span>
            <span style="font-size:12px;color:#6b6b6b;margin-left:6px;">${item.funder_name}</span>
          </div>
          <span style="font-size:13px;font-weight:700;color:${urgentColour};">${item.days === 0 ? 'Today!' : `${item.days}d`}</span>
        </div>`
      }).join('')}
    </div>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  </head>
  <body style="margin:0;padding:0;background:#f7f4ef;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:28px;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#4a7c59;">Weekly Round-up</p>
        <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#1a3c2e;">Your funding pipeline</h1>
        <p style="margin:0;font-size:14px;color:#6b6b6b;">${orgName}</p>
      </div>

      <!-- KPI strip -->
      <div style="display:flex;gap:12px;margin-bottom:24px;">
        <div style="flex:1;background:#fff;border:1px solid #e8ddd0;border-radius:12px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:800;color:#1a3c2e;">${activeItems.length}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b6b6b;">Active opportunities</p>
        </div>
        ${totalPotential > 0 ? `
        <div style="flex:1;background:#fff;border:1px solid #e8ddd0;border-radius:12px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:800;color:#c9963a;">£${Math.round(totalPotential / 1000)}k</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b6b6b;">Pipeline potential</p>
        </div>` : ''}
        ${totalWon > 0 ? `
        <div style="flex:1;background:#f0f7f2;border:1px solid #c8e0d0;border-radius:12px;padding:16px;text-align:center;">
          <p style="margin:0;font-size:24px;font-weight:800;color:#4a7c59;">£${Math.round(totalWon / 1000)}k</p>
          <p style="margin:4px 0 0;font-size:11px;color:#4a7c59;">Won to date</p>
        </div>` : ''}
      </div>

      ${upcomingSection}

      <!-- Pipeline by stage -->
      <div style="background:#fff;border:1px solid #e8ddd0;border-radius:16px;padding:24px 28px;margin-bottom:24px;">
        ${Array.from(byStage.entries()).map(([stage, stageItems]) => stageSection(stage, stageItems)).join('')}
        ${byStage.size === 0 ? '<p style="margin:0;font-size:14px;color:#6b6b6b;text-align:center;">No active opportunities yet — add some to your pipeline!</p>' : ''}
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin:24px 0;">
        <a href="${APP_URL}/dashboard/pipeline"
           style="background:#1a3c2e;color:#fff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;display:inline-block;">
          Open Pipeline →
        </a>
      </div>

      <!-- Footer -->
      <div style="border-top:1px solid #e8ddd0;padding-top:20px;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9b9b9b;">
          Weekly pipeline digest for ${orgName}.<br>
          <a href="${APP_URL}/dashboard/profile" style="color:#4a7c59;">Manage settings</a>
        </p>
      </div>
    </div>
  </body></html>`
}

export async function GET(req: NextRequest) {
  // Auth check
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

  // Fetch all organisations with alerts enabled (reuse same flag for pipeline digests)
  const { data: orgs } = await supabase
    .from('organisations')
    .select('id, name, owner_id')
    .eq('alerts_enabled', true)

  if (!orgs?.length) {
    return NextResponse.json({ success: true, emailsSent: 0, message: 'No organisations with alerts enabled' })
  }

  const results: object[] = []

  for (const org of orgs) {
    // Fetch all pipeline items for this org
    const { data: items } = await supabase
      .from('pipeline_items')
      .select('id, grant_name, funder_name, stage, deadline, amount_min, amount_max, amount_requested, is_urgent')
      .eq('org_id', org.id)
      .order('deadline', { ascending: true, nullsFirst: false })

    if (!items?.length) {
      results.push({ org: org.name, sent: false, reason: 'No pipeline items' })
      continue
    }

    // Fetch owner email
    const { data: userData } = await supabase.auth.admin.getUserById(org.owner_id)
    const email = userData?.user?.email
    if (!email) {
      results.push({ org: org.name, sent: false, reason: 'No owner email found' })
      continue
    }

    const activeCount = items.filter(i => i.stage !== 'won' && i.stage !== 'declined').length
    const { error: sendErr } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      email,
      subject: `📊 Weekly pipeline update — ${activeCount} active opportunit${activeCount === 1 ? 'y' : 'ies'} · ${org.name}`,
      html:    buildSummaryHtml(org.name, items as PipelineRow[]),
    })

    if (sendErr) {
      results.push({ org: org.name, sent: false, error: sendErr.message })
    } else {
      results.push({ org: org.name, sent: true, itemCount: items.length })
    }
  }

  return NextResponse.json({
    success: true,
    emailsSent: results.filter((r: any) => r.sent).length,
    results,
  })
}
