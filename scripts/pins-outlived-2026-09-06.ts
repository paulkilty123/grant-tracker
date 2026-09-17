// Four pins overtaken by their funders' pages, updated at Paul's word on
// 6 Sept from what the timing session read that day. Admin source because
// each replaces an admin value. Parsed dates written only after the prose.
//   npx tsx --env-file=.env.local scripts/pins-outlived-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'admin:paulkilty1@gmail.com'
type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url: string }>
const ROWS: { id: string; re: RegExp; fields: Record<string, unknown>; parsed?: string | null; cits: Cit }[] = [
  { id: '497400aa-4785-41b3-ae15-88e35fe38845', re: /Morrisons/, fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'There is no fixed deadline to apply for a Connecting Communities grant, we process applications monthly.', confidence: 'high', source_url: 'https://www.morrisonsfoundation.com/connecting-communities-grant-request' } } },
  { id: 'bec586cc-4172-4d15-bb05-5fd5f24c7bb9', re: /Innovation Loans/, fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'There is no submission deadline', confidence: 'high', source_url: 'https://iuk-business-connect.org.uk/programme/innovation-loans/' } } },
  { id: '056ad3b9-2bb0-4d09-be11-672e6c6c23e5', re: /Community Capacity/, fields: { next_open_date: 'Coming autumn 2026' }, parsed: '2026-09-01',
    cits: { next_open_date: { snippet: 'Closing date: Coming autumn 2026', confidence: 'med', source_url: 'https://oxfordshire.org/ocf_grants/community-capacity-2/' } } },
  { id: 'ca27a805-4ee8-437d-9ae6-a90cc9e66739', re: /Glasspool/, fields: { next_open_date: 'No new round before 2027' }, parsed: '2027-01-01',
    cits: { next_open_date: { snippet: 'We do not anticipate entering into a new recruitment round before 2027.', confidence: 'high', source_url: 'https://www.glasspool.org.uk/' } } },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, is_rolling, next_open_date').eq('id', r.id).single()
    if (!data || !r.re.test(data.title)) throw new Error(`${r.id}: ${data?.title}`)
    console.log(`  ${data.title.slice(0, 40).padEnd(40)} ${JSON.stringify({ is_rolling: data.is_rolling, next_open_date: data.next_open_date })} -> ${JSON.stringify(r.fields)}${r.parsed ? ' parsed ' + r.parsed : ''}`)
    if (!APPLY) continue
    const a = await mergeGrantUpdate({ id: r.id, source: SRC, db, fields: r.fields, citations: r.cits })
    const refused = a.rejected.filter(x => x.reason !== 'idempotent')
    if (refused.length) { console.log('     REFUSED', refused); continue }
    let more: string[] = []
    if (r.parsed !== undefined && a.applied.includes('next_open_date')) more = (await mergeGrantUpdate({ id: r.id, source: SRC, db, fields: { next_open_date_parsed: r.parsed } })).applied
    console.log('     applied', [...a.applied, ...more])
  }
}
main().catch(e => { console.error(e); process.exit(1) })
