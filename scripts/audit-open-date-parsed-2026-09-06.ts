// Does next_open_date_parsed equal what parseOpenDate makes of next_open_date?
// Read-only. Prints every row where they differ.
//   npx tsx --env-file=.env.local scripts/audit-open-date-parsed-2026-09-06.ts
import { getAdminDb } from '../src/lib/admin/admin-db'
import { parseOpenDate } from '../src/lib/parse-open-date'
async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants').select('id, title, pipeline_state, is_active, next_open_date, next_open_date_parsed')
    .or('is_active.eq.true,pipeline_state.eq.between_rounds_scheduled').not('next_open_date', 'is', null)
  if (error) throw error
  let same = 0
  const diff: string[] = []
  for (const r of data ?? []) {
    const p = parseOpenDate(r.next_open_date)
    if (p === r.next_open_date_parsed) same++
    else diff.push(`${(r.title as string).slice(0, 40).padEnd(40)} stored ${r.next_open_date_parsed ?? 'null'}  parser ${p ?? 'null'}  "${(r.next_open_date as string).slice(0, 90)}"`)
  }
  console.log(`rows ${data?.length}, same ${same}, differ ${diff.length}`)
  diff.forEach(d => console.log('  ' + d))
}
main().catch(e => { console.error(e); process.exit(1) })
