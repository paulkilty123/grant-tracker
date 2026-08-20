// How often does the new amount check fire, and is it right when it does?
//
// The check shipped on 19 August and has never run against the catalogue. Until
// it has, "should an unsupported figure block publishing?" is unanswerable: the
// case for blocking is that a figure the funder never published is wrong rather
// than missing, and the case against is that nobody has scored this extractor on
// this field. This produces the number.
//
// SAMPLED FROM THE POPULATION AT RISK — live rows that ASSERT an amount, which is
// 510 of 607. A row with no figure cannot have an unsupported one, and including
// those would dilute the rate into meaninglessness.
//
// Deterministic sample: ordered by md5(id + salt), so a re-run measures the same
// rows and a second opinion can be taken on the same set.
//
// READ ONLY. verifyRow writes nothing and neither does this.
//
//   npx tsx --env-file=.env.local scripts/measure-amount-check-2026-08-20.ts [n]
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { writeFileSync } from 'fs'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'
import { AMOUNT_UNSUPPORTED_NOTE } from '../src/lib/field-evidence'

const N = Number(process.argv[2] ?? 40)
const CONCURRENCY = 3
const OUT = `reports/amount-check-${new Date().toISOString().slice(0, 10)}.json`

const COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, is_rolling, '
  + 'amount_min, amount_max, max_org_income, min_org_income, is_invite_only, eligible_structures, '
  + 'location_tag, funder_brief'

type Row = VerifyRow & { amount_min: number | null; amount_max: number | null }

type Result = {
  id: string; title: string; outcome: string
  had: [number | null, number | null]
  fired: boolean
  confirmed: boolean
  proposed: { field: string; from: unknown; to: unknown; quote: string } | null
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  // PostgREST cannot order by an expression, so the deterministic sample is
  // taken by pulling the candidate ids and sorting them here. The set is small
  // enough (510) that one paged read is honest — and it is paged, because the
  // 1000-row cap has already produced one silent half-read in this codebase.
  const ids: { id: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data: page, error: e } = await db.from('scraped_grants')
      .select('id')
      .eq('is_active', true).eq('pipeline_state', 'published')
      .not('apply_url', 'is', null)
      .or('amount_min.not.is.null,amount_max.not.is.null')
      .range(from, from + 999)
    if (e) { console.error('query failed:', e.message); process.exit(1) }
    ids.push(...(page ?? []))
    if (!page || page.length < 1000) break
  }
  console.log(`population asserting an amount: ${ids.length}`)

  const { createHash } = await import('crypto')
  const ordered = ids
    .map(r => ({ id: r.id, k: createHash('md5').update(r.id + 'amount-2026-08-20').digest('hex') }))
    .sort((a, b) => a.k.localeCompare(b.k))
    .slice(0, N)
    .map(r => r.id)

  const { data: rows } = await db.from('scraped_grants').select(COLS).in('id', ordered)
  const sample = (rows ?? []) as unknown as Row[]
  console.log(`sampling ${sample.length}, concurrency ${CONCURRENCY}\n`)

  const results: Result[] = []
  let done = 0
  const queue = [...sample]
  const worker = async () => {
    for (;;) {
      const row = queue.shift()
      if (!row) return
      try {
        const res = await verifyRow(row, anthropic)
        const stamps = res.evidence.filter(e => e.field === 'amount_min' || e.field === 'amount_max')
        const confirmed = stamps.some(e => e.agrees === true)
        const noted = stamps.some(e => e.note === AMOUNT_UNSUPPORTED_NOTE)
        const p = res.proposals.find(x => x.field === 'amount_min' || x.field === 'amount_max')
        results.push({
          id: row.id, title: row.title, outcome: res.outcome,
          had: [row.amount_min, row.amount_max],
          fired: noted && !confirmed,
          confirmed,
          proposed: p ? { field: p.field, from: p.from, to: p.to, quote: String(p.quote).slice(0, 160) } : null,
        })
      } catch (e) {
        results.push({ id: row.id, title: row.title, outcome: `ERROR: ${(e as Error).message.slice(0, 60)}`,
          had: [row.amount_min, row.amount_max], fired: false, confirmed: false, proposed: null })
      }
      done++
      if (done % 5 === 0) console.log(`  ${done}/${sample.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const readable = results.filter(r => r.outcome === 'verified')
  const fired = results.filter(r => r.fired)
  const confirmed = results.filter(r => r.confirmed)
  const proposed = results.filter(r => r.proposed && !r.fired)

  console.log(`\n── ${results.length} rows read`)
  console.log(`   gate passed and facts extracted : ${readable.length}`)
  console.log(`   page CONFIRMS our figure        : ${confirmed.length}`)
  console.log(`   page states a DIFFERENT figure  : ${proposed.length}`)
  console.log(`   UNSUPPORTED (page states none)  : ${fired.length}`)
  const denom = readable.length || 1
  console.log(`\n   fire rate on readable rows      : ${Math.round(100 * fired.length / denom)}%`)
  console.log(`   projected across 510 asserting rows: ~${Math.round(510 * fired.length / denom)}`)

  console.log(`\n── would be flagged`)
  for (const r of fired.slice(0, 20)) console.log(`   ${r.title.slice(0, 50).padEnd(50)} shows ${r.had[0] ?? '—'} to ${r.had[1] ?? '—'}`)
  if (fired.length > 20) console.log(`   ... and ${fired.length - 20} more`)

  console.log(`\n── page disagrees with our figure`)
  for (const r of proposed.slice(0, 12)) {
    console.log(`   ${r.title.slice(0, 44).padEnd(44)} ${r.proposed!.field} ${r.proposed!.from} → ${r.proposed!.to}`)
    console.log(`      "${r.proposed!.quote}"`)
  }

  writeFileSync(OUT, JSON.stringify({ sampled: results.length, readable: readable.length, fired: fired.length, confirmed: confirmed.length, results }, null, 2))
  console.log(`\nwritten: ${OUT}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
