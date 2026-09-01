// Propagate the funder index pages already banked, to the rows that lack them.
//
// Paul, 2026-09-01: "Check the 82 index pages the 17 Aug hop already banked
// before setting any by hand. It's observation not judgement, so apply it."
//
// THE RULE, AND WHY IT IS OBSERVATION
//
// If a row on funder X's domain already carries `funding_index_url = Y`, then Y
// is X's index — somebody or something established that, and the column is what
// migration 061 banked it in. Another row on the same domain with no index
// recorded has the same funder and therefore the same index. Nothing is being
// judged: the answer is copied from a row that already has it.
//
// WHAT IS DELIBERATELY NOT DONE. A first draft inferred an index from "two or
// more rows share an apply_url", which sounds like the same idea and is not.
// Two Two Ridings rows share `/fund/rusholme-wind-farm-fund` — a single fund
// page, and two rows on one fund page is a duplicate, not an index. Guessing
// there would have marked a duplicate as a front door and suppressed the very
// check that finds it.
//
// WHY IT MATTERS. `describesADiscreteFund` only suppresses the "page does not
// describe this fund" verdict when a row points AT its recorded index. 55 of the
// 87 rows carrying that verdict had no index recorded, so the guard could not
// help them however obviously they were front doors.
//
// Setting the column changes NOTHING on its own: the guard also requires the
// title to name no fund beyond the funder. Both conditions still have to hold.
//
// DRY BY DEFAULT.  npx tsx --env-file=.env.local scripts/set-index-urls-2026-09-01.ts [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const LIVE = process.argv.includes('--live')

const hostOf = (u: unknown) =>
  String(u ?? '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? ''

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const rows: Record<string, unknown>[] = []
  for (let f = 0; f < 6000; f += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, funder, apply_url, funding_index_url, is_active, pipeline_state')
      .not('pipeline_state', 'in', '("rejected","archived")').order('id').range(f, f + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? [])); if ((data ?? []).length < 500) break
  }

  // What each domain's index is, according to rows that already record one.
  const indexByHost = new Map<string, Set<string>>()
  for (const r of rows) {
    const idx = String(r.funding_index_url ?? '').trim()
    if (!idx) continue
    const h = hostOf(idx)
    if (!h) continue
    if (!indexByHost.has(h)) indexByHost.set(h, new Set())
    indexByHost.get(h)!.add(idx.replace(/\/+$/, ''))
  }

  console.log(`${rows.length} rows scanned`)
  console.log(`${rows.filter(r => r.funding_index_url).length} already carry an index`)
  console.log(`${indexByHost.size} distinct funder domains have one banked\n`)

  // AMBIGUITY IS REFUSED, NOT RESOLVED. A domain with two different recorded
  // indexes is a funder we have two answers for, and copying either would be a
  // guess dressed as an observation.
  const ambiguous = Array.from(indexByHost.entries()).filter(([, v]) => v.size > 1)
  if (ambiguous.length) {
    console.log(`${ambiguous.length} domain(s) have MORE THAN ONE recorded index and are skipped:`)
    for (const [h, v] of ambiguous) console.log(`   ${h}: ${Array.from(v).join('  |  ')}`)
    console.log('')
  }

  const todo = rows.filter(r => {
    if (r.funding_index_url) return false
    const h = hostOf(r.apply_url)
    const known = indexByHost.get(h)
    return !!known && known.size === 1
  })

  console.log(`${todo.length} row(s) can take their funder's index from a sibling:\n`)
  let applied = 0, refused = 0
  for (const r of todo) {
    const idx = Array.from(indexByHost.get(hostOf(r.apply_url))!)[0]
    console.log(`  ${r.is_active ? 'LIVE' : 'hid '} ${String(r.funder ?? '').slice(0, 26).padEnd(26)} ${String(r.title ?? '').slice(0, 34).padEnd(34)}`)
    console.log(`        -> ${idx}`)
    if (!LIVE) { applied++; continue }
    const res = await mergeGrantUpdate({
      db, id: String(r.id), fields: { funding_index_url: idx },
      source: 'system:index-propagation-2026-09-01' as never,
    })
    if (res.applied?.includes('funding_index_url')) applied++
    else { refused++; console.log(`        REFUSED: ${JSON.stringify(res.rejected?.map(x => x.reason))}`) }
  }

  console.log(`\n${LIVE ? 'set' : 'would set'} ${applied}   refused ${refused}`)
  if (!LIVE) console.log('Re-run with --live to write.')
}
main()
