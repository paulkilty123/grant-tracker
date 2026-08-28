// Eighteen live rows frozen by a note somebody left in the wrong column.
//
// `needs_intervention_reason` is the pipeline's tombstone: both
// process-pipeline-queue and reenrich-stale skip any row where it is not null,
// and the Review Inbox reports it as "the automated chain stopped on this row".
//
// The 18 rows here carry no failure. They carry working notes from the July gap
// audit and the Scotland coverage pass: "verified vs funder site. Open/rolling.
// Review & activate", "Portal is currently closed, reopens 3 September". Every
// one has been frozen out of enrichment and re-reading since, and reported as a
// critical defect at readiness 3, on the strength of its own good news.
//
// The note is worth keeping, so it moves to raw_data.admin_note rather than
// being deleted, and the column it was blocking is cleared. raw_data is not a
// tracked field, so this cannot collide with the trust ladder.
//
// The matching code change is in review-reasons.ts: only the machine's own two
// shapes (`<step>_failed:` and `reenrich:`) count as a quarantine now.
//
//   npx tsx --env-file=.env.local scripts/free-notes-from-quarantine-2026-08-28.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'

const APPLY = process.argv.includes('--apply')
const isMachineQuarantine = (t: string) => /_failed:/.test(t) || /^reenrich:/.test(t)

async function main() {
  const db = getAdminDb()
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, needs_intervention_reason, raw_data')
    .not('needs_intervention_reason', 'is', null)
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as { id: string; title: string; needs_intervention_reason: string; raw_data: unknown }[]
  const notes   = rows.filter(r => !isMachineQuarantine(r.needs_intervention_reason))
  const real    = rows.filter(r =>  isMachineQuarantine(r.needs_intervention_reason))

  console.log(`rows carrying something in the column: ${rows.length}`)
  console.log(`  genuine machine quarantine, left alone: ${real.length}`)
  console.log(`  human notes, to be moved:               ${notes.length}\n`)

  for (const r of notes) {
    console.log(`  ${String(r.title).slice(0, 46).padEnd(48)} ${r.needs_intervention_reason.slice(0, 60)}`)
    if (!APPLY) continue
    const raw = (r.raw_data && typeof r.raw_data === 'object' && !Array.isArray(r.raw_data))
      ? { ...(r.raw_data as Record<string, unknown>) } : {}
    raw.admin_note = {
      text: r.needs_intervention_reason,
      moved_at: '2026-08-28',
      moved_from: 'needs_intervention_reason',
      why: 'the column freezes a row out of process-pipeline-queue and reenrich-stale',
    }
    const { error: upErr } = await db.from('scraped_grants')
      .update({ raw_data: raw, needs_intervention_reason: null })
      .eq('id', r.id)
    if (upErr) console.log(`      FAILED ${upErr.message}`)
  }

  if (APPLY) {
    const { count } = await db.from('scraped_grants')
      .select('*', { count: 'exact', head: true })
      .not('needs_intervention_reason', 'is', null)
    console.log(`\nstill carrying the column: ${count} (expected ${real.length})`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
