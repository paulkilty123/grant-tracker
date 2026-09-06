// The brief's count SQL, plus the decomposition that tells you WHY it moved.
//
// After batch 3 the headline count fell by four where five rows were written.
// The headline number alone cannot say whether that is a bug in the writes or
// something else moving the same set — the reopen and expiry crons both add and
// remove rows from it without anybody touching a row. So this prints three
// numbers, not one:
//
//   untimed(all)      the brief's SQL, over every published row
//   untimed(the 187)  the same test restricted to this job's row list
//   drift             untimed(all) minus untimed(the 187): rows that have
//                     joined the untimed set since the list was cut
//
// Only the middle number measures this job. The third is what a cron did.
//
//   npx tsx --env-file=.env.local scripts/timing-count-2026-09-06.ts

import { readFileSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'

const LIST = join(__dirname, '..', 'docs', 'handoffs', 'timing-rows-2026-09-06.json')

async function main() {
  const db = getAdminDb()
  const ids = (JSON.parse(readFileSync(LIST, 'utf8')) as { id: string }[]).map(r => r.id)

  const untimed = () => db.from('scraped_grants')
    .select('id, title', { count: 'exact' })
    .eq('is_active', true).eq('pipeline_state', 'published')
    .is('deadline', null).eq('is_rolling', false).is('next_open_date_parsed', null)

  const all = await untimed()
  if (all.error) throw new Error(all.error.message)
  const mine = await untimed().in('id', ids)
  if (mine.error) throw new Error(mine.error.message)

  const mineIds = new Set((mine.data ?? []).map(r => r.id))
  const drift = (all.data ?? []).filter(r => !mineIds.has(r.id))

  console.log(`untimed (all published)   ${all.count}`)
  console.log(`untimed (this job's 187)  ${mine.count}   <- the only number this job moves`)
  console.log(`written so far            ${ids.length - (mine.count ?? 0)}`)
  console.log(`drift (not in the list)   ${drift.length}`)
  for (const r of drift) console.log(`   ${r.id}  ${r.title}`)
}
main().catch(e => { console.error(e); process.exit(1) })
