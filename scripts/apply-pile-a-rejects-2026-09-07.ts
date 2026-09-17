// Paul, 7 Sept: apply the 27 reject verdicts from the review-queue read
// (docs/handoffs/pile-a-rejects-2026-09-07.json). Only rows still in review
// and hidden are touched; anything already rejected or gone live is skipped
// and printed.
//   npx tsx --env-file=.env.local scripts/apply-pile-a-rejects-2026-09-07.ts [--apply]
import { readFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
type R = { id: string; title: string; code: string; note: string; dupe_of?: string | null }
async function main() {
  const db = getAdminDb()
  const rows = JSON.parse(readFileSync('docs/handoffs/pile-a-rejects-2026-09-07.json', 'utf8')) as R[]
  const { data } = await db.from('scraped_grants').select('id, title, is_active, pipeline_state').in('id', rows.map(r => r.id))
  const byId = new Map((data ?? []).map(r => [r.id, r]))
  let done = 0, skipped = 0
  console.log(APPLY ? 'APPLY' : 'DRY RUN', rows.length, 'verdicts')
  for (const r of rows) {
    const cur = byId.get(r.id)
    if (!cur || cur.is_active || !['tagged', 'tagged_awaiting_review', 'captured'].includes(cur.pipeline_state)) { skipped++; console.log(`  skip ${r.title.slice(0, 44)} (${cur ? cur.pipeline_state + (cur.is_active ? '/live' : '') : 'missing'})`); continue }
    if (cur.title !== r.title) throw new Error(`title drift on ${r.id}: ${cur.title}`)
    console.log(`  reject ${r.title.slice(0, 44).padEnd(44)} ${r.code}${r.dupe_of ? ' dup of ' + r.dupe_of : ''}`)
    if (!APPLY) continue
    const note = r.dupe_of ? `${r.note} (duplicate of ${r.dupe_of})` : r.note
    const res = await mergeGrantUpdate({ id: r.id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(r.code, `verdict of 7 Sept 2026, applied at Paul's word: ${note}`) } })
    if (!res.applied.includes('pipeline_state')) throw new Error(`not applied on ${r.id}: ${JSON.stringify(res.rejected)}`)
    done++
  }
  console.log(`done ${done}, skipped ${skipped}`)
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', false).in('pipeline_state', ['tagged', 'tagged_awaiting_review', 'captured'])
  console.log('rows still in review:', count)
}
main().catch(e => { console.error(e); process.exit(1) })
