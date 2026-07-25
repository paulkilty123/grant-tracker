// Vercel Cron handler — runs daily at 04:30 UTC.
//
// Catches the gap between `expire-grants` (auto-rolls deadlines for grants
// with a parseable cycle) and the "Between rounds" admin tab (visual
// surface, not a flag): published rows whose stated `next_open_date_parsed`
// has passed without being refreshed by an admin.
//
// Example failure mode this catches: Women in Innovation Awards activated
// with `next_open_date_parsed='2026-11-01'` (estimated autumn opening).
// When 1 Nov 2026 + 14 days passes without any admin touch refreshing the
// row, this cron flips it to `pipeline_state='tagged_awaiting_review'` so
// it surfaces in the standard Needs Review queue alongside fresh arrivals.
//
// 14-day buffer: gives the funder a fortnight after their estimated open
// to actually announce something, before we nag the admin.
//
// 30-day admin-touch guard: if an admin explicitly reviewed the row
// recently and left it as-is, don't keep re-flagging.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Service-role client. MUST NOT be the cookie-based `@/lib/supabase/server`
// helper — see the same note in cron/expire-grants/route.ts. A cron carries no
// session cookie, so that client is `anon`, and `scraped_grants` RLS has no
// UPDATE policy: the write silently affects zero rows and returns no error.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const PROVENANCE_SOURCE = 'system:check_stale_rounds:v1'
const STALE_GRACE_DAYS  = 14
const ADMIN_TOUCH_GUARD_DAYS = 30

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminClient()
  const todayISO = new Date().toISOString().split('T')[0]
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - STALE_GRACE_DAYS)
  const cutoffISO = cutoffDate.toISOString().split('T')[0]

  // ── Stage 1: pull candidates from the DB ────────────────────────────────
  // Active rows whose stated next_open_date_parsed is at least 14 days past.
  // Skip rows already in a review state — they're being looked at.
  const { data: candidates, error: fetchErr } = await supabase
    .from('scraped_grants')
    .select('id, title, funder, next_open_date_parsed, next_open_date, pipeline_state, field_provenance')
    .eq('is_active', true)
    .eq('pipeline_state', 'published')
    .not('next_open_date_parsed', 'is', null)
    .lt('next_open_date_parsed', cutoffISO)
    .limit(500)

  if (fetchErr) {
    console.error('[check-stale-rounds] fetch failed:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ success: true, flagged: 0, skipped: 0, flaggedIds: [] })
  }

  // ── Stage 2: apply admin-touch guard in JS ──────────────────────────────
  // Skip rows where any field has admin: provenance set in the last 30 days
  // (admin reviewed it and chose to leave it; don't re-flag for a month).
  const guardCutoff = Date.now() - ADMIN_TOUCH_GUARD_DAYS * 24 * 60 * 60 * 1000
  type Candidate = {
    id: string
    title: string
    funder: string
    next_open_date_parsed: string
    next_open_date: string | null
    pipeline_state: string
    field_provenance: Record<string, { source?: string; set_at?: string; pinned?: boolean }> | null
  }

  const toFlag: Candidate[] = []
  const skippedAdminTouch: Array<{ id: string; title: string }> = []

  for (const row of candidates as Candidate[]) {
    const prov = row.field_provenance ?? {}
    const recentAdminTouch = Object.values(prov).some(entry => {
      if (!entry?.source?.startsWith('admin:')) return false
      if (!entry.set_at) return false
      const t = Date.parse(entry.set_at)
      return Number.isFinite(t) && t > guardCutoff
    })
    if (recentAdminTouch) {
      skippedAdminTouch.push({ id: row.id, title: row.title })
      continue
    }
    toFlag.push(row)
  }

  if (toFlag.length === 0) {
    return NextResponse.json({
      success: true,
      flagged: 0,
      skipped: skippedAdminTouch.length,
      flaggedIds: [],
    })
  }

  // ── Stage 3: flip pipeline_state + stamp provenance ─────────────────────
  // Keep is_active=true so the row stays visible to users until the admin
  // explicitly resolves (mirrors expire-grants between-rounds behaviour).
  // The state change is enough to surface in NR.
  const flagged: Array<{ id: string; title: string; funder: string; stale_since: string }> = []

  for (const row of toFlag) {
    const newProv = {
      ...(row.field_provenance ?? {}),
      pipeline_state: {
        pinned: false,
        set_at: new Date().toISOString(),
        source: PROVENANCE_SOURCE,
        reason: 'stale_round',
        stale_since: row.next_open_date_parsed,
      },
    }
    const { error: updErr } = await supabase
      .from('scraped_grants')
      .update({
        pipeline_state:   'tagged_awaiting_review',
        field_provenance: newProv,
      })
      .eq('id', row.id)

    if (updErr) {
      console.error(`[check-stale-rounds] flip failed for ${row.id}:`, updErr.message)
      continue
    }
    flagged.push({
      id:          row.id,
      title:       row.title,
      funder:      row.funder,
      stale_since: row.next_open_date_parsed,
    })
  }

  console.log(
    `[check-stale-rounds] ${todayISO} — flagged ${flagged.length}, ` +
    `skipped ${skippedAdminTouch.length} (recent admin touch)`
  )

  return NextResponse.json({
    success:   true,
    flagged:   flagged.length,
    skipped:   skippedAdminTouch.length,
    flaggedIds: flagged.map(r => r.id),
    rows:       flagged,
  })
}
