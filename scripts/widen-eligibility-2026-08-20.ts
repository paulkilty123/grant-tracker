// Funds we are hiding from organisations the funder actually named.
//
// `eligible_structures` is a HARD GATE in the matcher. 118 live rows carry an
// `agrees: false` stamp on it, and in 77 the page names MORE forms than we list —
// so a CIC reads "not for you" about a fund whose page says "Charity, Faith
// organisation, Social Enterprise/CIC, and Voluntary/Community Group".
//
// WIDENING IS THE RECOVERABLE DIRECTION, but it is NOT free, and the first look
// at the data proved it. Red Hill Trust's quote is "Grants are only awarded to
// organisations, not individuals" — which names no legal form at all — and the
// extractor proposed six, including CICs and unincorporated groups, for what
// reads like a traditional grant-making trust. Applying that would send a CIC to
// a funder who never mentioned CICs. Same cost as the individual-only
// scholarships that were matching charities this morning: a wasted application.
//
// THE FLOOR: a form is only added if the QUOTE NAMES IT. Not "the quote is about
// eligibility", not "the extractor proposed it" — the words for that form appear
// in the sentence the verifier pulled off the page. Everything else is left for a
// person, and counted, so the residue is visible rather than implied.
//
// Nothing is ever removed here. Narrowing on this evidence is a different and
// riskier operation, and 22 rows where we claim more than the page names are
// deliberately untouched: a page failing to mention a form is silence, not
// exclusion. That rule is already written down in eligibility.ts, and Wee Grants
// lost its `scio` tag to the opposite assumption.
//
//   npx tsx --env-file=.env.local scripts/widen-eligibility-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/widen-eligibility-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formsNamedIn } from '../src/lib/verification/structure-naming'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:eligibility-widen-2026-08-20'

type Row = {
  id: string; title: string; funder: string | null
  eligible_structures: string[] | null
  field_evidence: Record<string, { agrees?: unknown; proposed?: unknown; quote?: unknown }> | null
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const rows: Row[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, funder, eligible_structures, field_evidence')
      .eq('is_active', true).eq('pipeline_state', 'published')
      .range(from, from + 499)
    if (error) { console.error('query failed:', error.message); process.exit(1) }
    rows.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 500) break
  }

  let candidates = 0, applied = 0, refused = 0, allDropped = 0
  const droppedTotal: Record<string, number> = {}
  const plan: { id: string; title: string; add: string[]; next: string[]; dropped: string[]; quote: string }[] = []

  for (const r of rows) {
    const ev = r.field_evidence?.eligible_structures
    if (!ev || ev.agrees !== false || !Array.isArray(ev.proposed)) continue
    const quote = typeof ev.quote === 'string' ? ev.quote : ''
    if (!quote.trim()) continue

    const oursList = r.eligible_structures ?? []
    const ours = new Set(oursList)
    const theirs = (ev.proposed as unknown[]).filter((s): s is string => typeof s === 'string')
    const widening = theirs.filter(s => !ours.has(s))
    if (widening.length === 0) continue           // not a widening
    if (theirs.some(s => !ours.has(s)) && oursList.some(o => !theirs.includes(o))) {
      // Mixed: they add AND drop. Not a pure widening, so out of scope here.
      continue
    }
    candidates++

    const add = formsNamedIn(quote, widening)
    const dropped = widening.filter(s => !add.includes(s))
    for (const d of dropped) droppedTotal[d] = (droppedTotal[d] ?? 0) + 1
    if (add.length === 0) { allDropped++; continue }

    plan.push({ id: r.id, title: r.title, add, next: [...oursList, ...add], dropped, quote: quote.slice(0, 90) })
  }

  console.log(`\nwidening candidates              : ${candidates}`)
  console.log(`rows where the quote names none  : ${allDropped}  (left for a person)`)
  console.log(`rows to widen                    : ${plan.length}`)
  console.log(`forms proposed but not named in the quote:`)
  for (const [k, v] of Object.entries(droppedTotal).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(20)} ${v}`)

  console.log(`\n── plan`)
  for (const p of plan.slice(0, 15)) {
    console.log(`  ${p.title.slice(0, 44).padEnd(46)} + ${p.add.join(', ')}${p.dropped.length ? `   (not added: ${p.dropped.join(', ')})` : ''}`)
  }
  if (plan.length > 15) console.log(`  ... and ${plan.length - 15} more`)

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  for (const p of plan) {
    const r = await mergeGrantUpdate({
      id: p.id,
      fields: { eligible_structures: p.next },
      source: SOURCE,
      db,
      citations: { eligible_structures: {
        snippet: `The funder's page names ${p.add.join(', ')}, which this row did not carry. Quote: "${p.quote}". `
          + `Widened only; nothing removed.`,
        confidence: 'high' } },
    })
    if (r.applied.includes('eligible_structures')) applied++
    if (r.rejected?.length) { refused++; console.log(`  REFUSED ${p.title.slice(0, 40)}: ${r.rejected.map(x => `${x.field} (${x.reason})`).join('; ')}`) }
  }
  console.log(`\nwidened: ${applied}   refused: ${refused}`)

  // Floor, after the write: nothing lost a structure.
  //
  // The first version of this check compared the result against `next`, the
  // INTENDED set, and reported 4 rows as having lost a structure when none had.
  // The right comparison is against what the row held BEFORE — a widening must
  // be a superset of its own starting point, whether or not the write landed.
  const { data: after } = await db.from('scraped_grants').select('id, title, eligible_structures').in('id', plan.map(p => p.id))
  const before = new Map(plan.map(p => [p.id, new Set(p.next.filter(s => !p.add.includes(s)))]))
  const shrank = (after ?? []).filter(a => {
    const had = before.get((a as { id: string }).id)
    if (!had) return false
    const now = new Set((a as { eligible_structures: string[] | null }).eligible_structures ?? [])
    return Array.from(had).some(s => !now.has(s))
  })
  console.log(`rows that lost a structure: ${shrank.length}${shrank.length ? '  ← investigate' : ''}`)
  for (const r of shrank) console.log(`  ${(r as { title: string }).title}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
