// Paul's rule, 7 Sept: a closed fund is shown from one month before it
// reopens, not earlier. Live rows that are closed with a reopening date more
// than 30 days out are parked (between_rounds_scheduled); check-coming-soon
// brings them back a month before the date. Leathersellers' Foundation Main
// Grants, in review with a January 2027 date, is parked the same way.
//   npx tsx --env-file=.env.local scripts/park-far-reopenings-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const LEAD_DAYS = 30
const LEATHERSELLERS = '5fa1e39d-b4bd-4376-a339-b72b33077a2a'
async function main() {
  const db = getAdminDb()
  const cutoff = new Date(Date.now() + LEAD_DAYS * 86400000).toISOString().slice(0, 10)
  const { data, error } = await db.from('scraped_grants').select('id, title, next_open_date, next_open_date_parsed, is_active, pipeline_state')
    .or(`and(is_active.eq.true,pipeline_state.eq.published,deadline.is.null,is_rolling.eq.false,next_open_date_parsed.gt.${cutoff}),id.eq.${LEATHERSELLERS}`)
  if (error) throw error
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: cutoff ${cutoff}, ${data?.length} rows`)
  let done = 0
  for (const r of data ?? []) {
    console.log(`  ${r.title.slice(0, 44).padEnd(44)} ${r.next_open_date_parsed}  ${r.pipeline_state}/${r.is_active ? 'live' : 'hidden'} -> between_rounds_scheduled`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' } })
    if (res.applied.includes('pipeline_state')) done++
  }
  console.log('parked', done)
}
main().catch(e => { console.error(e); process.exit(1) })
