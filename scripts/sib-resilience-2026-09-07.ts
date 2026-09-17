// "Social Investment Business — Resilience Fund" is a live row pointing at
// SIB's funding index with a description of emergency working capital, the
// Covid-era Resilience and Recovery Loan Fund. SIB's funding page today lists
// three funds, Community Builders, Energy Resilience and Reach, and all three
// are live rows of their own. Nothing on the site is a Resilience Fund.
//   npx tsx --env-file=.env.local scripts/sib-resilience-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const ID = '583f0378-26e6-4abe-886c-0686bd8b9d2b'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, apply_url').eq('id', ID).single()
  if (!data || !/Resilience Fund/.test(data.title) || !/sibgroup.org.uk\/funding$/.test(data.apply_url)) throw new Error(`wrong row: ${data?.title} ${data?.apply_url}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, '-> rejected (closed_for_good)')
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:verdicts-2026-09-07', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('closed_for_good', 'SIB\'s funding page on 7 Sept 2026 lists Community Builders Fund, Energy Resilience Fund and Reach Fund only, each a live row of its own; no Resilience Fund exists') } })
  console.log('applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
