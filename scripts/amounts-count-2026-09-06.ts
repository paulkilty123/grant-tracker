// The brief's count SQL for the amounts job, decomposed so a move can be
// attributed rather than guessed at.
//
// This is the timing job's count script with its SQL changed, and it is here
// for the reason that job learned three times: the headline number moved by
// more than the batch wrote on three separate evenings, and every time it was
// somebody else's repair or rejection rather than a bad write. A total cannot
// tell you which. A named row with somebody else's provenance on it can.
//
//   npx tsx --env-file=.env.local scripts/amounts-count-2026-09-06.ts

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { RESULTS } from './amounts-lib-2026-09-06'

const LIST = join(__dirname, '..', 'docs', 'handoffs', 'amount-rows-2026-09-06.json')

async function main() {
  const db = getAdminDb()
  const ids = (JSON.parse(readFileSync(LIST, 'utf8')) as { id: string }[]).map(r => r.id)

  const noAmount = () => db.from('scraped_grants')
    .select('id, title', { count: 'exact' })
    .eq('is_active', true).eq('pipeline_state', 'published')
    .is('amount_min', null).is('amount_max', null)

  const all = await noAmount()
  if (all.error) throw new Error(all.error.message)
  const mine = await noAmount().in('id', ids)
  if (mine.error) throw new Error(mine.error.message)

  const mineIds = new Set((mine.data ?? []).map(r => r.id))
  const drift = (all.data ?? []).filter(r => !mineIds.has(r.id))

  console.log(`no amount (all published)  ${all.count}`)
  console.log(`no amount (this job's 176) ${mine.count}   <- the only number this job moves`)
  console.log(`drift (not in the list)    ${drift.length}`)
  for (const r of drift) console.log(`   ${r.id}  ${r.title}`)

  if (!existsSync(RESULTS)) return
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'))
  const batches = (Array.isArray(results) ? results : results.batches) as { written: { id: string }[] }[]
  const written = new Set(batches.flatMap(b => b.written.map(w => w.id)))

  const rows = await db.from('scraped_grants')
    .select('id, title, amount_min, amount_max, field_provenance')
    .in('id', ids).eq('is_active', true).eq('pipeline_state', 'published')
  if (rows.error) throw new Error(rows.error.message)

  // 176 minus the no-amount count is NOT the number of rows that gained a
  // figure: a row can also leave the set by leaving `published`. Count the two
  // separately rather than letting one hide inside the other.
  const stillLive = new Set((rows.data ?? []).map(r => r.id))
  const gone = ids.filter(id => !stillLive.has(id))
  const figured = (rows.data ?? []).filter(r => r.amount_min != null || r.amount_max != null)
  const notMine = figured.filter(r => !written.has(r.id))

  console.log(`\nno longer live+published   ${gone.length}`)
  for (const id of gone) console.log(`   ${id}`)
  console.log(`with a figure, of the 176  ${figured.length}`)
  console.log(`figured but NOT by this job ${notMine.length}   <- every one of these needs a name, not a shrug`)
  for (const r of notMine) {
    const prov = r.field_provenance as Record<string, { source?: string; set_at?: string }> | null
    console.log(`   ${r.title}`)
    console.log(`      min=${r.amount_min} max=${r.amount_max}`)
    for (const f of ['amount_min', 'amount_max']) {
      if (prov?.[f]) console.log(`      ${f}: ${prov[f].source} @ ${prov[f].set_at}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
