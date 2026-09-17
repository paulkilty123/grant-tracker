// Six rows whose next_open_date states a plain date and whose
// next_open_date_parsed is null. A between-rounds row with a null parsed date
// never returns on its own; a published one never flips to "check it". The
// parsed date is derived from the row's own prose, so it adds no claim.
// Rows Paul pinned (Wimbledon "Summer 2026", Bromley Trust) are left alone.
//   npx tsx --env-file=.env.local scripts/open-date-parsed-backfill-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { id: '333bc785-de7a-43c8-bcba-e22b083a8a69', re: /Grassroots Grants/, prose: /2027-01-01/, parsed: '2027-01-01' },
  { id: '18d9e659-bfdc-4d37-9625-6e740f7b46e8', re: /ScottishPower/, prose: /2027-07-01/, parsed: '2027-07-01' },
  { id: '5a00d50c-5244-4850-a6f9-af242703b7f2', re: /Selco/, prose: /2027-04-01/, parsed: '2027-04-01' },
  { id: 'e42b9811-5acf-4472-8ff2-a08db6f9a356', re: /Small Grants Scheme/, prose: /14 September 2026/, parsed: '2026-09-14' },
  { id: '69275979-6c40-45f6-afe6-6c76b22c5468', re: /Grocers' Charity — Open/, prose: /31 March 2027/, parsed: '2027-03-31' },
  { id: 'e3a38c56-f840-4ead-875a-9c9266e4a72f', re: /Blackford/, prose: /expected March/, parsed: '2027-03-01' },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, next_open_date, next_open_date_parsed').eq('id', r.id).single()
    if (!data || !r.re.test(data.title) || !r.prose.test(data.next_open_date ?? '')) throw new Error(`${r.id}: ${data?.title} / ${data?.next_open_date}`)
    console.log(`  ${data.title.slice(0, 40).padEnd(40)} ${data.next_open_date_parsed ?? 'null'} -> ${r.parsed}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, source: 'user_verified:timing-audit-2026-09-06', db, fields: { next_open_date_parsed: r.parsed } })
    console.log('     applied', res.applied)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
