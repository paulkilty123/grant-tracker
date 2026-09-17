// City Bridge Foundation, Communities Building Economic Change, 2026-09-02.
//
// Paul saw the LinkedIn announcement and asked whether we carry it. We do,
// as the staged row "City Bridge Foundation — Economic Justice", which said
// only that the first round opens in September. The announcement page
// (citybridgefoundation.org.uk/news-and-blog/communities-building-economic-
// change-new-funding-opens-soon, read today) gives the round its name, its
// figure, its dates and its income band. Full guidance lands 14 September.
//
//   npx tsx --env-file=.env.local scripts/citybridge-cbec-2026-09-02.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:citybridge-cbec-2026-09-02'
const ID     = '1805dc7a-5123-42d2-b283-dce6b6098556'
const NEWS   = 'https://www.citybridgefoundation.org.uk/news-and-blog/communities-building-economic-change-new-funding-opens-soon'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, pipeline_state, is_active, grant_sources').eq('id', ID).single()
  if (!row || !/economic justice/i.test(row.title)) throw new Error(`wrong row: ${row?.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${row.title} (${row.pipeline_state}/${row.is_active ? 'live' : 'hidden'})`)
  if (!APPLY) return

  const sources = Array.isArray(row.grant_sources) ? row.grant_sources as unknown[] : []
  const r = await mergeGrantUpdate({
    id: ID,
    fields: {
      title: 'City Bridge Foundation Communities Building Economic Change',
      amount_min: null, amount_max: 450000,
      deadline: '2026-11-03', is_rolling: false,
      next_open_date: 'Applications open Tuesday 22 September 2026 and close Tuesday 3 November 2026. Full guidance published 14 September; webinar 15 September.',
      next_open_date_parsed: '2026-09-22',
      min_org_income: 50000, max_org_income: 1500000,
      location_tag: 'London', is_local: true,
      description: 'Core funding of up to £450,000 over five years for small and medium community-rooted organisations tackling economic injustice in London, combining frontline community work with efforts to create longer-term change. Three priority areas: building shared understanding of the economy and what needs to change; securing the essentials people need to live well; increasing community power and control over the decisions that shape people\'s lives. For organisations with annual income between £50,000 and £1.5 million whose work benefits the 32 London boroughs or the City of London. First round of the Economic Justice programme. Applications open 22 September 2026 and close 3 November 2026; full guidance from 14 September.',
      grant_sources: [...sources, { url: NEWS, label: 'Announcement, read 2026-09-02', added_at: '2026-09-02' }],
    },
    source: SOURCE, db,
    citations: {
      amount_max:     { snippet: 'Core funding of up to £450,000 over five years', confidence: 'high' },
      deadline:       { snippet: 'Applications close: Tuesday 3 November', confidence: 'high' },
      next_open_date: { snippet: 'Applications open: Tuesday 22 September 2026', confidence: 'high' },
      min_org_income: { snippet: 'annual income between £50,000 and £1.5 million', confidence: 'high' },
      max_org_income: { snippet: 'annual income between £50,000 and £1.5 million', confidence: 'high' },
    },
  })
  console.log('applied:', r.applied.join(', '))
  const refused = r.rejected.filter(x => x.reason !== 'idempotent')
  if (refused.length) console.log('REFUSED:', JSON.stringify(refused))
}
main().catch(e => { console.error(e); process.exit(1) })
