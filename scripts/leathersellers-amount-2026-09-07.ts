// Leathersellers' Foundation Main Grants: the row held £20,000 to £20,000
// from an April scrape of a listing site. The checker read the funder page
// today, "Four year grants of £20,000-£25,000 per annum are available to
// charities and CIOs throughout the UK", and proposed £25,000, but a proposal
// on a row in review waits for a person. Applied here from that quote.
//   npx tsx --env-file=.env.local scripts/leathersellers-amount-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = '5fa1e39d-b4bd-4376-a339-b72b33077a2a'
const URL = 'https://leathersellers.org/grant/charity-main-grants/'
const QUOTE = 'Four year grants of £20,000-£25,000 per annum are available to charities and CIOs throughout the UK.'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, amount_min, amount_max').eq('id', ID).single()
  if (!data || !/Leathersellers/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `${data.amount_min}-${data.amount_max} -> 20000-25000`)
  if (!APPLY) return
  const cit = { snippet: QUOTE, confidence: 'high' as const, source_url: URL }
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:verdicts-2026-09-07', db, fields: { amount_min: 20000, amount_max: 25000 }, citations: { amount_min: cit, amount_max: cit } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
