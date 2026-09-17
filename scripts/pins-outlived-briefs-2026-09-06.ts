// The brief's decision_timeline line on two of the four pin rows still says
// nothing about timing. Set it to the page's own sentence, brief field only.
//   npx tsx --env-file=.env.local scripts/pins-outlived-briefs-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { id: '497400aa-4785-41b3-ae15-88e35fe38845', re: /Morrisons/, url: 'https://www.morrisonsfoundation.com/connecting-communities-grant-request',
    dt: 'No fixed deadline. Applications are processed monthly.', q: 'There is no fixed deadline to apply for a Connecting Communities grant, we process applications monthly.' },
  { id: 'bec586cc-4172-4d15-bb05-5fd5f24c7bb9', re: /Innovation Loans/, url: 'https://iuk-business-connect.org.uk/programme/innovation-loans/',
    dt: 'No submission deadline. Applications are open year round.', q: 'There is no submission deadline' },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, funder_brief').eq('id', r.id).single()
    if (!data || !r.re.test(data.title)) throw new Error(`${r.id}: ${data?.title}`)
    const brief = { ...(data.funder_brief as Record<string, unknown>) }
    const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
    console.log(`  ${data.title.slice(0, 36).padEnd(36)} "${brief.decision_timeline}" -> "${r.dt}"`)
    if (!APPLY) continue
    brief.decision_timeline = r.dt; brief.open_status = 'open'
    cits.decision_timeline = { snippet: r.q, confidence: 'high', source_url: r.url }
    brief._citations = cits
    const res = await mergeGrantUpdate({ id: r.id, source: 'admin:paulkilty1@gmail.com', db, fields: { funder_brief: brief } })
    console.log('     applied', res.applied)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
