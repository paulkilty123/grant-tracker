// Backstage Trust: "up to £500,000" came from Funding for All's listing, not
// the trust. The trust states no minimum or maximum; the £4m to £6m a year is
// its total spend. Paul, 6 Sept: not disclosed. Admin source replaces the
// June pin.
//   npx tsx --env-file=.env.local scripts/backstage-amount-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = '040888ac-bdd1-4a22-9f33-cc841f9b5cbb'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, amount_max, funder_brief').eq('id', ID).single()
  if (!data || !/Backstage/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, data.amount_max, '-> null')
  if (!APPLY) return
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  brief.typical_award = 'Not disclosed. The trust states no minimum or maximum grant; it spends between £4 million and £6 million a year across all its grants.'
  const r = await mergeGrantUpdate({ id: ID, source: 'admin:paulkilty1@gmail.com', db, fields: { amount_min: null, amount_max: null, funder_brief: brief },
    citations: { amount_max: { snippet: 'No minimum or maximum is stated by the trust', confidence: 'high' } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
