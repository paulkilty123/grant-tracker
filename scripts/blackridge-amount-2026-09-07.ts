// Blackridge Community Fund, a pile B publish verdict: the page states
// "Typical grant size Up to £5,000" and "Grant size typically available:
// £500 - £5,000"; the row held nothing. The checker read both today.
//   npx tsx --env-file=.env.local scripts/blackridge-amount-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = '4ecd6375-b06c-47af-b249-d1f1080f99f4'
const URL = 'https://foundationscotland.org.uk/apply-for-funding/funding-available/blackridge'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, amount_min, amount_max').eq('id', ID).single()
  if (!data || !/Blackridge/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `${data.amount_min}-${data.amount_max} -> 500-5000`)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:verdicts-2026-09-07', db, fields: { amount_min: 500, amount_max: 5000 },
    citations: { amount_min: { snippet: 'Grant size typically available: £500 - £5,000', confidence: 'high', source_url: URL }, amount_max: { snippet: 'Typical grant size Up to £5,000', confidence: 'high', source_url: URL } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
