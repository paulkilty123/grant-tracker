// Andy Fanshawe Memorial Trust gives its grants to disadvantaged young people
// as individuals or small groups, not to organisations. Out of scope under
// the audience rule. Found by the amounts session, batch 1.
//   npx tsx --env-file=.env.local scripts/andy-fanshawe-reject-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const ID = 'e6379d1a-0437-4ea5-9bca-06385dfd7c08'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, eligible_structures').eq('id', ID).single()
  if (!data || !/Andy Fanshawe/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, data.eligible_structures, '-> rejected (individuals)')
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:amounts-2026-09-06', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('out_of_scope', 'grants go to disadvantaged young people as individuals or small groups, not to organisations. Brief: "Disadvantaged young people, either as individuals or in small groups"') } })
  console.log('applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
