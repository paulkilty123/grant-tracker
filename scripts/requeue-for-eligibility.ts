/**
 * Make already-read rows due again, once, so the new eligibility fields get read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS HAS TO BE ASKED FOR RATHER THAN HAPPENING
 *
 * The cadence shipped hours before the eligibility extraction did, and it works:
 * 668 rows carry a due date and most of them are months out. A shape A row —
 * page states year-round, quote held — will not be read again for 180 days. So
 * without this, eligibility evidence would arrive across the catalogue at the
 * speed of the slowest cadence, which is exactly the behaviour that makes the
 * cadence worth having and exactly the wrong behaviour for a new field.
 *
 * It could have been automatic: bump the verifier version, treat an older stamp
 * as due. That is worse, for two reasons. It re-reads the whole catalogue on
 * every future extraction change without anyone deciding, and it conflates two
 * different facts — a `deadline` confirmed under v1 is still confirmed, it is
 * the ROW that is incomplete, not the stamp.
 *
 * So it is a script, it prints the price first, and somebody says yes.
 *
 * Run:  npx tsx scripts/requeue-for-eligibility.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')

/** Measured on the 16 August runs: ~3.9k input and ~700 output tokens a row on
 *  Haiku 4.5 at $1/M in and $5/M out, plus the page fetch, which is free. */
const GBP_PER_ROW = 0.0058

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
  // Rows the engine has read but which carry no eligibility stamp, so the only
  // ones that would learn anything from a re-read. A row read AFTER the
  // extraction shipped already has one and is skipped.
  const ids: string[] = []
  const PAGE = 500
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, is_active, verify_due_at, field_evidence')
      .not('field_evidence', 'is', null)
      .not('apply_url', 'is', null)
      .neq('apply_url', '')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as { id: string; field_evidence: Record<string, unknown> | null }[]
    for (const r of rows) {
      const ev = r.field_evidence ?? {}
      if (!('_page_read' in ev)) continue          // never read: already due
      if ('eligible_structures' in ev) continue    // read under v2 already
      ids.push(r.id)
    }
    if (rows.length < PAGE) break
  }

  console.log(`${ids.length} read rows carry no eligibility stamp`)
  console.log(`one pass costs roughly £${(ids.length * GBP_PER_ROW).toFixed(2)}`)
  console.log(`at 240 rows a day that is ${Math.ceil(ids.length / 240)} day(s) of scheduled runs`)

  if (!APPLY) {
    console.log('\nreport only — pass --apply to clear verify_due_at on these rows')
    return
  }

  // Clearing `verify_due_at` is all that is needed: null means due now, the
  // existing risk bands decide the order within that, and the engine writes a
  // fresh due date the moment it reads each row. Nothing here has to know
  // anything about the cadence.
  let done = 0
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    const { error } = await db.from('scraped_grants')
      .update({ verify_due_at: null }).in('id', batch)
    if (error) { console.error(`  batch at ${i}: ${error.message}`); continue }
    done += batch.length
    console.log(`  ${done}/${ids.length}`)
  }
  console.log(`\ncleared ${done} of ${ids.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
