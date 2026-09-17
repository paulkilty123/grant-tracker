// Lewes Fund: Paul's decision, 2026-09-05. Link to the Sussex Community
// Foundation Main Grants page, and the amount is £1,000 to £10,000 with an
// average award just over £5,000. Replaces his May pin of £2,000 to £5,000,
// which the page never stated. The Lewes Fund page is kept as a banked source
// for the local eligibility.
//
//   npx tsx --env-file=.env.local scripts/lewes-relink-2026-09-05.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const ID = 'f79aada3-721e-487c-9e97-35097aa87ee0'
const MAIN = 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/'
const LEWES = 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/lewes-fund/'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, description').eq('id', ID).single()
  if (!/Lewes/.test(row?.title ?? '')) throw new Error(`wrong row: ${row?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', row!.title)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'admin:paulkilty1@gmail.com', db,
    fields: {
      apply_url: MAIN, url_status: 'unchecked',
      amount_min: 1000, amount_max: 10000,
      grant_sources: [{ url: LEWES, label: 'Lewes Fund page (who and where it funds)', added_at: '2026-09-05' }],
      description: 'Grants for charities and community groups in Lewes and the surrounding parishes supporting disadvantaged local people, made through Sussex Community Foundation\'s Main Grants rounds three times a year. Main grants range from £1,000 to £10,000 and the average award is just over £5,000, for not-for-profit organisations with income up to £2 million. The current round closes on Friday 11 September 2026.',
    },
    citations: {
      amount_max: { snippet: 'range from £1,000 to £10,000', confidence: 'high' },
      apply_url: { snippet: 'Applications close: Friday 11 September', confidence: 'high' },
    } })
  console.log('applied:', r.applied.join(', ') || 'nothing', r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
