// The same widening, over QUEUE rows this time.
//
// Both earlier passes filtered to `is_active AND pipeline_state = published`,
// which is why 11 queue rows still carry an eligible_structures disagreement and
// why they are the single biggest thing holding up publishing. The rows waiting
// to go live were the ones never checked.
//
// City Bridge Foundation's Climate & Environmental Justice round is the clearest:
// we hold ltd_guarantee, cic_guarantee and cooperative, and NOT
// registered_charity — on a fund whose page says "eligible organisation types,
// such as a charitable company (a company that is also a registered charity)". A
// charity cannot match it. Step Change lists its forms outright — "Registered
// Charity, Community Interest Company (CIC), Company Limited by Guarantee,
// Unincorporated Club or Association" — and we hold four of them.
//
// Same floor as before: a form is added only where the funder's own sentence
// NAMES it, and nothing is ever removed. The narrowing direction stays untouched,
// because a page naming fewer forms than we list is usually the extractor
// under-reading an umbrella term — CAF Bank's "Charities and social purpose
// organisations" came back as `registered_charity` alone.
//
// Free: stored evidence only.
//
//   npx tsx --env-file=.env.local scripts/widen-eligibility-queue-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/widen-eligibility-queue-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formsNamedIn } from '../src/lib/verification/structure-naming'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:eligibility-widen-queue-2026-08-20'

type Row = {
  id: string; title: string; eligible_structures: string[] | null
  field_evidence: Record<string, { agrees?: unknown; proposed?: unknown; quote?: unknown }> | null
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('scraped_grants')
    .select('id, title, eligible_structures, field_evidence')
    .in('pipeline_state', ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']).limit(500)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = (data ?? []) as unknown as Row[]

  const plan: { id: string; title: string; add: string[]; next: string[]; dropped: string[] }[] = []
  let noneNamed = 0, narrowing = 0
  const droppedTotal: Record<string, number> = {}

  for (const r of rows) {
    const ev = r.field_evidence?.eligible_structures
    if (!ev || ev.agrees !== false || !Array.isArray(ev.proposed)) continue
    const quote = typeof ev.quote === 'string' ? ev.quote : ''
    if (!quote.trim()) continue

    const ours = r.eligible_structures ?? []
    const theirs = (ev.proposed as unknown[]).filter((s): s is string => typeof s === 'string')
    const widening = theirs.filter(s => !ours.includes(s))
    if (widening.length === 0) { narrowing++; continue }

    const add = formsNamedIn(quote, widening)
    const dropped = widening.filter(s => !add.includes(s))
    for (const d of dropped) droppedTotal[d] = (droppedTotal[d] ?? 0) + 1
    if (add.length === 0) { noneNamed++; continue }
    plan.push({ id: r.id, title: r.title, add, next: [...ours, ...add], dropped })
  }

  console.log(`\nqueue rows examined            : ${rows.length}`)
  console.log(`page names FEWER than we list  : ${narrowing}  (left alone — usually an under-read umbrella)`)
  console.log(`quote names none of the extras : ${noneNamed}`)
  console.log(`to widen                       : ${plan.length}\n`)
  for (const p of plan) {
    console.log(`  ${p.title.slice(0, 50).padEnd(52)} + ${p.add.join(', ')}${p.dropped.length ? `   (not added: ${p.dropped.join(', ')})` : ''}`)
  }
  if (Object.keys(droppedTotal).length) {
    console.log('\nproposed but not named in the quote:')
    for (const [k, v] of Object.entries(droppedTotal).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(20)} ${v}`)
  }

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  const before = new Map(plan.map(p => [p.id, p.next.filter(s => !p.add.includes(s))]))
  let applied = 0, refused = 0
  for (const p of plan) {
    const r = await mergeGrantUpdate({
      id: p.id, fields: { eligible_structures: p.next }, source: SOURCE, db,
      citations: { eligible_structures: { snippet: `The funder's page names ${p.add.join(', ')}, which this row did not carry. Widened only; nothing removed.`, confidence: 'high' } },
    })
    if (r.applied.includes('eligible_structures')) applied++
    if (r.rejected?.length) refused++
  }
  console.log(`\nwidened: ${applied}   refused: ${refused}`)

  const { data: after } = await db.from('scraped_grants').select('id, title, eligible_structures').in('id', plan.map(p => p.id))
  const shrank = (after ?? []).filter(a => {
    const had = before.get((a as { id: string }).id) ?? []
    const now = new Set((a as { eligible_structures: string[] | null }).eligible_structures ?? [])
    return had.some(s => !now.has(s))
  })
  console.log(`rows that lost a structure: ${shrank.length}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
