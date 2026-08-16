/**
 * Give every already-read row the due date its evidence has earned.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NEEDED AT ALL
 *
 * `verify_due_at` starts null, and null means due now. Without this, deploying
 * the cadence would make all 963 eligible rows due at once — including the 672
 * the engine has already read this week — and the queue would spend four days
 * and roughly £5 re-reading pages it read on Sunday. A cadence whose first act
 * is to ignore itself is not a good introduction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `checkedAt` IS THE ROW'S OWN LAST READ, NOT NOW
 *
 * A row read three days ago, whose page was silent, is due eleven days from now
 * and not fourteen. Backfilling from the clock would hand every row a fresh full
 * cooldown and quietly erase a week of work. The `_page_read` stamp already
 * records when we actually looked, so it is what the computation is anchored to.
 *
 * Rows with no `_page_read` stamp are left null on purpose: they have never been
 * read, they are genuinely due, and inventing a date for them would be the same
 * lie in the other direction.
 *
 * Run:  npx tsx scripts/backfill-verify-due.ts [--apply]
 * Without --apply it reports the distribution and writes nothing.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeCadence, previousSilentStreak } from '../src/lib/verification/verify-cadence'
import { PAGE_READ_KEY, readStamp, type FieldEvidence } from '../src/lib/field-evidence'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Row = {
  id:             string
  title:          string | null
  deadline:       string | null
  next_open_date: string | null
  deadline_cycle: unknown
  field_evidence: FieldEvidence | null
}

async function main() {
  // Paged: `.limit()` then filtering in JS has produced confident wrong answers
  // in this codebase, so the filter is in the query and the paging is explicit.
  const rows: Row[] = []
  const PAGE = 500
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, title, deadline, next_open_date, deadline_cycle, field_evidence')
      .not('apply_url', 'is', null)
      .neq('apply_url', '')
      .not('field_evidence', 'is', null)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data as Row[]))
    if (!data || data.length < PAGE) break
  }

  console.log(`${rows.length} rows carry evidence`)

  const shapes: Record<string, number> = {}
  const buckets: Record<string, number> = {}
  const updates: { id: string; verify_due_at: string }[] = []
  let noPageRead = 0

  for (const row of rows) {
    const pageRead = readStamp(row.field_evidence, PAGE_READ_KEY)
    if (!pageRead) { noPageRead++; continue }

    const checkedAt = new Date(pageRead.checked_at)
    if (Number.isNaN(checkedAt.getTime())) { noPageRead++; continue }

    const d = computeCadence({
      deadline:       row.deadline,
      next_open_date: row.next_open_date,
      deadline_cycle: Array.isArray(row.deadline_cycle)
        ? (row.deadline_cycle as { day: number; month: number; label?: string }[])
        : null,
      evidence: row.field_evidence,
    }, {
      checkedAt,
      // Nothing has recorded a streak yet, so the first backoff step is where
      // every silent row starts. That is the generous reading and the right one:
      // a row's history of silence was never measured, so it is not held against it.
      previousStreak: previousSilentStreak(row.field_evidence),
    })

    shapes[d.shape] = (shapes[d.shape] ?? 0) + 1
    const daysOut = Math.round((d.dueAt.getTime() - Date.now()) / 86_400_000)
    const bucket = daysOut <= 0 ? 'due now'
      : daysOut <= 14 ? 'within 14d'
      : daysOut <= 60 ? '15-60d'
      : daysOut <= 120 ? '61-120d'
      : 'over 120d'
    buckets[bucket] = (buckets[bucket] ?? 0) + 1

    updates.push({ id: row.id, verify_due_at: d.dueAt.toISOString() })
  }

  console.log('\nshape:  ', shapes)
  console.log('due in: ', buckets)
  console.log(`no page-read stamp (left due): ${noPageRead}`)

  if (!APPLY) {
    console.log('\nreport only — pass --apply to write')
    return
  }

  let written = 0
  for (const u of updates) {
    // One row at a time. The trigger fires per row anyway, and an upsert on this
    // table would need every not-null column echoed back, which is how a bulk
    // write turns into a data loss.
    const { error } = await db.from('scraped_grants')
      .update({ verify_due_at: u.verify_due_at }).eq('id', u.id)
    if (error) { console.error(`  ${u.id}: ${error.message}`); continue }
    written++
    if (written % 100 === 0) console.log(`  ${written}/${updates.length}`)
  }
  console.log(`\nwrote ${written} of ${updates.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
