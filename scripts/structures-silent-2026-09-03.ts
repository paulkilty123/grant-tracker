// The 69 backstop-guessed rows whose pages said nothing the checker could
// quote about who can apply. Three read-only research passes on 2026-09-03
// found the sentence on the funder's own site for most of them. Every change
// below carries that sentence. Where the site names no legal form the row is
// left alone (NOT STATED is not evidence to narrow OR widen). Where a site
// blocks reading (14 rows) nothing is done here; those get a browser pass.
//
// Rejections are for rows nobody joining Shoots could apply to: the page says
// individuals abroad (Rufford), no unsolicited applications (Climate Change
// Collaboration), nomination only (Earthshot), or lists no such fund at all
// (Active Travel England). Comic Relief says "no live funding opportunities"
// and is parked to watch rather than rejected.
//
//   npx tsx --env-file=.env.local scripts/structures-silent-2026-09-03.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:structures-silent-2026-09-03'
const CH = ['registered_charity', 'cio', 'scio']

const ROWS: { id: string; title: string; to: string[]; quote: string }[] = [
  { id: '15c7fa72-3e20-47e6-a211-a478ffc364af', title: 'Coalfields Regeneration Trust', to: ['registered_charity', 'cio', 'unincorporated'],
    quote: 'Community and voluntary organisations, who manage community facilities ... Voluntary organisations with an appropriate governing document' },
  { id: 'a89ee8f2-cdc6-4673-958c-786a135792c9', title: 'Just Enterprise (Scotland)', to: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'registered_charity', 'scio'],
    quote: 'Just Enterprise provides fully-funded support to social enterprises and enterprising charities in Scotland.' },
  { id: 'f14ca7b1-4e12-48b0-b59c-31b64e602b61', title: 'Forever Manchester', to: ['unincorporated', 'cic_guarantee', 'cic_shares', 'registered_charity', 'cio', 'ltd_guarantee'],
    quote: 'These groups can be constituted community groups, Community Interest Companies, Charities or Companies limited by Guarantee.' },
  { id: '9e63bf54-8956-4816-b32d-d164f99ab0ea', title: 'Chichester City Council', to: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated', 'ltd_guarantee', 'cooperative'],
    quote: 'a non-profit making organisation ... not considered if the applicant is a business or commercial enterprise' },
  { id: '38f3cae0-7d56-422a-aa1f-8691c2540fc9', title: 'Pro Bono Economics', to: [...CH, 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    quote: 'your organisation must be a registered charity or social enterprise, based in the UK and delivering services to UK beneficiaries' },
  { id: 'b5814b20-cfd4-46db-a8dd-3e623ed1c9fd', title: 'Sir Jules Thorn Charitable Trust', to: CH,
    quote: 'Applications will only be accepted from charities registered with the Charity Commission for England and Wales or the equivalent regulator in other parts of the UK.' },
  { id: '574fc073-bca6-4b01-95c0-a7dc8627c3e0', title: 'Dulverton Trust', to: CH,
    quote: 'We fund charities and CIOs with a national reach working within the above funding categories that meet our eligibility.' },
  { id: '595ccabb-817c-48a1-9f3d-de394d09a458', title: 'Forte Charitable Foundation', to: [...CH, 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Charitable organisations (including social enterprises, not-for-profit registered companies and voluntary organisations) ... We do not fund CICs.' },
  { id: 'b7d19a10-753c-4294-95ad-ec43ac71595d', title: 'Kusuma Trust UK', to: ['registered_charity'],
    quote: 'Be an NHS hospital charity linked to a hospital with in-patient facilities which provide tertiary cardiac services' },
  { id: 'd4182e66-f88d-4d50-a331-318167045de6', title: 'Nuffield Foundation', to: [...CH, 'ltd_guarantee'],
    quote: 'We award grants to a wide range of organisations, including universities, research organisations, and voluntary sector bodies ... Projects led by individuals unaffiliated to any particular organisation' },
  { id: '1ffe7161-587d-48ce-86a2-39a94a9120ad', title: 'The Weavers\' Company', to: CH,
    quote: 'UK registered charities and charitable incorporated organisations (CIOs) only.' },
  { id: 'e0c1a655-d377-481b-b806-0c171095f7be', title: 'Aviva Financial Futures Fund', to: [...CH, 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Charities, CICs, and social enterprises are eligible if they meet the income threshold and align with the funder\'s mission.' },
  { id: '87805cc2-c24b-4562-9a2b-129559fcdf9f', title: 'Buttle UK Chances for Children', to: CH,
    quote: 'Applications can only be made by frontline professionals working for a: registered charity, housing association, public sector organisation.' },
  { id: 'd51e7f33-1464-4181-a535-8265fd923587', title: 'Hargreaves Foundation', to: CH,
    quote: 'We will consider applications from the following: Registered Charities or Charitable Incorporated Organisations ... We do not fund: Individuals; Social Enterprises including Community Interest Companies; Private Companies' },
  { id: 'bec586cc-4172-4d15-bb05-5fd5f24c7bb9', title: 'Innovate UK Innovation Loans', to: ['ltd_shares', 'ltd_guarantee', 'cic_shares', 'cic_guarantee', 'cooperative'],
    quote: 'UK registered micro, small and medium sized businesses (SMEs) can apply for loan funding' },
  { id: '32e9cb1d-4e0d-4554-a4c3-569bc4e0b9fb', title: 'Active Spaces Fund', to: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Community Interest Companies without share capital ... Registered charities ... Unincorporated associations' },
  { id: 'de28e64c-6385-495d-8aa8-eac9d3d7a675', title: 'The UK Fund (TNLCF)', to: [...CH, 'ltd_guarantee', 'cic_guarantee', 'cooperative'],
    quote: 'companies that can pay profits to directors, shareholders or members (including companies limited by shares)' },
  { id: '29e9ed97-ea0a-4b23-8a11-50d59ccf85a7', title: 'Strengthening Communities (TNLCF)', to: ['registered_charity', 'cio', 'unincorporated', 'ltd_guarantee', 'cic_guarantee', 'cooperative'],
    quote: 'companies that can pay profits to directors, shareholders or members (including companies limited by shares)' },
  { id: 'e2caeabf-32ee-46c8-8263-34eecae77e59', title: 'People and Places (TNLCF)', to: ['registered_charity', 'cio', 'unincorporated', 'ltd_guarantee', 'cic_guarantee', 'cooperative'],
    quote: 'companies that can pay profits to directors, shareholders or members' },
  { id: 'cd293f78-a57b-4f6d-b524-84239c1b5328', title: 'Young Start (TNLCF)', to: ['registered_charity', 'scio', 'unincorporated', 'ltd_guarantee', 'cic_guarantee', 'cooperative'],
    quote: 'Individuals or sole traders, Schools, companies limited by shares' },
  { id: 'd87d92b9-1415-4ab9-a021-853ca441eb3b', title: 'Burton Wold Community Wind Farm Fund', to: ['registered_charity', 'cio', 'unincorporated'],
    quote: 'Your group must be a small, locally managed, voluntary, community or self-help group ... social enterprises with persons with significant control (PSC)' },
  { id: '53dd63b0-f850-4a8e-a28f-6b84704e810f', title: 'Salesforce Power of Us', to: [...CH, 'cic_guarantee', 'cic_shares'],
    quote: 'UNITED KINGDOM: Charity Registration Number from Charity Commission, CIC Registration Number from CIC Regulator' },
  { id: '1a581b72-7c47-4707-8cd9-4ad4df9f1b59', title: 'Central Fund (Suffolk CF)', to: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    quote: 'Must be a Company Limited by Guarantee (e.g. CIC) ... We cannot fund organisations limited by shares or profit-sharing models.' },
  { id: '3f5d135b-c001-4cc3-8ae3-049a9b85baef', title: 'Whirlwind Charitable Trust', to: CH,
    quote: 'Generally, you need to be a register charity.' },
  { id: 'eba2e8e8-5126-4ea2-9cd5-c36f2881eb07', title: 'Catalyser Fund (Youth Music)', to: [...CH, 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative', 'unincorporated'],
    quote: 'You are a constituted UK based organisation. Sole traders, and individuals, can\'t apply to this fund. If you are a voluntary group not registered with Companies House or the Charity Commission, you must have a constitution and management committee.' },
]

const REJECT: { id: string; title: string; code: string; note: string; quote: string }[] = [
  { id: 'ef0fb22e-9a43-4042-b50b-5ceb3dc9c1ce', title: 'Rufford Small Grants', code: 'out_of_scope',
    note: 'early-career individuals in developing countries, not UK organisations',
    quote: 'We focus on supporting current MSc or PhD students or recent graduates ... Your project must be working in an eligible country' },
  { id: '3a7ce03a-4fc8-49d4-b87e-f1a904e22e54', title: 'Climate Change Collaboration', code: 'out_of_scope',
    note: 'no unsolicited applications; a confirmed no-route',
    quote: 'We do not accept unsolicited enquiries or applications.' },
  { id: '8b9e8482-2311-4ead-8fc5-924f82803b19', title: 'Earthshot Prize', code: 'out_of_scope',
    note: 'nomination only through Official Nominators; no application route',
    quote: 'we combine thousands of submissions from hundreds of Official Nominators around the world with our own science-backed research' },
  { id: '916f02b0-714f-4489-8528-5784c4a38cf9', title: 'Active Travel England Communities and Engagement', code: 'non_funder',
    note: 'no such fund on the page; the page lists local-authority funds only',
    quote: 'No fund explicitly called Communities and Engagement appears on this page.' },
]

const WATCH = { id: '3b90b319-ebd8-448a-af7a-ad85a0e55556', title: 'Comic Relief UK Grants Poverty',
  when: 'No live funding opportunities as at 3 September 2026', quote: 'There are currently no live funding opportunities.' }

async function main() {
  const db = getAdminDb()
  const ids = [...ROWS.map(r => r.id), ...REJECT.map(r => r.id), WATCH.id]
  const { data: rows } = await db.from('scraped_grants').select('id, title, eligible_structures, is_active, pipeline_state').in('id', ids)
  if (!rows || rows.length !== ids.length) throw new Error(`expected ${ids.length}, got ${rows?.length}`)
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
  console.log('\n-- reject')
  for (const r of REJECT) {
    const cur = byId.get(r.id)!
    console.log(`  ${r.title.padEnd(40)} ${cur.pipeline_state}/${cur.is_active ? 'live' : 'hidden'} -> rejected (${r.code})`)
    if (!APPLY) continue
    await mergeGrantUpdate({ id: r.id, fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(r.code, `${r.note}. Page: "${r.quote}"`) }, source: SOURCE, db })
  }
  console.log('\n-- watch')
  console.log(`  ${WATCH.title} -> between rounds`)
  if (APPLY) await mergeGrantUpdate({ id: WATCH.id, fields: { is_active: false, pipeline_state: 'between_rounds_scheduled', next_open_date: WATCH.when }, source: SOURCE, db,
    citations: { next_open_date: { snippet: WATCH.quote, confidence: 'high' } } })
  console.log(`\nstructures changed ${changed}`)
}
main().catch(e => { console.error(e); process.exit(1) })
