// St Giles & St George: the row was rolling AND dated (small grants any time,
// Project and CIG grants by quarterly deadline). expire-grants skips rolling
// rows, so the 28 September deadline would have sat stale forever. The dated
// strands are the ones with a deadline, so the row is dated; the rolling
// small grants stay in the brief. After 28 September the cron rolls to
// 14 December from the decision_timeline prose, which names both dates.
//   npx tsx --env-file=.env.local scripts/st-giles-timing-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, apply_url, is_rolling, deadline').eq('title', 'St Giles & St George Education Charity')
  if (!data || data.length !== 1) throw new Error(`expected one row, got ${data?.length}`)
  const r = data[0]
  console.log(APPLY ? 'APPLY' : 'DRY RUN', r.title, `rolling ${r.is_rolling}, deadline ${r.deadline} -> rolling false`)
  if (!APPLY) return
  const res = await mergeGrantUpdate({ id: r.id, source: 'user_verified:verdicts-2026-09-07', db, fields: { is_rolling: false },
    citations: { is_rolling: { snippet: 'Project Grant and CIG applications should be submitted by the following deadlines', confidence: 'high', source_url: r.apply_url } } })
  console.log('applied', res.applied, res.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
