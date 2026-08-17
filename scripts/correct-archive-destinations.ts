/**
 * Move rows the first armed pass ARCHIVED to between-rounds, where the funder's
 * quote does not actually say the fund is gone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY
 *
 * The first pass, on the morning of 17 August, archived eight `no_longer_listed`
 * rows. Reading their quotes afterwards, not one said the fund was gone — all
 * eight were a round closing or a funder pausing:
 *
 *   "This fund has now closed to applications."
 *   "The application window for this fund has now closed."
 *   "Our grant-giving activities are on pause while we finalise a new policy."
 *
 * Archived rows leave every admin queue and never return; between-rounds rows
 * are enrolled on the funder watchlist by the migration-057 trigger, so a
 * reopening brings them back. Paul, 17 August: "watching them is worth more than
 * burying them."
 *
 * `removal.ts` now routes this way by default. This is the one-off correction
 * for the rows that went through under the old rule.
 *
 * It reads `reports/removals-2026-08-17.json` rather than a typed list of ids.
 * That file is the run's own record of what it did and what each row was before,
 * so the correction cannot act on a row this actuator did not touch.
 *
 * Run:  npx tsx scripts/correct-archive-destinations.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { statesPermanentClosure } from '../src/lib/verification/abstain'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'system:removal_actuator:v1'
const LEDGER = resolve(HERE, '..', 'reports', 'removals-2026-08-17.json')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Entry = {
  id: string; title: string; klass: string; quote: string
  after: Record<string, unknown>; ok: boolean
}

async function main() {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { ledger: Entry[] }

  // Only rows this actuator actually archived, and only where the quote fails
  // the permanence test the rule now applies.
  const archived = ledger.ledger.filter(e => e.ok && e.after.pipeline_state === 'archived')
  const move = archived.filter(e => !statesPermanentClosure(e.quote))
  const keep = archived.filter(e =>  statesPermanentClosure(e.quote))

  console.log(`${archived.length} rows were archived by the first pass\n`)
  console.log(`STAYING ARCHIVED — the quote says the fund is gone: ${keep.length}`)
  for (const e of keep) console.log(`    ${e.title} — "${e.quote}"`)
  console.log(`\nMOVING TO BETWEEN-ROUNDS — the quote says a round closed: ${move.length}`)
  for (const e of move) console.log(`    ${e.title} — "${e.quote}"`)

  if (!APPLY) {
    console.log('\nNothing written. Re-run with --apply.')
    return
  }

  let moved = 0
  const refused: string[] = []
  const record: unknown[] = []

  for (const e of move) {
    // `rejection_reason` is cleared: the row is not rejected, it is waiting. It
    // is passed explicitly with pipeline_state so the auto-transition is
    // skipped — `is_active` is already false and the transition would send a
    // published row to `captured`.
    const fields = {
      is_active: false,
      pipeline_state: 'between_rounds_scheduled',
      rejection_reason: null,
    }
    let applied: string[] = []
    let err: string | null = null
    try {
      const res = await mergeGrantUpdate({ id: e.id, fields, source: SOURCE, pinned: false, db })
      applied = res.applied
    } catch (x) {
      err = x instanceof Error ? x.message : String(x)
    }
    const ok = !err && applied.includes('pipeline_state')
    if (ok) moved++
    else refused.push(`${e.title}: ${err ?? 'pipeline_state not applied'}`)
    record.push({ id: e.id, title: e.title, quote: e.quote,
                  before: { pipeline_state: 'archived' }, after: fields, applied, error: err, ok })
  }

  const path = resolve(HERE, '..', 'reports', 'archive-destination-correction-2026-08-17.json')
  writeFileSync(path, JSON.stringify({ ranAt: new Date().toISOString(), source: SOURCE, moved, record }, null, 2))

  console.log(`\nMOVED: ${moved} of ${move.length}`)
  if (refused.length > 0) for (const r of refused) console.log(`    REFUSED ${r}`)
  console.log(`record written to reports/archive-destination-correction-2026-08-17.json`)
}

main().catch(e => { console.error(e); process.exit(1) })
