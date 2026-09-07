// Worthing Community Chest Grants for Growth: rolling AND dated (31 October),
// the shape the expiry cron skips. The page's rolling sentence is about the
// Seed and Grass Root grants; Grants for Growth has the deadline. Dated.
//   npx tsx --env-file=.env.local scripts/worthing-timing-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, apply_url, deadline, is_rolling').like('title', 'Worthing Community Chest%Grants for Growth%')
  if (!data || data.length !== 1) throw new Error(`expected one row, got ${data?.length}`)
  const r = data[0]
  console.log(APPLY ? 'APPLY' : 'DRY RUN', r.title, `rolling ${r.is_rolling}, deadline ${r.deadline} -> rolling false`)
  if (!APPLY) return
  const res = await mergeGrantUpdate({ id: r.id, source: 'user_verified:verdicts-2026-09-07', db, fields: { is_rolling: false },
    citations: { is_rolling: { snippet: 'We review applications for Seed Grants and Grass Root Grants on a rolling basis.', confidence: 'med', source_url: r.apply_url } } })
  console.log('applied', res.applied, res.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
