// A third Newcastle Culture Investment Fund row, titled after the page
// ("Supporting Newcastle based organisations to engage residents in culture"),
// same URL as the kept row e3c90440. Rejected as a duplicate.
//   npx tsx --env-file=.env.local scripts/newcastle-third-duplicate-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const ID = 'cf23c001-d792-4938-93bb-5fd2b99286f5'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, apply_url').eq('id', ID).single()
  if (!data || !/engage residents in culture/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  const { data: keep } = await db.from('scraped_grants').select('apply_url, is_active').eq('id', 'e3c90440-3ea2-4bb9-a98c-07cd5d32a2e2').single()
  if (!keep?.is_active || keep.apply_url !== data.apply_url) throw new Error('kept row is not live on the same page')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, '-> duplicate')
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:timing-2026-09-06', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('duplicate', 'same page and fund as Newcastle Culture Investment Fund e3c90440') } })
  console.log('applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
