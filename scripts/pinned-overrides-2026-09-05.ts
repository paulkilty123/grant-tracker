// Pinned values that the funder's page, read 2026-09-05, contradicts. Admin
// trust because only admin outranks a pin. One pin is left standing: Lewes
// Fund's £2,000 to £5,000 (Paul, 26 May). The Lewes page states no figure and
// the Main Grants page it routes through says £1,000 to £10,000; a sub-fund
// cap Paul set by hand is not disproved by the parent range, so it stays.
//
//   npx tsx --env-file=.env.local scripts/pinned-overrides-2026-09-05.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SOURCE = 'admin:paulkilty1@gmail.com'
const ROWS = [
  { id: '31f56c84-447a-478b-a15a-fcb19469c1aa', title: 'UK and Ireland Community Tree Planting Grant',
    fields: { amount_max: null },
    quote: 'The grants page states no per-project figure: "This is set at 10p per tree for each year ... Read our guidelines before you apply." The £21,500 pinned on 18 August is on no page read today.' },
  { id: 'f2e16253-0b5f-4aac-8415-0cfb00771d81', title: 'Innovate UK Investor Partnerships',
    fields: { funding_type: 'investment', amount_min: null, amount_max: null,
      description: 'Innovate UK R&D grants paired with aligned equity investment of at least one to two times the grant, led by one of Innovate UK\'s approved investor partners. For high-growth UK micro, small and medium-sized businesses that already have a relationship with an approved investor. The page states no grant range and no current competition dates.' },
    quote: 'non-dilutive capital ... paired with aligned equity investment from 105 investor partners ... at least 1-2x the amount of grant funding. The £35,000 to £900,000 pinned on 2 June is on no page read today.' },
  { id: '9192771f-4c81-4761-8a59-9a39231b973c', title: 'Tower Hamlets Mayor\'s Small Grants',
    fields: { max_org_income: 150000 },
    quote: 'small organisations with a maximum annual income of £150,000' },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data: row } = await db.from('scraped_grants').select('title, amount_max, funding_type, max_org_income').eq('id', r.id).single()
    if (!row || !row.title.toLowerCase().startsWith(r.title.slice(0, 12).toLowerCase())) throw new Error(`wrong row for ${r.title}: ${row?.title}`)
    console.log(`  ${r.title.padEnd(46)} ${JSON.stringify({ amount_max: row.amount_max, funding_type: row.funding_type, max_org_income: row.max_org_income })} -> ${JSON.stringify(r.fields)}`)
    if (!APPLY) continue
    const cits = Object.fromEntries(Object.keys(r.fields).map(f => [f, { snippet: r.quote, confidence: 'high' as const }]))
    const res = await mergeGrantUpdate({ id: r.id, fields: r.fields, source: SOURCE, pinned: true, db, citations: cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? ` REFUSED ${JSON.stringify(refused)}` : ''}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
