// What is actually holding up the review queue?
//
// 91 rows sit in captured / tagged / tagged_awaiting_review. The screen groups
// them by section, but the question worth answering before doing any work is
// narrower: how many are blocked on nothing, and of the rest, what is the ONE
// reason that would have to go away.
//
// Free. Runs the real gate over stored rows and writes nothing.
//
//   npx tsx --env-file=.env.local scripts/queue-shape-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
import { sectionOf } from '../src/lib/admin/review-sections'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await db.from('scraped_grants').select('*')
    .in('pipeline_state', ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']).limit(500)
  if (error) { console.error(error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as (ReviewRow & { pipeline_state: string; funder: string | null })[]

  const bySection: Record<string, number> = {}
  const blockingCounts: Record<string, number> = {}
  const clean: { title: string; state: string }[] = []
  const singleBlocker: Record<string, { title: string; state: string }[]> = {}

  for (const r of rows) {
    const reasons = deriveReviewReasons(r, today)
    const gate = gateDecision(r, reasons)
    const blocking = gate.blocking.map(b => b.code)
    const section = sectionOf(blocking, reasons.map(x => x.code))
    bySection[section] = (bySection[section] ?? 0) + 1
    for (const b of blocking) blockingCounts[b] = (blockingCounts[b] ?? 0) + 1
    if (blocking.length === 0) clean.push({ title: r.title ?? '(untitled)', state: r.pipeline_state })
    else if (blocking.length === 1) {
      (singleBlocker[blocking[0]] ??= []).push({ title: r.title ?? '(untitled)', state: r.pipeline_state })
    }
  }

  console.log(`\nqueue rows: ${rows.length}\n`)
  console.log('by section:')
  for (const [k, v] of Object.entries(bySection).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(12)} ${v}`)

  console.log(`\nnothing blocking at all: ${clean.length}`)
  for (const c of clean.slice(0, 15)) console.log(`   ${c.title.slice(0, 54).padEnd(56)} ${c.state}`)
  if (clean.length > 15) console.log(`   ... and ${clean.length - 15} more`)

  console.log('\nblocking reasons, most common first:')
  for (const [k, v] of Object.entries(blockingCounts).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(30)} ${v}`)

  const listSection = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : null
  if (listSection) {
    console.log(`\n── section "${listSection}"`)
    for (const r of rows) {
      const reasons = deriveReviewReasons(r, today)
      const gate = gateDecision(r, reasons)
      if (sectionOf(gate.blocking.map(b => b.code), reasons.map(x => x.code)) !== listSection) continue
      console.log(`   ${(r.title ?? '').slice(0, 46).padEnd(48)} ${(r as unknown as { funder?: string }).funder ?? '—'}`)
      console.log(`      ${(r as unknown as { apply_url?: string }).apply_url}`)
      console.log(`      blocking: ${gate.blocking.map(b => b.code).join(', ')}`)
    }
  }

  console.log('\nrows held by exactly ONE reason (clear it and they publish):')
  for (const [k, v] of Object.entries(singleBlocker).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`   ${k.padEnd(30)} ${v.length}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
