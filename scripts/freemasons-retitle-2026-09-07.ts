// Paul, 7 Sept: the two Freemasons' Charity rows carry the funder's name in
// the title, as the other rows do.
//   npx tsx --env-file=.env.local scripts/freemasons-retitle-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { id: '6566a492-f6e9-4146-99eb-887aedb4f0a1', from: 'Large Grants for Charities', to: "Freemasons' Charity Large Grants for Charities" },
  { id: 'd6c9730d-022b-4ad2-b57b-0e28e2131741', from: 'Small Grants for Charities', to: "Freemasons' Charity Small Grants for Charities" },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title').eq('id', r.id).single()
    if (!data || data.title !== r.from) throw new Error(`${r.id}: ${data?.title}`)
    console.log(`  "${r.from}" -> "${r.to}"`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, source: 'admin:paulkilty1@gmail.com', db, fields: { title: r.to } })
    console.log('     applied', res.applied, res.rejected.filter(x => x.reason !== 'idempotent'))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
