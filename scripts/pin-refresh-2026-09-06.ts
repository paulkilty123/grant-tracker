// Two next_open_date pins from 29 July, refreshed at Paul's word on 6 Sept
// from what the pages say today. Admin source because they replace his pins.
// The parsed date is written only after the prose write is applied.
//   npx tsx --env-file=.env.local scripts/pin-refresh-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { id: 'bfaa140a-ed84-4862-a455-6e48ca22e906', re: /Fine & Country/, url: 'https://www.fineandcountryfoundation.com/grants/',
    prose: 'Applications open in October 2026', parsed: '2026-10-01',
    quote: 'applications open in October, assessed in November and funds for successful applications are distributed in December' },
  { id: '3b8727a4-faa4-49b7-a162-c46212af731b', re: /Fishmongers/, url: 'https://fishmongers.org.uk/grants/',
    prose: 'Reopens late November or early December 2026', parsed: '2026-11-20',
    quote: 'We are closed for applications and do not anticipate re-opening for new applications until late November/early December' },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, next_open_date').eq('id', r.id).single()
    if (!data || !r.re.test(data.title)) throw new Error(`${r.id}: ${data?.title}`)
    console.log(`  ${data.title.slice(0, 40).padEnd(40)} "${data.next_open_date}" -> "${r.prose}" (${r.parsed})`)
    if (!APPLY) continue
    const a = await mergeGrantUpdate({ id: r.id, source: 'admin:paulkilty1@gmail.com', db, fields: { next_open_date: r.prose },
      citations: { next_open_date: { snippet: r.quote, confidence: 'high', source_url: r.url } } })
    if (!a.applied.includes('next_open_date')) { console.log('     prose refused', a.rejected); continue }
    const b = await mergeGrantUpdate({ id: r.id, source: 'admin:paulkilty1@gmail.com', db, fields: { next_open_date_parsed: r.parsed } })
    console.log('     applied', [...a.applied, ...b.applied])
  }
}
main().catch(e => { console.error(e); process.exit(1) })
