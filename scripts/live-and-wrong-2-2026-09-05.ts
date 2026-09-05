// Second pass on "live and wrong", 2026-09-05: the four the first pass left
// with a cheap remaining cause.
//   Cash for Kids — the cost-of-living page is empty, so the row points at
//     the grants index it already had banked; apply_url and index now match,
//     which is what the front-door rule reads.
//   Tower Hamlets — the page is the Mayor's Small Grants Programme; the row
//     was titled "Community Grant Programme", so the checker read it as a
//     different fund. Retitled, index banked.
//   Ffilm Cymru — the brief's typical_award still carried £77,000, a figure
//     the overview page does not state; that is what "amount ungrounded" is.
//   StreetGames — my own edit put "£9.84 million" into typical_award, which
//     the same check then flagged. The figure comes out; membership is free.
//   npx tsx --env-file=.env.local scripts/live-and-wrong-2-2026-09-05.ts --apply
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SOURCE = 'user_verified:live-and-wrong-2026-09-05'
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  const run = async (id: string, what: string, fields: Record<string, unknown>) => {
    console.log(`  ${what.padEnd(34)} -> ${Object.keys(fields).join(', ')}`)
    if (!APPLY) return
    const r = await mergeGrantUpdate({ id, fields, source: SOURCE, db })
    const refused = r.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${r.applied.join(', ') || 'nothing'}]${refused.length ? ` REFUSED ${JSON.stringify(refused)}` : ''}`)
  }
  const briefOf = async (id: string) => {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', id).single()
    return { ...((data?.funder_brief ?? {}) as Record<string, unknown>) }
  }
  await run('91737208-0bd3-45c4-8866-ec6256e85a58', 'Cash for Kids', { apply_url: 'https://cashforkids.org.uk/grants/', url_status: 'unchecked' })
  await run('9192771f-4c81-4761-8a59-9a39231b973c', 'Tower Hamlets', { title: 'Tower Hamlets Mayor\'s Small Grants Programme', funding_index_url: 'https://www.towerhamlets.gov.uk/lgnl/community_and_living/voluntary-and-community-sector/Council-funding-for-VCS/small-grants/Mayors-Small-Grants-Programme.aspx' })
  const ff = await briefOf('c1ca1f42-98fa-471c-ad65-b078bf97c20c')
  ff.typical_award = 'Amounts are set per strand in each fund\'s guidelines; the overview page states no figure.'
  await run('c1ca1f42-98fa-471c-ad65-b078bf97c20c', 'Ffilm Cymru brief', { funder_brief: ff })
  const sg = await briefOf('f7e51198-d22b-484a-bec3-aadbe08fb748')
  sg.typical_award = 'Membership is free. Funding reaches community partners through StreetGames\' own programmes rather than a fixed award.'
  await run('f7e51198-d22b-484a-bec3-aadbe08fb748', 'StreetGames brief', { funder_brief: sg })
}
main().catch(e => { console.error(e); process.exit(1) })
