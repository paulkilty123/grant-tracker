// Ten live trusts were scraped from the Young Camden Foundation directory.
// Each entry has its own "Funder | No Min - £X" field, followed by a list of
// other funds whose figures the old scraper sometimes picked up (Hollick was
// the case found by the amounts session). Read every entry's own field on
// 7 Sept. Four rows differ from it; none of these trusts has a website, so
// the directory is the only page and its own field is the evidence, at low.
//   Adint: min £5,000 unsupported (No Min - £10,000)
//   Ancaster: min £100 unsupported (No Min - £300)
//   Dixie Rose Findlay: £1,000-£2,500 vs No Min - £4,000
//   Lambert: £1,000-£15,000 vs No Min - No Max
// Fitton (No Min - £350, row £150-£350) is Paul's pin and goes to him.
//   npx tsx --env-file=.env.local scripts/young-camden-amounts-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { id: '86380b2e-1c74-4cd3-b560-663a021bc097', re: /Adint/, min: null, max: 10000, own: 'No Min - £10,000' },
  { id: 'f8a83056-ccaf-4b10-8b45-aa7b7b01a080', re: /Ancaster/, min: null, max: 300, own: 'No Min - £300' },
  { id: 'ca53ae09-15ca-41a3-bd09-70d97d1b068f', re: /Dixie Rose/, min: null, max: 4000, own: 'No Min - £4,000' },
  { id: '97242e7b-33ec-4249-b46b-b54f039818d5', re: /Lambert/, min: null, max: null, own: 'No Min - No Max' },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, apply_url, amount_min, amount_max').eq('id', r.id).single()
    if (!data || !r.re.test(data.title)) throw new Error(`${r.id}: ${data?.title}`)
    console.log(`  ${data.title.slice(0, 34).padEnd(34)} ${data.amount_min}-${data.amount_max} -> ${r.min}-${r.max}  (directory: ${r.own})`)
    if (!APPLY) continue
    const cit = { snippet: `Funder ${r.own} no deadline`, confidence: 'low' as const, source_url: data.apply_url }
    const res = await mergeGrantUpdate({ id: r.id, source: 'user_verified:young-camden-amounts-2026-09-07', db, fields: { amount_min: r.min, amount_max: r.max },
      citations: { amount_min: cit, amount_max: cit } })
    console.log('     applied', res.applied, res.rejected.filter(x => x.reason !== 'idempotent'))
  }
}
main().catch(e => { console.error(e); process.exit(1) })
