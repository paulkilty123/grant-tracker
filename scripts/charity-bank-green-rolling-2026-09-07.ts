// Charity Bank Green Loans: a loan product with an enquiry form and no closing
// date. The verdict tidy left is_rolling false with no deadline, which shows
// a reader no timing. The checker read it as rolling; so does the page.
//   npx tsx --env-file=.env.local scripts/charity-bank-green-rolling-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = 'be85b0fc-7d63-4741-97ce-1ce6f37113b5'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, apply_url, is_rolling, deadline').eq('id', ID).single()
  if (!data || !/Green Loans/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `rolling ${data.is_rolling}, deadline ${data.deadline} -> rolling true`)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:verdicts-2026-09-07', db, fields: { is_rolling: true, deadline: null },
    citations: { is_rolling: { snippet: 'Discuss A Loan Develop a sustainable impact with Charity Bank We finance green projects', confidence: 'med', source_url: data.apply_url } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
