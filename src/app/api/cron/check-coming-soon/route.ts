// Vercel Cron handler — called daily at 07:00
// Checks for grants whose next_open_date_parsed has arrived (i.e. the grant
// should now be open). Clears the "Opens …" badge and moves the grant into
// "Needs Review" so an admin can re-populate it with the actual deadline.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(req: NextRequest) {
  // Auth — same pattern as expire-grants
  const auth = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminClient()
  const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

  // Find grants whose "opens" date has arrived or passed
  const { data: dueGrants, error: fetchErr } = await db
    .from('scraped_grants')
    .select('id, title, funder, next_open_date')
    .not('next_open_date', 'is', null)
    .not('next_open_date_parsed', 'is', null)
    .lte('next_open_date_parsed', today)

  if (fetchErr) {
    console.error('check-coming-soon fetch error:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!dueGrants || dueGrants.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: 'No grants due' })
  }

  const ids = dueGrants.map(g => g.id)

  // Clear the "Opens …" badge and move to Needs Review (is_active = false)
  // so it appears in the admin review queue for re-population
  const { error: updateErr } = await db
    .from('scraped_grants')
    .update({
      next_open_date:        null,
      next_open_date_parsed: null,
      is_active:             false, // moves to Needs Review queue
    })
    .in('id', ids)

  if (updateErr) {
    console.error('check-coming-soon update error:', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const names = dueGrants.map(g => `${g.title} (${g.funder}) — was "${g.next_open_date}"`)
  console.log(`check-coming-soon: processed ${ids.length} grants:`, names)

  return NextResponse.json({
    ok: true,
    processed: ids.length,
    grants: names,
  })
}
