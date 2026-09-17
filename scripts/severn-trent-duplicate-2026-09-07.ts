// Two hidden rows for Severn Trent's New Project Funding share one page.
// Keep 1ef69197 (read and verified today, a pile B publish verdict); reject
// f4225849 as a duplicate. Neither was live, so the ordinary dedup did not see them.
//   npx tsx --env-file=.env.local scripts/severn-trent-duplicate-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const KEEP = '1ef69197-b551-4da9-860c-645c97acfb09', DROP = 'f4225849-0663-4532-b73e-b8720dd67fb2'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, apply_url, is_active').in('id', [KEEP, DROP])
  const keep = data?.find(r => r.id === KEEP), drop = data?.find(r => r.id === DROP)
  if (!keep || !drop || keep.apply_url !== drop.apply_url || drop.is_active) throw new Error('rows not as expected')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', 'drop', drop.title, '-> duplicate of', keep.title)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: DROP, source: 'user_verified:verdicts-2026-09-07', db, fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason('duplicate', `same page and fund as ${KEEP}, which was read and verified on 7 Sept`) } })
  console.log('applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
