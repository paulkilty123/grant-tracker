import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getAdminDb } from '@/lib/admin/admin-db'
import { recordRun } from '@/lib/admin/cron-runs'
import { EMAIL_FROM_HEADER } from '@/lib/mcp-brand'
import { summariseEngagement, renderEngagementHtml, WINDOW_DAYS, type OrgRow, type EventRow } from '@/lib/engagement/report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Weekly engagement report to Paul: who is about to pay, who is about to leave.
 *
 *   - Runs Monday 07:00 UTC (vercel.json). Reads organisations, the last 28 days
 *     of events, and owner emails. Sends one email to ENGAGEMENT_REPORT_TO
 *     (falls back to the admin address). Nothing user-facing.
 *   - ?dry=1 returns the rows as JSON instead of sending; ?html=1 with dry
 *     returns the rendered email for a look.
 */
const FALLBACK_TO = 'paulkilty1@gmail.com'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1'
  const wantHtml = req.nextUrl.searchParams.get('html') === '1'

  let htmlOut: string | null = null
  const payload = await recordRun('engagement-report', async () => {
    const db = getAdminDb()
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()

    const [{ data: orgs, error: orgErr }, { data: users, error: uErr }] = await Promise.all([
      db.from('organisations').select('id, name, created_at, granted_access_until, apply_access, profile_skipped, signup_role, owner_id'),
      db.auth.admin.listUsers({ perPage: 1000 }),
    ])
    if (orgErr) throw orgErr
    if (uErr) throw uErr

    // PostgREST caps a select at 1000 rows and says nothing. The first dry run
    // against production had 1101 events in the window and quietly reported
    // launch-week signups as inactive. Page until a short page comes back.
    const PAGE = 1000
    const events: EventRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from('events')
        .select('org_id, event_type, created_at')
        .gte('created_at', since).not('org_id', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw error
      events.push(...((data ?? []) as EventRow[]))
      if (!data || data.length < PAGE) break
    }

    const emailByUser = new Map((users?.users ?? []).map(u => [u.id, u.email ?? null]))
    const orgRows: OrgRow[] = (orgs ?? []).map(o => ({
      id: o.id, name: o.name, created_at: o.created_at,
      granted_access_until: o.granted_access_until, apply_access: o.apply_access,
      profile_skipped: o.profile_skipped, signup_role: o.signup_role,
      owner_email: emailByUser.get(o.owner_id) ?? null,
    }))
    const rows = summariseEngagement(orgRows, events)
    const { subject, html } = renderEngagementHtml(rows)
    htmlOut = html

    const counts = rows.reduce<Record<string, number>>((acc, r) => { acc[r.flag] = (acc[r.flag] ?? 0) + 1; return acc }, {})
    if (dry) return { mode: 'dry-run', subject, eventsRead: events.length, counts, rows }

    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY not configured')
    const to = process.env.ENGAGEMENT_REPORT_TO || FALLBACK_TO
    const { error } = await new Resend(key).emails.send({ from: EMAIL_FROM_HEADER, to, subject, html })
    if (error) throw new Error(`Resend refused: ${error.message}`)
    return { mode: 'sent', to, subject, counts, rows: rows.length }
  })

  if (dry && wantHtml && htmlOut) {
    return new NextResponse(htmlOut, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  return NextResponse.json(payload)
}
