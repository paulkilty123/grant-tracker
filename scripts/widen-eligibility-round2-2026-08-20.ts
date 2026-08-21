// The same widening, against proposals from the REPAIRED extractor.
//
// Round one ran on evidence written by the old prompt — the one with no
// definition for `not_registered`, which it then proposed on 50 rows while
// naming it in none of their quotes. My floor rejected 57 of 77 candidates on
// that basis, which was right, but it means those 57 were judged on a machine
// that has since been fixed.
//
// The re-measurement already re-read all 118 rows carrying an eligibility
// proposal, so the new answers are sitting in a report and cost nothing more.
// This applies the floor to those.
//
//   npx tsx --env-file=.env.local scripts/widen-eligibility-round2-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/widen-eligibility-round2-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formsNamedIn } from '../src/lib/verification/structure-naming'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:eligibility-widen-r2-2026-08-20'
const REPORT = 'reports/remeasure-after-extractor-fix-2026-08-20.json'

type Result = { id: string; title: string; outcome: string; esProposed: unknown; esQuote: string }

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const report = JSON.parse(readFileSync(REPORT, 'utf8')) as { results: Result[] }

  const withProposals = report.results.filter(r => r.outcome === 'verified' && Array.isArray(r.esProposed))
  console.log(`\nrows re-read with a structure proposal : ${withProposals.length}`)

  const ids = withProposals.map(r => r.id)
  const current = new Map<string, string[]>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('scraped_grants').select('id, eligible_structures').in('id', ids.slice(i, i + 100))
    for (const r of (data ?? []) as { id: string; eligible_structures: string[] | null }[]) {
      current.set(r.id, r.eligible_structures ?? [])
    }
  }

  const plan: { id: string; title: string; add: string[]; next: string[]; dropped: string[] }[] = []
  let noneNamed = 0, notAWidening = 0
  const droppedTotal: Record<string, number> = {}

  for (const r of withProposals) {
    const ours = current.get(r.id) ?? []
    const theirs = (r.esProposed as unknown[]).filter((s): s is string => typeof s === 'string')
    const widening = theirs.filter(s => !ours.includes(s))
    if (widening.length === 0) { notAWidening++; continue }

    const add = formsNamedIn(r.esQuote, widening)
    const dropped = widening.filter(s => !add.includes(s))
    for (const d of dropped) droppedTotal[d] = (droppedTotal[d] ?? 0) + 1
    if (add.length === 0) { noneNamed++; continue }
    plan.push({ id: r.id, title: r.title, add, next: [...ours, ...add], dropped })
  }

  console.log(`nothing new proposed                  : ${notAWidening}`)
  console.log(`quote names none of the new forms     : ${noneNamed}`)
  console.log(`to widen                              : ${plan.length}`)
  console.log(`\nproposed but not named in the quote:`)
  for (const [k, v] of Object.entries(droppedTotal).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(20)} ${v}`)

  console.log(`\n── plan`)
  for (const p of plan.slice(0, 20)) {
    console.log(`  ${p.title.slice(0, 44).padEnd(46)} + ${p.add.join(', ')}${p.dropped.length ? `   (not added: ${p.dropped.join(', ')})` : ''}`)
  }
  if (plan.length > 20) console.log(`  ... and ${plan.length - 20} more`)

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  let applied = 0, refused = 0
  for (const p of plan) {
    const r = await mergeGrantUpdate({
      id: p.id, fields: { eligible_structures: p.next }, source: SOURCE, db,
      citations: { eligible_structures: { snippet: `Re-read after the extractor fix. The funder's page names ${p.add.join(', ')}, which this row did not carry. Widened only; nothing removed.`, confidence: 'high' } },
    })
    if (r.applied.includes('eligible_structures')) applied++
    if (r.rejected?.length) { refused++ }
  }
  console.log(`\nwidened: ${applied}   refused (pinned): ${refused}`)

  // Floor, against what each row held BEFORE.
  const { data: after } = await db.from('scraped_grants').select('id, title, eligible_structures').in('id', plan.map(p => p.id))
  const shrank = (after ?? []).filter(a => {
    const had = current.get((a as { id: string }).id) ?? []
    const now = new Set((a as { eligible_structures: string[] | null }).eligible_structures ?? [])
    return had.some(s => !now.has(s))
  })
  console.log(`rows that lost a structure: ${shrank.length}${shrank.length ? '  ← investigate' : ''}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
