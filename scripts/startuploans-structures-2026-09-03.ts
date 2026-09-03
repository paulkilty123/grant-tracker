// Start Up Loans, read in a browser 2026-09-03 (the host 403s fetchers).
// The homepage says "Unsecured personal loan": the borrower is a person, not
// an organisation. Held structures listed CICs, companies and co-ops, which
// would match it to organisations that cannot take a personal loan. Now
// individual and sole_trader only, so it stays in the catalogue for founders
// and stops matching charities and CICs.
//
//   npx tsx --env-file=.env.local scripts/startuploans-structures-2026-09-03.ts --apply

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const ID = '8f63ed16-b59e-4dd5-9ea5-56130e9aaf2e'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, eligible_structures').eq('id', ID).single()
  if (!/Start Up Loans/.test(row?.title ?? '')) throw new Error(`wrong row: ${row?.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${row!.title} ${JSON.stringify(row!.eligible_structures)} -> individual, sole_trader`)
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: ID, fields: { eligible_structures: ['individual', 'sole_trader'] }, source: 'user_verified:structures-silent-2026-09-03', db,
    citations: { eligible_structures: { snippet: 'Borrow up to £25,000. Unsecured personal loan. Fixed interest rate of 7.5% per year', confidence: 'high' } } })
  console.log('applied:', r.applied.join(', ') || 'nothing', r.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(r.rejected) : '')
}
main().catch(e => { console.error(e); process.exit(1) })
