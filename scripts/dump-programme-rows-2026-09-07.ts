// Every non-grant row in the catalogue, live or not, as the dedup baseline
// for the programmes discovery brief (docs/handoffs/programme-rows-2026-09-07.json).
//   npx tsx --env-file=.env.local scripts/dump-programme-rows-2026-09-07.ts
import { writeFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants').select('id, title, funder, funding_type, funding_subtypes, apply_url, is_active, pipeline_state, location_tag, impact_sectors')
    .neq('funding_type', 'grant').order('title')
  if (error) throw error
  writeFileSync('docs/handoffs/programme-rows-2026-09-07.json', JSON.stringify(data, null, 1))
  const by = (data ?? []).reduce<Record<string, number>>((a, r) => { const k = `${r.funding_type}/${r.is_active ? 'live' : r.pipeline_state}`; a[k] = (a[k] ?? 0) + 1; return a }, {})
  console.log(data?.length, 'rows', by)
}
main().catch(e => { console.error(e); process.exit(1) })
