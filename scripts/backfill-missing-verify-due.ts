// Rows that were verified and never scheduled, and therefore re-read forever.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE VERIFICATION BILL IS WHAT IT IS
//
// `select_verify_batch` treats `verify_due_at IS NULL` as DUE. That is correct
// for a row nothing has ever looked at. It is ruinous for a row that was looked
// at and never got its nap: the row is permanently due, gets picked every cycle,
// is re-read, and stays permanently due.
//
// Measured 2026-08-18 against 961 rows in the verification pool:
//
//   4    genuinely due now
//   739  scheduled into the future, resting
//   218  due because `verify_due_at` is null
//
// Of those 218, 157 had been read successfully — note `verified` — and 128 of
// those had NO timing change since the read, so nothing should have made them
// due again. The engine reads 240 pages a day at the batch cap while real demand
// is four rows. That gap is the bill.
//
// This replays the write that was missed, using `computeCadence` — the same
// function the route calls — against the row's own timing fields and the
// evidence from its own read. It is not a guess at a due date; it is the due
// date the run should have written.
//
// Rows whose timing DID change after the read are left alone: those are due
// again on purpose, by the migration-056 trigger, and rescheduling them would
// suppress a re-read that should happen.
//
//   npx tsx --env-file=.env.local scripts/backfill-missing-verify-due.ts --dry
//   npx tsx --env-file=.env.local scripts/backfill-missing-verify-due.ts
import { createClient } from '@supabase/supabase-js'
import { computeCadence, previousSilentStreak } from '../src/lib/verification/verify-cadence'
import type { FieldEvidence } from '../src/lib/field-evidence'

const DRY = process.argv.includes('--dry')

type Row = {
  id: string
  title: string | null
  deadline: string | null
  next_open_date: string | null
  deadline_cycle: unknown
  field_evidence: FieldEvidence | null
  field_provenance: Record<string, { set_at?: string }> | null
}

const TIMING_FIELDS = ['deadline', 'is_rolling', 'next_open_date', 'deadline_cycle'] as const

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, deadline, next_open_date, deadline_cycle, field_evidence, field_provenance')
    .is('verify_due_at', null)
    .not('apply_url', 'is', null)
    // Filtered in the DATABASE, not in JS. The first version selected every row
    // with a null due date and filtered in the loop; PostgREST caps a response at
    // 1000 rows, so it silently examined a truncated window and under-counted.
    .not('field_evidence->_page_read->>note', 'is', null)
    .limit(2000)
  if (error) throw new Error(error.message)

  let scheduled = 0
  let skippedNoRead = 0
  let skippedTimingMoved = 0
  const shapes: Record<string, number> = {}

  for (const r of (data ?? []) as unknown as Row[]) {
    const ev = (r.field_evidence ?? null) as (FieldEvidence & Record<string, { checked_at?: string; note?: string }>) | null
    const pageRead = ev?.['_page_read'] as { checked_at?: string; note?: string } | undefined
    const readAt = pageRead?.checked_at ? new Date(pageRead.checked_at) : null

    // Never read at all → genuinely due, leave it.
    //
    // A read that FAILED the gate is still a read, and still gets a nap. This is
    // the case `_page_read` was introduced for: "a page that fails the gate —
    // wrong fund, bot wall, nothing readable — produces no facts and therefore no
    // field stamps, so without this the engine would re-read the same unreadable
    // page four times a day forever." The stamp landed; the schedule did not, so
    // the forever it describes is what has been happening. computeCadence puts
    // these on the silent backoff, which starts at 14 days rather than 6 hours.
    if (!readAt || Number.isNaN(readAt.getTime())) { skippedNoRead++; continue }

    // Timing moved after the read → due again on purpose. Leave it.
    const lastTiming = TIMING_FIELDS
      .map(f => r.field_provenance?.[f]?.set_at)
      .filter(Boolean)
      .map(s => new Date(String(s)).getTime())
      .filter(n => !Number.isNaN(n))
    if (lastTiming.length && Math.max(...lastTiming) > readAt.getTime()) { skippedTimingMoved++; continue }

    const cadence = computeCadence(
      {
        deadline: r.deadline,
        next_open_date: r.next_open_date,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        deadline_cycle: (r.deadline_cycle ?? null) as any,
        evidence: r.field_evidence,
      },
      { checkedAt: readAt, previousStreak: previousSilentStreak(r.field_evidence) },
    )

    const key = pageRead?.note === 'verified' ? cadence.shape : `${cadence.shape} (read failed)`
    shapes[key] = (shapes[key] ?? 0) + 1
    scheduled++

    if (!DRY) {
      const { error: upErr } = await db.from('scraped_grants')
        .update({ verify_due_at: cadence.dueAt.toISOString() })
        .eq('id', r.id)
      if (upErr) console.log(`  FAILED ${String(r.title).slice(0, 40)}: ${upErr.message}`)
    }
  }

  console.log(`pool with a null due date:      ${data?.length ?? 0}`)
  console.log(`  left alone, never read clean: ${skippedNoRead}`)
  console.log(`  left alone, timing moved:     ${skippedTimingMoved}`)
  console.log(`  SCHEDULED:                    ${scheduled}   ${JSON.stringify(shapes)}${DRY ? '  (dry)' : ''}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
