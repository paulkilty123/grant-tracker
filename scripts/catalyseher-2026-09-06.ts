// Visa CatalyseHer: the date is right (closes 7 September 2026). Two other
// things on the card are not: the description carries a stray <cite> tag
// from an extraction, and eligibility says sole traders only while the page
// says "businesses registered in the UK or HMRC-registered sole traders".
//   npx tsx --env-file=.env.local scripts/catalyseher-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = '1e6c3908-dde9-4254-9a64-1ddba2f5d4a4'
const URL = 'https://catalyseher-uk.inco-group.co/'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, description, eligible_structures').eq('id', ID).single()
  if (!data || !/CatalyseHer/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  const description = (data.description as string).replace(/<\/?cite[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  const to = ['sole_trader', 'ltd_shares', 'ltd_guarantee', 'cic_guarantee', 'cic_shares', 'cooperative']
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, '\n  description:', description.slice(0, 120), '\n  structures:', data.eligible_structures, '->', to)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:catalyseher-2026-09-06', db, fields: { description, eligible_structures: to },
    citations: { eligible_structures: { snippet: 'this cohort is open to businesses registered in the UK or HMRC-registered sole traders', confidence: 'high', source_url: URL } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
