// Paul, 7 Sept: publish the eleven pile B publish verdicts that the review
// queue cannot show (hidden rows that were once live have no tab there).
// Each has a full brief and was re-read by the checker today.
//   npx tsx --env-file=.env.local scripts/publish-eleven-pile-b-2026-09-07.ts [--apply]
import { readFileSync } from 'fs'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  const r = JSON.parse(readFileSync('docs/handoffs/verdict-results-2026-09-07.json', 'utf8')) as { batches: { verdicts?: { id: string; title: string; pile: string; verdict: string }[] }[] }
  const pubs = r.batches.flatMap(b => b.verdicts ?? []).filter(v => v.pile === 'B' && v.verdict === 'publish')
  const { data } = await db.from('scraped_grants').select('id, title, is_active, pipeline_state, deadline, is_rolling, next_open_date_parsed, funder_brief').in('id', pubs.map(v => v.id))
  const todo = (data ?? []).filter(x => !x.is_active && x.pipeline_state === 'published')
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${pubs.length} pile B publish verdicts, ${todo.length} still hidden`)
  for (const row of todo) {
    const b = (row.funder_brief ?? {}) as Record<string, unknown>
    const gaps = ['who_can_apply', 'what_they_fund', 'how_to_apply', 'exclusions'].filter(k => !b[k])
    const timing = row.is_rolling ? 'rolling' : row.deadline ? `closes ${row.deadline}` : row.next_open_date_parsed ? `reopens ${row.next_open_date_parsed}` : 'NO TIMING'
    console.log(`  ${row.title.slice(0, 48).padEnd(48)} ${timing}${gaps.length ? '  GAPS ' + gaps.join(',') : ''}`)
    if (gaps.length || timing === 'NO TIMING') throw new Error(`not ready: ${row.title}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: row.id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: true, pipeline_state: 'published' } })
    if (!res.applied.includes('is_active')) throw new Error(`not applied: ${row.title}`)
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('pipeline_state', 'published')
  console.log('live now', count)
}
main().catch(e => { console.error(e); process.exit(1) })
