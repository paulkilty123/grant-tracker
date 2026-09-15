// Paul, 15 Sept: re-show Green Roots (page read in the browser today: open,
// round 4 closes 14 January 2027, £10k to £500k) and publish the two BVSC
// August funds staged the same morning (both pages read in the browser; the
// reader proxy is out of credit so the engine could not).
//   npx tsx --env-file=.env.local scripts/publish-green-roots-bvsc-2026-09-15.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:browser-read-2026-09-15'
const IDS = ['38d502d6-a414-40f5-a72e-405039098abd', '6e7e6615-8113-43b0-82e7-2862525c3a0e', 'c7d1a002-1c18-4a35-87b4-3ff4ad451681']
async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants').select('id, title, is_active, pipeline_state, deadline').in('id', IDS)
  if (error) throw error
  if (!data || data.length !== 3 || data.some(r => r.is_active)) throw new Error('expected three hidden rows')
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of data) console.log('  ', r.title.padEnd(40), r.pipeline_state.padEnd(24), r.deadline, '-> live')
  if (!APPLY) return
  for (const r of data) {
    const res = await mergeGrantUpdate({ id: r.id, source: SRC, db, fields: { is_active: true } })
    console.log('  ', r.title.padEnd(40), 'applied', res.applied, res.rejected.filter(x => x.reason !== 'idempotent'))
  }
  const { data: after } = await db.from('scraped_grants').select('title, is_active, pipeline_state').in('id', IDS)
  console.log(after)
}
main().catch(e => { console.error(e); process.exit(1) })
