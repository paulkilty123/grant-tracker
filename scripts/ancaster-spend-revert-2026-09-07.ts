// Ancaster Trust was marked restricted from "Costs associated with eligible
// projects are eligible for funding", a directory entry's sentence that names
// project costs without excluding core costs. The brief says silence about
// core costs is not "restricted". Back to nothing recorded.
//   npx tsx --env-file=.env.local scripts/ancaster-spend-revert-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = 'f8a83056-ccaf-4b10-8b45-aa7b7b01a080'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, spend_restriction, funding_subtypes').eq('id', ID).single()
  if (!data || !/Ancaster/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, data.spend_restriction, data.funding_subtypes, '-> null, []')
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:spend-2026-09-07', db, fields: { spend_restriction: null, funding_subtypes: [] },
    citations: { spend_restriction: { snippet: 'Costs associated with eligible projects are eligible for funding.', confidence: 'low', source_url: 'https://youngcamdenfoundation.org.uk/funding/ancaster-trust' } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
