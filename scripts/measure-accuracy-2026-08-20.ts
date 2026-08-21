// A repeatable accuracy measurement, run with the engine rather than by hand.
//
// This morning's figure — "roughly one live row in four carries a material
// error" — came from fetching ONE page per row and reading it. That instrument
// is weaker than the engine it was auditing: the engine reads up to three pages,
// and the difference produced a false positive on Allan & Nesta Ferguson, whose
// £50,000 is stated on a guidance page one hop past the login wall its apply_url
// points at.
//
// So this uses `verifyRow`, and counts what the FUNDER'S PAGE says about the
// claims a card actually makes:
//
//   contradicted — the page states a different deadline, amount or structure set
//   unsupported  — we assert an amount the page never states
//   unreadable   — bot wall, wrong fund, nothing usable
//
// NOT COMPARABLE TO THE HAND-READ NUMBER, and it should not be quoted as though
// it were. It is comparable to ITSELF: same sample rule, same instrument, so a
// re-run in a month measures movement rather than method.
//
// Deterministic sample, salted per run so successive runs draw different rows.
//
//   npx tsx --env-file=.env.local scripts/measure-accuracy-2026-08-20.ts [n] [salt]
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'crypto'
import { writeFileSync } from 'fs'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'
import { AMOUNT_UNSUPPORTED_NOTE, DEADLINE_UNSUPPORTED_NOTE } from '../src/lib/field-evidence'

const N = Number(process.argv[2] ?? 15)
const SALT = process.argv[3] ?? 'accuracy-2026-08-20'
const CONCURRENCY = 3
const COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, is_rolling, '
  + 'amount_min, amount_max, max_org_income, min_org_income, is_invite_only, eligible_structures, '
  + 'location_tag, funder_brief'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const ids: { id: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id')
      .eq('is_active', true).eq('pipeline_state', 'published')
      .not('apply_url', 'is', null).range(from, from + 999)
    if (error) { console.error('query failed:', error.message); process.exit(1) }
    ids.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  const chosen = ids
    .map(r => ({ id: r.id, k: createHash('md5').update(r.id + SALT).digest('hex') }))
    .sort((a, b) => a.k.localeCompare(b.k)).slice(0, N).map(r => r.id)

  const { data: rows } = await db.from('scraped_grants').select(COLS).in('id', chosen)
  const sample = (rows ?? []) as unknown as VerifyRow[]
  console.log(`\nlive rows: ${ids.length}   sampling ${sample.length}   salt "${SALT}"\n`)

  type R = { title: string; outcome: string; contradicted: string[]; unsupported: string[] }
  const out: R[] = []
  let done = 0
  const queue = [...sample]
  const worker = async () => {
    for (;;) {
      const row = queue.shift()
      if (!row) return
      try {
        const res = await verifyRow(row, anthropic)
        const contradicted = res.evidence.filter(e => e.agrees === false).map(e => e.field)
        const unsupported = res.evidence
          .filter(e => e.note === AMOUNT_UNSUPPORTED_NOTE || e.note === DEADLINE_UNSUPPORTED_NOTE)
          .map(e => e.field)
        out.push({ title: row.title, outcome: res.outcome, contradicted, unsupported: Array.from(new Set(unsupported)) })
      } catch (e) {
        out.push({ title: row.title, outcome: `ERROR ${(e as Error).message.slice(0, 40)}`, contradicted: [], unsupported: [] })
      }
      done++
      if (done % 5 === 0) console.log(`  ${done}/${sample.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const readable = out.filter(o => o.outcome === 'verified')
  const clean = readable.filter(o => o.contradicted.length === 0 && o.unsupported.length === 0)
  const flawed = readable.filter(o => o.contradicted.length > 0 || o.unsupported.length > 0)

  console.log(`\n── ${out.length} sampled`)
  console.log(`   readable                 : ${readable.length}`)
  console.log(`   page agrees with the card: ${clean.length}`)
  console.log(`   page disputes something  : ${flawed.length}`)
  console.log(`   rate on readable rows    : ${readable.length ? Math.round(100 * flawed.length / readable.length) : 0}%\n`)
  for (const f of flawed) {
    console.log(`   ${f.title.slice(0, 46).padEnd(48)} ${[...f.contradicted.map(c => `≠${c}`), ...f.unsupported.map(u => `∅${u}`)].join(' ')}`)
  }
  writeFileSync(`reports/accuracy-${SALT}.json`, JSON.stringify({ sampled: out.length, readable: readable.length, flawed: flawed.length, out }, null, 2))
  console.log(`\nwritten: reports/accuracy-${SALT}.json\n`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
