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
// Only the middle number measures this job. The third is what somebody else did.
//
// And the check that actually catches a miscount, added after batch 4 fell by
// eight where seven rows were written: list the rows in the 187 that are timed
// but do NOT appear in the results file, with the provenance of the field that
// timed them. A batch total can be off in either direction and still look
// plausible; a named row with somebody else's source on it cannot. Batch 3's
// extra was The Health Lottery Foundation and batch 4's was ScottishPower
// Foundation, both repaired today by the orchestrating session, and neither
// would have been identifiable from the totals alone.
//
//   npx tsx --env-file=.env.local scripts/timing-count-2026-09-06.ts

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { RESULTS } from './timing-lib-2026-09-06'

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
  console.log(`drift (not in the list)   ${drift.length}`)
  for (const r of drift) console.log(`   ${r.id}  ${r.title}`)

  if (!existsSync(RESULTS)) return
  const results = JSON.parse(readFileSync(RESULTS, 'utf8'))
  const batches = (Array.isArray(results) ? results : results.batches) as { written: { id: string }[] }[]
  const written = new Set(batches.flatMap(b => b.written.map(w => w.id)))
  const rows = await db.from('scraped_grants')
    .select('id, title, deadline, is_rolling, next_open_date, next_open_date_parsed, field_provenance')
    .in('id', ids).eq('is_active', true).eq('pipeline_state', 'published')
  if (rows.error) throw new Error(rows.error.message)
  // 187 minus the untimed count is NOT the number of rows that gained a date:
  // a row can also leave the untimed set by leaving `published` altogether,
  // which is what the reopen cron does when a next_open_date arrives. Count the
  // two separately rather than letting one hide inside the other.
  const stillLive = new Set((rows.data ?? []).map(r => r.id))
  const gone = ids.filter(id => !stillLive.has(id))
  const timed = (rows.data ?? []).filter(r => r.deadline || r.is_rolling || r.next_open_date_parsed)
  const notMine = timed.filter(r => !written.has(r.id))
  console.log(`\nno longer live+published  ${gone.length}`)
  for (const id of gone) console.log(`   ${id}`)
  console.log(`timed among the 187       ${timed.length}`)
  console.log(`timed but NOT by this job ${notMine.length}   <- every one of these needs a name, not a shrug`)
  for (const r of notMine) {
    const prov = r.field_provenance as Record<string, { source?: string; set_at?: string }> | null
    console.log(`   ${r.title}`)
    console.log(`      deadline=${r.deadline} rolling=${r.is_rolling} parsed=${r.next_open_date_parsed} prose="${r.next_open_date}"`)
    for (const f of ['deadline', 'is_rolling', 'next_open_date']) {
      if (prov?.[f]) console.log(`      ${f}: ${prov[f].source} @ ${prov[f].set_at}`)
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
