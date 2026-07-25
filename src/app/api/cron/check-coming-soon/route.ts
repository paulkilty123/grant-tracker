// Vercel Cron handler — called daily at 07:00
// Checks for grants whose next_open_date_parsed has arrived (i.e. the grant
// should now be open). Clears the "Opens …" badge and moves the grant into
// "Needs Review" so an admin can re-populate it with the actual deadline.
//
// 2026-07-25: this used to be a single bulk `.update()` that bypassed
// mergeGrantUpdate. Two bugs followed from that:
//
//   1. It set is_active=false without touching pipeline_state, so the row kept
//      pipeline_state='published'. Every admin queue keys off pipeline_state
//      and every triage tab also filters is_active=true, so the row landed in
//      *no* queue at all — invisible to users AND to the admin. The comment
//      above ("moves the grant into Needs Review") had been false since the
//      queue became pipeline_state-driven. This was the primary generator of
//      the dead zone: 101 of the 112 published+inactive rows found on
//      2026-07-25 carry this fingerprint (both open-date columns nulled).
//   2. It nulled next_open_date, which is a TRACKED field, outside the trust
//      ladder — silently clobbering admin-pinned values.
//
// Both are fixed by routing through mergeGrantUpdate. No new behaviour is
// invented: transitionPipelineState already maps
// `is_active=false` + current='published' → 'captured', and 'captured' is in
// the Needs Review predicate. The intent of the original comment now holds.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '@/lib/grant-merge'

export const dynamic = 'force-dynamic'

const PROVENANCE_SOURCE = 'system:check_coming_soon:v2'

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

  // Clear the "Opens …" badge and move to Needs Review, one row at a time so
  // each write goes through the trust ladder and the state machine.
  //
  // next_open_date is tracked (trust-checked); next_open_date_parsed and
  // is_active are untracked and pass straight through. If the tracked write is
  // rejected because an admin pinned next_open_date, we leave the parsed
  // column alone too — nulling only half the pair would leave the row
  // internally inconsistent (badge text present, parsed date gone).
  const processed: string[] = []
  const skippedPinned: string[] = []
  const failed: { id: string; error: string }[] = []

  for (const g of dueGrants) {
    const label = `${g.title} (${g.funder}) — was "${g.next_open_date}"`
    try {
      const probe = await mergeGrantUpdate({
        id:     g.id,
        fields: { next_open_date: null },
        source: PROVENANCE_SOURCE,
        db,
      })

      if (probe.rejected.some(r => r.field === 'next_open_date')) {
        // Admin pinned the badge. Respect it, and don't desync the pair.
        skippedPinned.push(label)
        continue
      }

      // Now the untracked half + the state transition
      // (published → captured, i.e. into the Needs Review queue).
      await mergeGrantUpdate({
        id:     g.id,
        fields: { next_open_date_parsed: null, is_active: false },
        source: PROVENANCE_SOURCE,
        db,
      })

      processed.push(label)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[check-coming-soon] failed for ${g.id}:`, msg)
      failed.push({ id: g.id, error: msg })
    }
  }

  console.log(
    `[check-coming-soon] ${today} — moved ${processed.length} to review, ` +
    `skipped ${skippedPinned.length} (admin-pinned), failed ${failed.length}`
  )

  return NextResponse.json({
    ok: failed.length === 0,
    processed: processed.length,
    skippedPinned: skippedPinned.length,
    failed: failed.length,
    grants: processed,
    skippedGrants: skippedPinned,
    failures: failed,
  })
}
