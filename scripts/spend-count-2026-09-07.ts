// The brief's count SQL for job 1, plus the decomposition that names a mover
// rather than leaving the headline number to speak for itself. Same shape as
// scripts/timing-count-2026-09-06.ts, for the same reason: a count that moved
// unexpectedly six times in the earlier jobs, and every time it was another
// session, never this one's own miscount — but the only way to tell the two
// apart is to name the rows.
//
//   npx tsx --env-file=.env.local scripts/spend-count-2026-09-07.ts

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { RESULTS } from './spend-lib-2026-09-07'

const LIST = join(__dirname, '..', 'docs', 'handoffs', 'spend-rows-2026-09-07.json')

async function main() {
  const db = getAdminDb()
  const ids = (JSON.parse(readFileSync(LIST, 'utf8')) as { id: string }[]).map(r => r.id)

  const untagged = () => db.from('scraped_grants')
    .select('id, title', { count: 'exact' })
    .eq('is_active', true).eq('pipeline_state', 'published').eq('funding_type', 'grant')
    .or('funding_subtypes.is.null,funding_subtypes.eq.{}')

  const all = await untagged()
  if (all.error) throw new Error(all.error.message)
  const mine = await untagged().in('id', ids)
  if (mine.error) throw new Error(mine.error.message)

  const mineIds = new Set((mine.data ?? []).map(r => r.id))
  const drift = (all.data ?? []).filter(r => !mineIds.has(r.id))

  console.log(`untagged (all live grants)   ${all.count}`)
  console.log(`untagged (this job's 116)    ${mine.count}   <- the only number this job moves`)
  console.log(`drift (not in the list)      ${drift.length}`)
  for (const r of drift) console.log(`   ${r.id}  ${r.title}`)

  if (!existsSync(RESULTS)) return
  const results = JSON.parse(readFileSync(RESULTS, 'utf8')) as { batches: { written: { id: string }[] }[] }
  const written = new Set(results.batches.flatMap(b => b.written.map(w => w.id)))

  const rows = await db.from('scraped_grants')
    .select('id, title, funding_subtypes, spend_restriction, spend_types, field_provenance')
    .in('id', ids).eq('is_active', true).eq('pipeline_state', 'published').eq('funding_type', 'grant')
  if (rows.error) throw new Error(rows.error.message)
  const stillLive = new Set((rows.data ?? []).map(r => r.id))
  const gone = ids.filter(id => !stillLive.has(id))
  const tagged = (rows.data ?? []).filter(r => Array.isArray(r.funding_subtypes) && (r.funding_subtypes as string[]).length)
  const notMine = tagged.filter(r => !written.has(r.id))

  console.log(`\nno longer live+published     ${gone.length}`)
  for (const id of gone) console.log(`   ${id}`)
  console.log(`tagged among the 116          ${tagged.length}`)
  console.log(`tagged but NOT by this job    ${notMine.length}   <- every one of these needs a name, not a shrug`)
  for (const r of notMine) {
    const prov = r.field_provenance as Record<string, { source?: string; set_at?: string }> | null
    console.log(`   ${r.title}`)
    console.log(`      subtypes=${JSON.stringify(r.funding_subtypes)} restriction=${r.spend_restriction} types=${JSON.stringify(r.spend_types)}`)
    for (const f of ['funding_subtypes', 'spend_restriction', 'spend_types']) {
      if (prov?.[f]) console.log(`      ${f}: ${prov[f].source} @ ${prov[f].set_at}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
