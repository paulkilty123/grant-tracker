// Re-measure the two residues against the FIXED extractor.
//
// The 71 unsupported deadlines and the 57 rejected eligibility widenings were
// both counted from evidence written by the old prompt — the one that did not
// know today's date and had no definition for `not_registered`. Acting on those
// numbers would be cleaning up after a machine that has since been repaired.
//
// So this re-reads those rows and reports what changed. It writes NOTHING: the
// point is to find out whether the piles are still there before deciding what to
// do about them.
//
// Costs a fetch and a model call per row, which is the price of not working from
// stale numbers.
//
//   npx tsx --env-file=.env.local scripts/remeasure-after-extractor-fix-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'fs'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'

const CONCURRENCY = 3
const OUT = 'reports/remeasure-after-extractor-fix-2026-08-20.json'
const COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, is_rolling, '
  + 'amount_min, amount_max, max_org_income, min_org_income, is_invite_only, eligible_structures, '
  + 'location_tag, funder_brief, field_evidence'

type Row = VerifyRow & {
  deadline: string | null
  eligible_structures: string[] | null
  field_evidence: Record<string, { agrees?: unknown; note?: unknown; proposed?: unknown; quote?: unknown }> | null
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  // Paged inline rather than via a helper: supabase-js's generic client type
  // does not unify across a function boundary, and threading the generics
  // through a one-off script buys nothing.
  const rows: Row[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('scraped_grants').select(COLS)
      .eq('is_active', true).eq('pipeline_state', 'published')
      .not('apply_url', 'is', null)
      .range(from, from + 499)
    if (error) { console.error('query failed:', error.message); process.exit(1) }
    rows.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 500) break
  }

  // A: we show a closing date and the old read was silent about it.
  const deadlineSet = rows.filter(r => {
    const ev = r.field_evidence?.deadline
    return r.deadline !== null && ev !== undefined && ev.agrees === null && ev.note === undefined
  })

  // B: the old read proposed structures the quote did not name.
  const eligSet = rows.filter(r => {
    const ev = r.field_evidence?.eligible_structures
    return ev?.agrees === false && Array.isArray(ev.proposed)
  })

  const targets = Array.from(new Map([...deadlineSet, ...eligSet].map(r => [r.id, r])).values())
  console.log(`\nunsupported-deadline rows : ${deadlineSet.length}`)
  console.log(`eligibility-proposal rows : ${eligSet.length}`)
  console.log(`union to re-read          : ${targets.length}   concurrency ${CONCURRENCY}\n`)

  const out: { id: string; title: string; outcome: string; dlAgrees: unknown; dlProposed: unknown; esProposed: unknown; esQuote: string }[] = []
  let done = 0
  const queue = [...targets]
  const worker = async () => {
    for (;;) {
      const row = queue.shift()
      if (!row) return
      try {
        const res = await verifyRow(row, anthropic)
        const dl = res.evidence.find(e => e.field === 'deadline')
        const es = res.evidence.find(e => e.field === 'eligible_structures')
        out.push({
          id: row.id, title: row.title, outcome: res.outcome,
          dlAgrees: dl?.agrees ?? null, dlProposed: dl?.proposed ?? null,
          esProposed: es?.proposed ?? null, esQuote: String(es?.quote ?? '').slice(0, 120),
        })
      } catch (e) {
        out.push({ id: row.id, title: row.title, outcome: `ERROR ${(e as Error).message.slice(0, 40)}`,
          dlAgrees: null, dlProposed: null, esProposed: null, esQuote: '' })
      }
      done++
      if (done % 20 === 0) console.log(`  ${done}/${targets.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const readable = out.filter(o => o.outcome === 'verified')
  const dlIds = new Set(deadlineSet.map(r => r.id))
  const dlNow = out.filter(o => dlIds.has(o.id) && o.outcome === 'verified')
  const dlAnswered = dlNow.filter(o => o.dlAgrees !== null)
  const dlStillSilent = dlNow.filter(o => o.dlAgrees === null)

  const esIds = new Set(eligSet.map(r => r.id))
  const esNow = out.filter(o => esIds.has(o.id) && o.outcome === 'verified' && Array.isArray(o.esProposed))
  const esWithNotReg = esNow.filter(o => (o.esProposed as string[]).includes('not_registered'))

  console.log(`\n── re-read ${out.length}, readable ${readable.length}`)
  console.log(`\nDEADLINES (was ${deadlineSet.length} silent while we show a date)`)
  console.log(`   page now ANSWERS the deadline : ${dlAnswered.length}`)
  console.log(`   still silent                  : ${dlStillSilent.length}`)
  console.log(`\nELIGIBILITY (${eligSet.length} rows carried a proposal)`)
  console.log(`   proposals re-read             : ${esNow.length}`)
  console.log(`   still include not_registered  : ${esWithNotReg.length}   (was proposed on 50 rows)`)

  writeFileSync(OUT, JSON.stringify({ deadlineSet: deadlineSet.length, eligSet: eligSet.length, results: out }, null, 2))
  console.log(`\nwritten: ${OUT}\n`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
