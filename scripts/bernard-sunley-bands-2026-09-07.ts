// Bernard Sunley Foundation publishes three grant bands on its Our Grant
// Giving page, in a table the site renders from an attribute: Large £25,000
// and above, Medium up to £20,000, Small £5,000 and under. Large has no
// ceiling and Small no floor, so no pair of amount columns holds this; the
// bands go in prose. The Capital Grants row already says so; the Social
// Welfare row said "specific amounts are not stated", which is wrong.
//   npx tsx --env-file=.env.local scripts/bernard-sunley-bands-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = 'c51eaae1-2007-4930-a45a-4da9f7542c1c'
const URL = 'https://bernardsunley.org/our-grant-giving/'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, funder_brief').eq('id', ID).single()
  if (!data || !/Bernard Sunley.*Social Welfare/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, '\n  typical_award:', brief.typical_award, '-> three bands')
  if (!APPLY) return
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.typical_award = 'Three grant levels: Large £25,000 and above; Medium up to £20,000; Small £5,000 and under. Grants are a contribution to project costs and the trustees decide the amount, so you do not name a figure.'
  cits.typical_award = { snippet: 'Large £25,000 and above; Medium Up to £20,000; Small £5,000 and under (grant levels table)', confidence: 'high', source_url: URL }
  brief._citations = cits
  const r = await mergeGrantUpdate({ id: ID, source: 'admin:paulkilty1@gmail.com', db, fields: { funder_brief: brief } })
  console.log('applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
