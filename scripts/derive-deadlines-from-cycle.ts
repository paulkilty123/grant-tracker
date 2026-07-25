// Fill in `deadline` on rows that already know their own cycle.
//
//   npx tsx scripts/derive-deadlines-from-cycle.ts          # dry run (default)
//   npx tsx scripts/derive-deadlines-from-cycle.ts --apply  # write
//
// WHY
// Enrichment extracts the cycle correctly and then nothing reads it. Aviva's
// Financial Futures Fund records both "Round One, 15 April" and "Round Two,
// 7 October" in deadline_cycle while `deadline` stays null — and because
// is_rolling is set from the absence of a deadline, the row is additionally
// presented to users as always open.
//
// Measured 2026-07-26 over 720 active rows: 162 carry a cycle, 55 of those have
// no deadline, and 29 of THOSE are also flagged rolling. Every answer is already
// in the row.
//
// "Deadlines not captured properly, especially multi-round ones" is one of the
// three error classes Paul reports hitting most. This is that class, with the
// data already present.
//
// ── What it will NOT do ──
//   - Invent a day. A cycle entry naming only a month ("May application round")
//     describes a window; turning it into a date fabricates precision the funder
//     never published.
//   - Treat an opening date as a deadline. deriveCycleDates() separates them on
//     the label, because Gannochy Trust was recorded with a deadline of 3 August
//     when that is the date its portal OPENS — which understates the time an
//     applicant has and makes the expiry cron retire a fund that just opened.
//   - Overwrite an existing deadline. Only null deadlines are filled.
//
// ── is_rolling ──
// Cleared wherever a real deadline is derived. is_rolling is set from
// `!deadline` upstream, so a fund with fixed rounds acquires it purely as an
// artefact of the deadline being missing, and then reads to a user as "apply any
// time" — the opposite of a fund with two dates a year.
//
// ── PROVENANCE ──
// `system:cycle_derive:v1` (trust 50). Beats scraper (40), so a crawl cannot
// revert it, and stays below ai_enrich (60) so a genuine re-read of the page can
// still correct it. Deliberately not admin: — no human checked these individually
// and an admin source would freeze a computed value against all future
// correction.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveCycleDates } from '../src/lib/grant-deadlines'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'system:cycle_derive:v1'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Fixed once per run, so every row in a run is judged against the same day and
  // the output is reproducible.
  const today = new Date()

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, deadline, next_open_date, is_rolling, deadline_cycle')
    .eq('is_active', true)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = {
    id: string; title: string; funder: string | null
    deadline: string | null; next_open_date: string | null
    is_rolling: boolean | null; deadline_cycle: unknown
  }
  const rows = (data ?? []) as unknown as Row[]

  const plan: Array<{ row: Row; fields: Record<string, unknown>; note: string }> = []
  let skippedHasDeadline = 0, skippedAmbiguous = 0, skippedOpensOnly = 0, noCycle = 0

  for (const r of rows) {
    if (!Array.isArray(r.deadline_cycle) || r.deadline_cycle.length === 0) { noCycle++; continue }
    const d = deriveCycleDates(r.deadline_cycle, today)

    if (r.deadline) { skippedHasDeadline++; continue }

    if (!d.deadline) {
      if (d.nextOpenDate) skippedOpensOnly++
      else if (d.ambiguous > 0) skippedAmbiguous++
      // An opening date is still worth recording even with no deadline — it is
      // what "between rounds" surfaces to users.
      if (d.nextOpenDate && !r.next_open_date) {
        plan.push({ row: r, fields: { next_open_date: d.nextOpenDate }, note: `opens ${d.nextOpenDate}, no close published` })
      }
      continue
    }

    const fields: Record<string, unknown> = { deadline: d.deadline }
    // Only clear the flag, never set it. Setting is_rolling is a claim about the
    // fund; clearing it is removing an artefact of the missing deadline.
    if (r.is_rolling === true) fields.is_rolling = false
    if (d.nextOpenDate && !r.next_open_date) fields.next_open_date = d.nextOpenDate

    plan.push({
      row: r,
      fields,
      note: `${d.deadline}${fields.is_rolling === false ? '  (was flagged rolling)' : ''}`,
    })
  }

  const withDeadline = plan.filter(p => p.fields.deadline)
  const rollingCleared = plan.filter(p => p.fields.is_rolling === false)

  console.log(`\nactive rows                          : ${rows.length}`)
  console.log(`  no cycle recorded                  : ${noCycle}`)
  console.log(`  already have a deadline            : ${skippedHasDeadline}`)
  console.log(`  cycle names a month but no day     : ${skippedAmbiguous}  (no date invented)`)
  console.log(`  cycle names only an opening date   : ${skippedOpensOnly}  (no deadline claimed)`)
  console.log(`\nDEADLINES TO SET                     : ${withDeadline.length}`)
  console.log(`  of which also un-flag "rolling"    : ${rollingCleared.length}`)
  console.log(`other rows gaining a next_open_date  : ${plan.length - withDeadline.length}\n`)

  for (const p of plan.slice(0, 25)) {
    console.log(`  ${(p.row.funder ?? '').slice(0, 28).padEnd(28)} ${p.row.title.slice(0, 34).padEnd(34)} ${p.note}`)
  }
  if (plan.length > 25) console.log(`  ... and ${plan.length - 25} more`)

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let applied = 0, rejected = 0, failed = 0
  for (const p of plan) {
    try {
      const res = await mergeGrantUpdate({ id: p.row.id, fields: p.fields, source: SOURCE, pinned: false, db })
      if (res.applied.length > 0) applied++
      else { rejected++; if (rejected <= 5) console.error(`  rejected: ${p.row.title.slice(0, 40)} — ${JSON.stringify(res.rejected)}`) }
    } catch (err) {
      failed++
      console.error(`  failed: ${p.row.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()
