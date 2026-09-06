// Fitton Trust: the Young Camden directory entry, the trust's only page,
// says "Funder No Min - £350". The £150 floor was a typical figure ("most
// grants are between £150 and £350"), which belongs in prose, where it
// already is. Paul, 7 Sept. Admin source replaces his pin.
//   npx tsx --env-file=.env.local scripts/fitton-min-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = '2d2d4bc6-1c4e-43e8-8357-e14b85dd3510'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, apply_url, amount_min, amount_max').eq('id', ID).single()
  if (!data || !/Fitton/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `${data.amount_min}-${data.amount_max} -> null-${data.amount_max}`)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'admin:paulkilty1@gmail.com', db, fields: { amount_min: null },
    citations: { amount_min: { snippet: 'Funder No Min - £350 no deadline', confidence: 'low', source_url: data.apply_url } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
