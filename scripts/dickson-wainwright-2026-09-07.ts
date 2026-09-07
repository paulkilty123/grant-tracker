// Paul, 7 Sept: both funds have reopened; replace the pinned June dates with
// the pages' new closing dates and publish. Admin source, since the pins
// were his. Publishing is his instruction, given in words today.
//   npx tsx --env-file=.env.local scripts/dickson-wainwright-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { re: /^Alec Dickson Trust Grant$/, deadline: '2026-10-04', url: 'https://www.alecdicksontrust.org.uk/',
    quote: 'The Alec Dickson Trust application window is now open and closes on 4th October 2026 at 5pm.' },
  { re: /^Andrew Wainwright Reform Trust/, deadline: '2026-09-14', url: 'https://www.wainwrighttrusts.org.uk/awrt.html',
    quote: 'Important notice: applications for the current funding round are now open and will close on 14 September 2026.' },
]
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, deadline, is_active, pipeline_state').or('title.ilike.Alec Dickson Trust Grant,title.ilike.Andrew Wainwright Reform Trust%')
  if (!data || data.length !== 2) throw new Error(`expected two rows, got ${data?.length}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const row = data.find(d => r.re.test(d.title))
    if (!row) throw new Error(`no row for ${r.re}`)
    console.log(`  ${row.title.slice(0, 40).padEnd(40)} ${row.deadline} -> ${r.deadline}, ${row.pipeline_state}/${row.is_active ? 'live' : 'hidden'} -> published/live`)
    if (!APPLY) continue
    const a = await mergeGrantUpdate({ id: row.id, source: 'admin:paulkilty1@gmail.com', db, fields: { deadline: r.deadline, is_rolling: false },
      citations: { deadline: { snippet: r.quote, confidence: 'high', source_url: r.url } } })
    if (!a.applied.includes('deadline')) throw new Error(`deadline refused on ${row.title}: ${JSON.stringify(a.rejected)}`)
    const b = await mergeGrantUpdate({ id: row.id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: true, pipeline_state: 'published' } })
    console.log('     applied', [...a.applied, ...b.applied])
  }
}
main().catch(e => { console.error(e); process.exit(1) })
