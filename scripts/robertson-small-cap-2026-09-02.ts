// Robertson Trust Small Grants: the £50,000 ceiling was pinned by Paul on
// 2026-06-30 when this row covered Small AND Large grants together. On
// 2026-09-02 the row became Small Grants alone (Large Grants is its own row),
// and the small-grants page says £5,000 to £20,000 a year. The pin outranks a
// user_verified write, so this is the one admin-level write of the day.
//
//   npx tsx --env-file=.env.local scripts/robertson-small-cap-2026-09-02.ts --apply

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const ID = '46d26bc7-f120-4b66-b4e2-303dcabe0c39'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, amount_max').eq('id', ID).single()
  if (row?.title !== 'Robertson Trust Small Grants') throw new Error(`wrong row: ${row?.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: amount_max ${row.amount_max} -> 20000`)
  if (!APPLY) return
  const r = await mergeGrantUpdate({
    id: ID, fields: { amount_max: 20000 }, source: 'admin:paulkilty1@gmail.com', pinned: true, db,
    citations: { amount_max: { snippet: 'Unrestricted or restricted revenue funding of between £5,000 and £20,000 per year, normally for 3 years', confidence: 'high' } },
  })
  console.log('applied:', r.applied.join(', ') || 'nothing', r.rejected.length ? JSON.stringify(r.rejected) : '')
}
main().catch(e => { console.error(e); process.exit(1) })
