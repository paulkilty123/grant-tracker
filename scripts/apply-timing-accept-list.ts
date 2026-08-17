/**
 * Apply the timing accept list Paul cleared on 2026-08-17.
 *
 * Group A: the page states dated application rounds, so `is_rolling` comes off.
 * Group B: the page confirms applications are taken any time, so it goes on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE ROWS FROM GROUP B ARE NOT HERE, AND THAT IS THE POINT
 *
 * Reading the rows before writing them, three of the six would have created a
 * worse state than the one they were fixing:
 *
 *   Islington Giving   already carries deadline 2026-10-12
 *   Sterry Family      already carries deadline 2026-09-01
 *
 * Setting `is_rolling` on a row that holds a deadline produces the exact
 * contradiction the ledger tracks as A11 — both set, card says apply any time
 * beside a closing date. Clearing the deadline instead would destroy a real
 * date on the strength of a sentence like "applications can be made at any
 * time", which is often true of a fund that ALSO runs dated rounds. Neither
 * option is safe without a human, so both are surfaced rather than written.
 *
 *   Innovate UK Loans  `is_rolling` false, PINNED by admin:innovate-uk-batch-2026-06-01
 *
 * The ladder will refuse it and should. Overriding a pinned human decision is
 * not something an accept-list run gets to do quietly.
 *
 * Hackney is also absent: it is ALREADY `is_rolling` false with deadline
 * 2029-03-31, pinned. The engine's rolling proposal was wrong and the row was
 * always right. Nothing to do.
 *
 * DEADLINE CYCLES are written only where the quote states an explicit day AND
 * month. Ernest Kleinwort, Hampton and National Grid say "four times a year" or
 * "quarterly" without enumerable dates in the quote, so they get `is_rolling`
 * off and no invented schedule.
 *
 * Run:  npx tsx scripts/apply-timing-accept-list.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'ai_audit:timing_accept:v1'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type Row = { id: string; title: string; fields: Record<string, unknown>; quote: string }

const GROUP_A: Row[] = [
  { id: '81c50185-6ad9-4b77-b10f-c0677d14f03a', title: 'Achlachan Wind Farm Community Fund',
    fields: { is_rolling: false, deadline_cycle: [
      { day: 15, month: 3, label: 'Application deadline' }, { day: 15, month: 6, label: 'Application deadline' },
      { day: 15, month: 9, label: 'Application deadline' }, { day: 15, month: 12, label: 'Application deadline' }] },
    quote: 'Application deadlines: 15th March, 15th June, 15th September, 15th December' },
  { id: 'f1fdcd6e-152a-403f-a1ac-f7838fbe9ebc', title: 'sportscotland — Facilities Investment',
    fields: { is_rolling: false, deadline_cycle: [
      { day: 1, month: 4, label: 'Application deadline' }, { day: 1, month: 9, label: 'Application deadline' }] },
    quote: 'Deadlines for submission of Sport Facilities Fund applications are 5pm on the 1st April and 1st September each year.' },
  { id: 'c80591fa-fdf6-4e2d-97a5-c14020cff1bb', title: 'Grants for Good Fund',
    fields: { is_rolling: false, deadline_cycle: [
      { day: 15, month: 3, label: 'Window closes' }, { day: 15, month: 6, label: 'Window closes' },
      { day: 15, month: 9, label: 'Window closes' }, { day: 15, month: 12, label: 'Window closes' }] },
    quote: 'Our four application windows run as follows: December 16th – March 15th, March 16th – June 15th, June 16th – September 15th, September 16th – December 15th' },
  { id: 'b6add755-6f1c-453b-9cfe-54e6b88b3f6d', title: 'Ernest Kleinwort — Medium Grants',
    fields: { is_rolling: false },
    quote: 'Applications accepted online four times a year during the following date ranges' },
  { id: '3665afff-c092-41c1-83e9-fb67b8d4d563', title: 'Community Grants (Hampton Fund)',
    fields: { is_rolling: false },
    quote: 'Our Trustees meet four times a year … Application submission deadlines' },
  { id: '057225d1-6b86-4341-b2df-766f3851ee62', title: 'Community Grant Programme (National Grid)',
    fields: { is_rolling: false },
    quote: 'We accept applications on a quarterly basis. See timeline below.' },
]

const GROUP_B: Row[] = [
  { id: '0114ad82-c985-4e59-9c5b-791cd5c3f1df', title: 'Alpkit Foundation',
    fields: { is_rolling: true },
    quote: 'Applications are reviewed on a rolling basis every couple of months' },
  { id: '1a99b534-f6f5-4792-937d-361f6a0ba067', title: 'The Access Foundation',
    fields: { is_rolling: true }, quote: 'There are no application deadlines.' },
  { id: '894fb8eb-5a6b-4549-98ff-3951c016c623', title: 'Sixpenny Wood Wind Farm Fund',
    fields: { is_rolling: true }, quote: 'You can apply at any time (funds allowing).' },
]

async function main() {
  const record: unknown[] = []
  let ok = 0
  const refused: string[] = []

  for (const [group, rows] of [['A — dated rounds, rolling off', GROUP_A], ['B — confirmed rolling', GROUP_B]] as const) {
    console.log(`\n=== ${group} ===`)
    for (const r of rows) {
      const { data: before } = await db.from('scraped_grants')
        .select('is_rolling, deadline, deadline_cycle').eq('id', r.id).single()
      console.log(`\n${r.title}`)
      console.log(`   "${r.quote}"`)
      console.log(`   now ${JSON.stringify(before)}  ->  ${JSON.stringify(r.fields)}`)
      if (!APPLY) continue

      let applied: string[] = []
      let rejected: unknown[] = []
      let err: string | null = null
      try {
        const res = await mergeGrantUpdate({ id: r.id, fields: r.fields, source: SOURCE, pinned: false, db })
        applied = res.applied; rejected = res.rejected
      } catch (e) { err = e instanceof Error ? e.message : String(e) }

      const missed = Object.keys(r.fields).filter(k => !applied.includes(k))
      const landed = !err && missed.length === 0
      if (landed) ok++; else refused.push(`${r.title}: ${err ?? `refused ${missed.join(', ')}`}`)
      record.push({ group, ...r, before, applied, rejected, error: err, ok: landed })
    }
  }

  if (!APPLY) { console.log('\nNothing written. Re-run with --apply.'); return }
  writeFileSync(resolve(HERE, '..', 'reports', 'timing-accept-applied-2026-08-17.json'),
    JSON.stringify({ ranAt: new Date().toISOString(), source: SOURCE, ok, record }, null, 2))
  console.log(`\nAPPLIED ${ok} of ${GROUP_A.length + GROUP_B.length}`)
  if (refused.length) for (const x of refused) console.log(`   REFUSED ${x}`)
}

main().catch(e => { console.error(e); process.exit(1) })
