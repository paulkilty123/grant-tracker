// The 19 live rows whose eligible_structures were guessed by the backstop
// classifier and then contradicted by a sentence the verifier quoted off the
// funder's page. Worked 2026-09-03 at Paul's request, before launch: "I don't
// want people that join seeing funding they are not eligible for."
//
// Each row is decided from the QUOTE, not from the verifier's proposal. The
// proposal is a model's reading and was wrong in both directions: on Pilgrim
// Trust it read "UK registered charities, exempt charities, public bodies" and
// proposed adding CICs, co-ops and unregistered groups; on Landscape
// Connections it read "not-for-profit organisations" and proposed adding only
// "not_registered" to a list that had no charities in it at all.
//
// Two rows are left as they are because the quote supports what we hold:
// Breckland (the form lists every type we have) and Percy Bilton (charities;
// the individuals route is via professionals, not a structure). Peter Sell is
// narrowed to what a Scout or Guide group can be, and its brief already says
// who it is for.
//
// Source is user_verified (70). The direction that fails quietly is
// over-inclusion, so where the quote is vague about a form it is left OUT.
//
//   npx tsx --env-file=.env.local scripts/structures-contradicted-2026-09-03.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:structures-contradicted-2026-09-03'

const CHARITY = ['registered_charity', 'cio', 'scio']

const ROWS: { id: string; title: string; to: string[]; quote: string }[] = [
  { id: '3585a7fa-7907-4f17-9020-0c6f36a21875', title: 'Arts-based Learning Fund (PHF)',
    to: [...CHARITY, 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative', 'unincorporated'],
    quote: 'Arts organisations can be charities, community organisations, social enterprises and not-for-profit companies active in the arts and culture sector' },
  { id: 'e2733c2c-61aa-4323-86a6-01cc14f5f3f2', title: 'Bicker Wind Farm Trust',
    to: [...CHARITY, 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Applicants can be not for profit community groups or social enterprises that support community activity.' },
  { id: '5700594e-ce98-46ea-9818-ce87e5f44286', title: 'Community and Environment Fund / BLEF',
    to: [...CHARITY, 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    quote: 'Who can apply Public Sector, Non-profit' },
  { id: 'cc5f93d2-aa9e-4873-aaa9-2a425b8868e1', title: 'Community Foundation Wales grants hub',
    to: [...CHARITY, 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative', 'unincorporated'],
    quote: 'Charitable Incorporated Organisation (CIO) Community Interest Company (CIC) Community/Town Council Company (Limited by Shares or Guarantee) Individual Industrial & Provident Society Registered Charity School Voluntary/Community Group' },
  { id: '08bdec62-f80f-43dd-ad82-43f80787494c', title: 'Corra Alcohol and Drugs Fund micro grants',
    to: ['registered_charity', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'open to Scottish charities, social enterprises or constituted community/voluntary groups that operate on a not-for-profit basis' },
  { id: 'e0ed3c06-8488-45bf-8514-b06b16019161', title: 'Cripplegate Islington Community Chest',
    to: [...CHARITY.filter(s => s !== 'scio'), 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'ICCC is a small grants funding programme for Islington\'s voluntary and community sector.' },
  { id: '1f86676a-1fca-4c4f-b1d1-291c20224947', title: 'Dudgeon Community STEM in Schools Fund',
    to: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'charities and other not-for-profit organisations that are experienced in working with students ... Who can apply? Charity, School, Social Enterprise/CIC, and Voluntary/Community Group' },
  { id: '3d6656f0-6f74-4635-8c87-0406ded69be2', title: 'Gordon Fraser Charitable Trust',
    to: CHARITY,
    quote: 'Applicants must be organisations which are registered either with the Charity Commission in England and Wales or with the Office of the Scottish Charity Regulator.' },
  { id: '71a96f39-3506-493f-8e48-b56206b175f8', title: 'Heritage and Nature Grants (WSCF)',
    to: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'unincorporated'],
    quote: 'constituted voluntary or community organisation or a registered charity or a not-for-profit company, including Community Interest Companies where ... it is limited by guarantee' },
  { id: '356e9de1-76ae-43bd-999c-134b1567841c', title: 'Heritage of London Trust restoration grants',
    to: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    quote: 'Any community organisation, representative of a community organisation or London local authority can apply for a grant.' },
  { id: '758d3705-6589-43c8-b87f-f01cca2e5ddc', title: 'NLHF Landscape Connections',
    to: [...CHARITY, 'ltd_guarantee', 'cic_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Applications are open to not-for-profit organisations, and partnerships led by not-for-profit organisations, from across the UK.' },
  { id: '4b989eab-79b0-4981-987d-f308f0843fdc', title: 'NLHF Heritage Grants £250,000 to £10m',
    to: [...CHARITY, 'ltd_guarantee', 'cic_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Are you a not-for-profit organisation or a partnership led by a not-for-profit organisation?' },
  { id: '5ed9736a-814f-42b2-89cc-156e880b1740', title: 'Older People\'s Programme (WSCF)',
    to: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'unincorporated'],
    quote: 'constituted voluntary or community organisation or a registered charity or a not-for-profit company, including Community Interest Companies where ... it is limited by guarantee' },
  { id: '8a7c3b87-8539-47bf-aef1-889169c6a2f6', title: 'Peter Sell Award',
    to: [...CHARITY, 'unincorporated'],
    quote: 'It is an award of up to £5,000 to a Scout or Guide group(s)' },
  { id: 'facf81cb-733c-439c-a73a-d98ed6361d8e', title: 'Pilgrim Trust',
    to: CHARITY,
    quote: 'UK registered charities Organisations with exempt charitable status Recognised public bodies' },
  { id: '036a2937-bb8f-4f9e-9840-33a4bd450b33', title: 'Tim Parry Johnathan Ball Foundation',
    to: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    quote: 'Charities working in the areas set out above, which are registered with the Charity Commission and other \'not for profit\' organisations registered with Companies House.' },
  { id: '0e506d16-9e5c-47e0-aae9-7f3444b3646c', title: 'TrustLaw pro bono legal',
    to: [...CHARITY, 'ltd_guarantee', 'cic_guarantee', 'cic_shares', 'cooperative'],
    quote: 'your organisation can request legal support on a wide range of issues' },
]

const UNCHANGED = ['6fbf369d-2b80-40b8-9e94-f9635c0ead13', '50203489-dcd2-44ec-9a3e-7035b825b4fb'] // Breckland, Percy Bilton

async function main() {
  const db = getAdminDb()
  const { data: rows } = await db.from('scraped_grants').select('id, title, eligible_structures').in('id', [...ROWS.map(r => r.id), ...UNCHANGED])
  if (!rows || rows.length !== ROWS.length + UNCHANGED.length) throw new Error(`expected ${ROWS.length + UNCHANGED.length} rows, got ${rows?.length}`)
  const byId = new Map(rows.map(r => [r.id, r]))
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  let changed = 0
  for (const r of ROWS) {
    const cur = (byId.get(r.id)!.eligible_structures as string[]) ?? []
    const to = [...new Set(r.to)].sort()
    const same = JSON.stringify([...cur].sort()) === JSON.stringify(to)
    const dropped = cur.filter(s => !to.includes(s)); const added = to.filter(s => !cur.includes(s))
    console.log(`  ${r.title.padEnd(46)} ${same ? 'no change' : `-${dropped.join(',') || '-'} +${added.join(',') || '-'}`}`)
    if (same || !APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, fields: { eligible_structures: to }, source: SOURCE, db,
      citations: { eligible_structures: { snippet: r.quote, confidence: 'high' } } })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    if (refused.length) console.log('     REFUSED', JSON.stringify(refused)); else changed++
  }
  console.log(`changed ${changed}`)
}
main().catch(e => { console.error(e); process.exit(1) })
