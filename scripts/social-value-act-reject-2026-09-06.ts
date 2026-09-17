// "Public Sector Contracts (Social Value Act)" links to a gov.uk guidance
// publication about the Act, last updated 2021. Nothing to apply to.
// Found by the timing session, batch 7.
//   npx tsx --env-file=.env.local scripts/social-value-act-reject-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const ID = '824677b4-075c-45a0-baed-5a36fd733135'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, funding_type, is_active, pipeline_state').eq('id', ID).single()
  if (!data || !/Social Value Act/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, data.funding_type, data.pipeline_state, '-> rejected')
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:timing-2026-09-06', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('non_funder', 'a gov.uk guidance publication about the Social Value Act, last updated 29 March 2021; there is no fund and nothing to apply to') } })
  console.log('applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
