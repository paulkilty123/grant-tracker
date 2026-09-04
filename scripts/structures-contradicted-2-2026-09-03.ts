// Second batch, 2026-09-03: the checker was run over the 86 backstop-guessed
// rows whose structures had never been tested. 11 came back contradicted by a
// quote. Decided from the quote, as in structures-contradicted-2026-09-03.ts.
// Four of the 11 need no change (Breckland, Corra, Energy Redress, Percy
// Bilton): the quote supports what we hold and the checker's "widen" added a
// form the quote does not name.
//
//   npx tsx --env-file=.env.local scripts/structures-contradicted-2-2026-09-03.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:structures-contradicted-2026-09-03'

const ROWS: { id: string; title: string; to: string[]; quote: string }[] = [
  { id: '791f1756-4303-431e-b50a-fee89460c633', title: 'Camden Giving We Make Camden Kit',
    to: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'unincorporated', 'not_registered'],
    quote: 'Camden-based constituted voluntary and community sector organisations (VCSOs) Un-constituted groups with an annual income below £250,000' },
  { id: '056ad3b9-2bb0-4d09-be11-672e6c6c23e5', title: 'Community Capacity Fund',
    to: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'cic_shares', 'unincorporated'],
    quote: 'Registered Charity, Charitable Incorporated Organisation, Charitable Company (Limited by Guarantee), Community Interest Company, a Constituted but Unincorporated Club or Association' },
  { id: 'ab04ad98-849c-4876-9d01-1bc50a07a9a9', title: 'Crisis and Resilience Fund',
    to: ['registered_charity', 'cio', 'scio', 'ltd_guarantee', 'cic_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Applications are welcome from charities, community and voluntary groups and not for profits. Housing associations can also apply.' },
  { id: '620a09c4-a08b-42ef-ac30-c25af9819fdb', title: 'Tyne & Wear High Sheriff Awards',
    to: ['registered_charity', 'cio', 'unincorporated'],
    quote: 'The Tyne & Wear High Sheriff\'s Awards are made to voluntary and community organisations and registered charities based and working in Tyne and Wear.' },
  { id: '0aac4dfb-fc85-4cdf-a3e9-79ca9dd4f7d3', title: 'Q Futures Community Fund',
    to: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'cic_shares', 'unincorporated'],
    quote: 'Applicants may be constituted voluntary and community groups, registered charities, social enterprises, companies limited by guarantee without share capital, CICs and CIOs.' },
  { id: 'f1f498ee-a106-4975-984d-18db562d9c10', title: 'The Thomas Farr Charity',
    to: ['registered_charity', 'cio', 'unincorporated'],
    quote: 'registered charities, constituted voluntary and community groups' },
  { id: 'dbf2a937-f72b-49f5-9a02-d827a1f9d191', title: 'Youth Fund (Paul Hamlyn)',
    to: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'not-for-profit organisations which can be charities, community organisations, social enterprises and not-for-profit companies with a turnover over £30,000 and under £3.5 million.' },
]

async function main() {
  const db = getAdminDb()
  const { data: rows } = await db.from('scraped_grants').select('id, title, eligible_structures').in('id', ROWS.map(r => r.id))
  if (!rows || rows.length !== ROWS.length) throw new Error(`expected ${ROWS.length}, got ${rows?.length}`)
  const byId = new Map(rows.map(r => [r.id, r]))
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  let changed = 0
  for (const r of ROWS) {
    const cur = (byId.get(r.id)!.eligible_structures as string[]) ?? []
    const to = Array.from(new Set(r.to)).sort()
    const dropped = cur.filter(s => !to.includes(s)); const added = to.filter(s => !cur.includes(s))
    const same = dropped.length === 0 && added.length === 0
    console.log(`  ${r.title.padEnd(40)} ${same ? 'no change' : `-${dropped.join(',') || '-'} +${added.join(',') || '-'}`}`)
    if (same || !APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, fields: { eligible_structures: to }, source: SOURCE, db,
      citations: { eligible_structures: { snippet: r.quote, confidence: 'high' } } })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    if (refused.length) console.log('     REFUSED', JSON.stringify(refused)); else changed++
  }
  console.log(`changed ${changed}`)
}
main().catch(e => { console.error(e); process.exit(1) })
