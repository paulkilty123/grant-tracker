// Investment front-door walk, step two of docs/investment-breadth-proposal-2026-09-10.md.
// Run 10 Sept 2026 on Paul's "go onto step 2". Sixteen live investment rows that
// pointed at a homepage or index were read by direct fetch; every quote below
// was fetched in this session. No model call.
//
// STAGES: funds the provider lists on their own pages that we hold in no state,
// inserted hidden at system trust for review.
// RELINKS: live rows moved from an index to the fund's own page, with the
// fields the page states. The SIS row becomes its Community Finance Fund.
// Not touched here, Paul's call: Access (wholesaler), Foundation Scotland
// homepage duplicate, Start Up Loans and SWIG (personal loans to individuals),
// Screen Scotland (a grant typed investment), Triodos (index; small loans page
// is £100k to £1m).
//
//   npx tsx --env-file=.env.local <this file> [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant, mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:investment-frontdoors-2026-09-10'
const UV = 'user_verified:investment-frontdoors-2026-09-10'
const TODAY = '2026-09-10'
const WALES = ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated']
const SCOT = ['registered_charity', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative']

const RELINKS: { idPrefix: string; label: string; fields: Record<string, unknown> }[] = [
  { idPrefix: 'aa43adba', label: 'SIS homepage row -> SIS Community Finance Fund', fields: {
    title: 'SIS Community Finance Fund', apply_url: 'https://www.socialinvestmentscotland.com/investment/sis-community-finance-fund/',
    amount_min: 10000, amount_max: 375000, funding_subtypes: ['loan', 'social_investment'] } },
  { idPrefix: '759177bd', label: 'Esmée Fairbairn -> apply for social investment page', fields: {
    apply_url: 'https://esmeefairbairn.org.uk/our-support/social-investment/apply-for-social-investment/' } },
  { idPrefix: '200ad44b', label: 'S J Noble Trust -> loans page; limited companies only', fields: {
    apply_url: 'https://sjnobletrust.scot/loans/', amount_max: 10000, funding_subtypes: ['loan'],
    eligible_structures: ['ltd_shares', 'ltd_guarantee', 'cic_shares', 'cic_guarantee'] } },
  { idPrefix: '9bcadb67', label: 'Community Finance Ireland -> apply page', fields: {
    apply_url: 'https://www.communityfinanceireland.com/apply' } },
  { idPrefix: '283f4277', label: 'Community Shares Booster Fund: subtype "restricted" is not an instrument', fields: {
    funding_subtypes: ['community_shares', 'blended'] } },
]

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const brief = (u: string, b: Record<string, unknown>) => ({ source: 'live_fetch', last_enriched: TODAY, open_status: 'open', ...b, _source_url: u })
const NEW: Row[] = [
  { title: 'Social Investment Cymru Bridge and Build Loans', funder: 'WCVA (Social Investment Cymru)', funding_type: 'investment', funding_subtypes: ['loan', 'social_investment'],
    apply_url: 'https://wcva.cymru/funding/social-investment-cymru/bridge-and-build-loans/', url_status: 'unchecked', location_tag: 'Wales', is_local: true,
    amount_min: null, amount_max: 150000, deadline: null, is_rolling: true, eligible_structures: WALES, impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['general_public'],
    description: 'Loans from Social Investment Cymru for trading voluntary organisations in Wales that are restructuring or changing how they operate. Bridging loans up to £150,000 to cover the gap while a property is sold, repaid from the sale. Build loans up to £100,000 to support cash flow while a new trading model is put in place. Interest 3.5% in year one and 7% in year two. Apply by contacting the team.',
    funder_brief: brief('https://wcva.cymru/funding/social-investment-cymru/bridge-and-build-loans/', {
      who_can_apply: 'Trading voluntary organisations in Wales, or those developing a trading offer, that are adapting their business model or scaling back.',
      what_they_fund: 'Bridging the gap while a property is sold, including redundancy costs; cash flow while restructuring; capacity building before a new trading model becomes profitable.',
      typical_award: 'Bridging loans up to £150,000; build loans up to £100,000.', exclusions: 'Loans are not right for everyone; the page says so plainly. Organisations without a route to repayment.',
      decision_timeline: 'Rolling; contact the team.', how_to_apply: 'Email sic@wcva.cymru to discuss before applying.', funder_tips: 'Interest is 3.5% for the first year and 7% for the second.',
      _citations: { typical_award: { snippet: 'Bridging loans – Up to £150,000 to bridge the gap when a property is being sold', confidence: 'high', source_url: 'https://wcva.cymru/funding/social-investment-cymru/bridge-and-build-loans/' },
        who_can_apply: { snippet: 'These loans are designed for trading voluntary organisations or those developing their trading offer.', confidence: 'high', source_url: 'https://wcva.cymru/funding/social-investment-cymru/bridge-and-build-loans/' } } }) },

  { title: 'Social Investment Cymru Clean Energy Fund (North Wales)', funder: 'WCVA (Social Investment Cymru)', funding_type: 'investment', funding_subtypes: ['blended', 'loan'],
    apply_url: 'https://wcva.cymru/funding/social-investment-cymru/clean-energy-fund/', url_status: 'unchecked', location_tag: 'North Wales', is_local: true,
    amount_min: 25000, amount_max: 750000, deadline: null, is_rolling: true, eligible_structures: WALES, impact_sectors: ['environment', 'community'], target_beneficiaries: ['general_public'],
    description: 'Blended funding for clean energy projects in North Wales: energy efficiency upgrades, renewable generation, storage and smart energy, large-scale solar and tidal. Half the project cost as a grant of £25,000 to £500,000, a quarter as an interest-free loan of up to £250,000, and a quarter from the applicant as match. A five-year scheme, open now, rolling until the money is allocated. Organisations must be based in or have a presence in Conwy, Denbighshire, Flintshire, Gwynedd, Wrexham or Ynys Môn.',
    funder_brief: brief('https://wcva.cymru/funding/social-investment-cymru/clean-energy-fund/', {
      who_can_apply: 'Suitably constituted organisations based in or with a presence in North Wales (Conwy, Denbighshire, Flintshire, Gwynedd, Wrexham, Ynys Môn), for projects in North Wales.',
      what_they_fund: 'Energy efficiency upgrades, renewable energy generation, smart energy including storage, large-scale solar and tidal, and operational changes that cut carbon.',
      typical_award: '50% grant (£25,000 to £500,000), 25% interest-free loan (up to £250,000), 25% match funding from the applicant.',
      exclusions: 'Projects outside North Wales.', decision_timeline: 'Rolling over five years until funds are allocated.', how_to_apply: 'Contact the Social Investment Cymru team; scheme guidance is described as coming soon.',
      _citations: { typical_award: { snippet: 'Funding will be 50% grant (minimum £25,000, maximum £500,000), 25% interest free loan (up to £250,000), with the remaining 25% required as match funding.', confidence: 'high', source_url: 'https://wcva.cymru/funding/social-investment-cymru/clean-energy-fund/' },
        decision_timeline: { snippet: 'The fund is currently open for applications. This is a five year scheme with applications accepted on a rolling basis', confidence: 'high', source_url: 'https://wcva.cymru/funding/social-investment-cymru/clean-energy-fund/' } } }) },

  { title: 'Social Investment Cymru Community Asset Loan Fund', funder: 'WCVA (Social Investment Cymru)', funding_type: 'investment', funding_subtypes: ['loan', 'social_investment'],
    apply_url: 'https://wcva.cymru/funding/social-investment-cymru/community-asset-loan-fund/', url_status: 'unchecked', location_tag: 'Wales', is_local: true,
    amount_min: null, amount_max: 300000, deadline: null, is_rolling: true, eligible_structures: WALES, impact_sectors: ['community', 'housing'], target_beneficiaries: ['general_public'],
    description: 'Loans of up to £300,000 from Social Investment Cymru for charities, social enterprises and CICs in Wales buying property for community use. Can fund up to 100% of the property value and can sit alongside other finance. Open for applications now. Interest discounts for a commitment to Welsh, and for organisations tackling poverty or climate change.',
    funder_brief: brief('https://wcva.cymru/funding/social-investment-cymru/community-asset-loan-fund/', {
      who_can_apply: 'Charities, social enterprises and CICs in Wales buying property for community use or for groups that benefit the community.',
      what_they_fund: 'Purchase of property for community use, up to 100% of the value, including topping up part-financed purchases.',
      typical_award: 'Loans up to £300,000.', exclusions: 'Not stated.', decision_timeline: 'Open now; rolling.', how_to_apply: 'Express interest to sic@wcva.cymru.',
      funder_tips: 'A 0.5% rate discount for achieving the Cynnig Cymraeg, and reduced rates for organisations tackling poverty or climate change.',
      _citations: { typical_award: { snippet: 'Loans up to value of £300,000 are available for the purchase of property for community use', confidence: 'high', source_url: 'https://wcva.cymru/funding/social-investment-cymru/community-asset-loan-fund/' },
        decision_timeline: { snippet: 'The Community Asset Loan Fund is open for applications now.', confidence: 'high', source_url: 'https://wcva.cymru/funding/social-investment-cymru/community-asset-loan-fund/' } } }) },

  { title: 'Social Investment Cymru Wales Micro Loan Fund', funder: 'WCVA (Social Investment Cymru)', funding_type: 'investment', funding_subtypes: ['loan'],
    apply_url: 'https://wcva.cymru/funding/social-investment-cymru/wales-micro-loan-fund/', url_status: 'unchecked', location_tag: 'Wales', is_local: true,
    amount_min: 1000, amount_max: 50000, deadline: null, is_rolling: true, eligible_structures: WALES, impact_sectors: ['social_economy', 'employment'], target_beneficiaries: ['general_public'],
    description: 'Small loans of £1,000 to £50,000 for social businesses in Wales, repayable over up to ten years, from the Wales Micro Loan Fund managed by Social Investment Cymru. For stock, equipment, cash flow, premises or buying a small business. Can sit alongside other finance. Rolling; start with a conversation with the team.',
    funder_brief: brief('https://wcva.cymru/funding/social-investment-cymru/wales-micro-loan-fund/', {
      who_can_apply: 'Social businesses based in Wales, or willing to relocate, with a business plan.',
      what_they_fund: 'Stock, new plant and equipment, cash flow, new premises and fit-out, acquisition of a small business.',
      typical_award: '£1,000 to £50,000, maximum repayment period ten years.', exclusions: 'Organisations outside Wales.', decision_timeline: 'Rolling.',
      how_to_apply: 'Preliminary discussion on 0300 111 0124 or sic@wcva.cymru, then an application form with supporting documents.',
      _citations: { typical_award: { snippet: 'Loans of between £1,000 and £50,000 are available with a maximum repayment period of ten years.', confidence: 'high', source_url: 'https://wcva.cymru/funding/social-investment-cymru/wales-micro-loan-fund/' } } }) },

  { title: 'SIS Bridging Loans', funder: 'Social Investment Scotland', funding_type: 'investment', funding_subtypes: ['loan', 'social_investment'],
    apply_url: 'https://www.socialinvestmentscotland.com/investment/sis-bridging-loans/', url_status: 'unchecked', location_tag: 'Scotland', is_local: true,
    amount_min: null, amount_max: null, deadline: null, is_rolling: true, eligible_structures: SCOT, impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['general_public'],
    description: 'Short-term loans from Social Investment Scotland for charities, social enterprises and community organisations in Scotland that have a confirmed grant paid in arrears. The loan covers cash flow so the project runs on time and is repaid from the grant when it arrives. Amounts not stated; SIS loans generally run from £10,000 to £375,000.',
    funder_brief: brief('https://www.socialinvestmentscotland.com/investment/sis-bridging-loans/', {
      who_can_apply: 'Charities, social enterprises and community organisations across Scotland with a confirmed grant award paid retrospectively.',
      what_they_fund: 'Cash flow to deliver a grant-funded project before the grant is paid.', typical_award: 'Not stated on the page.', exclusions: 'Organisations without a confirmed grant to repay from.',
      decision_timeline: 'Rolling.', how_to_apply: 'Enquiry form on the SIS site.',
      _citations: { what_they_fund: { snippet: 'designed to support social enterprises and charities that have confirmed grant awards paid retrospectively', confidence: 'high', source_url: 'https://www.socialinvestmentscotland.com/investment/sis-bridging-loans/' } } }) },

  { title: 'Scottish Social Growth Fund', funder: 'Social Investment Scotland', funding_type: 'investment', funding_subtypes: ['loan', 'social_investment'],
    apply_url: 'https://www.socialinvestmentscotland.com/investment/scottish-social-growth-fund/', url_status: 'unchecked', location_tag: 'Scotland', is_local: true,
    amount_min: null, amount_max: null, deadline: null, is_rolling: true, eligible_structures: SCOT, impact_sectors: ['social_economy', 'community'], target_beneficiaries: ['general_public'],
    description: 'Flexible loan finance from Social Investment Scotland, in its third round, for charities and social enterprises in Scotland that want to grow, develop new services or strengthen long-term sustainability. Terms up to 14 years with fixed rates and flexible repayment. Amounts not stated on the page.',
    funder_brief: brief('https://www.socialinvestmentscotland.com/investment/scottish-social-growth-fund/', {
      who_can_apply: 'Charities and social enterprises based in Scotland with clear social impact at the heart of their mission.',
      what_they_fund: 'Growth, new services, and financial resilience through recovery, restructuring or investment.', typical_award: 'Not stated. Loan terms up to 14 years.',
      exclusions: 'Not stated.', decision_timeline: 'Rolling.', how_to_apply: 'Enquiry form on the SIS site.',
      _citations: { decision_timeline: { snippet: 'Loan terms Up to 14 years.', confidence: 'high', source_url: 'https://www.socialinvestmentscotland.com/investment/scottish-social-growth-fund/' },
        who_can_apply: { snippet: 'Charities and social enterprises based in Scotland with clear social impact at the heart of their mission.', confidence: 'high', source_url: 'https://www.socialinvestmentscotland.com/investment/scottish-social-growth-fund/' } } }) },
]

async function main() {
  const db = getAdminDb(); console.log(APPLY ? 'APPLY' : 'DRY RUN')
  type Held = { id: string; title: string; funder: string | null; funder_type: string | null; pipeline_state: string; is_active: boolean | null; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) { const { data, error } = await db.from('scraped_grants').select('id,title,funder,funder_type,pipeline_state,is_active,apply_url').range(from, from + 999); if (error) throw error; all.push(...(data as Held[])); if (!data || data.length < 1000) break }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  if (all.length !== count) throw new Error(`partial read ${all.length}/${count}`)
  console.log(`table read: ${all.length}`)
  for (const rl of RELINKS) {
    const row = all.find(d => d.id.startsWith(rl.idPrefix)); if (!row) throw new Error('missing ' + rl.label)
    if (!row.is_active) throw new Error(`${rl.label}: row is not live`)
    console.log(`  relink ${rl.label}\n     ${row.apply_url} -> ${rl.fields.apply_url ?? '(fields only)'}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: UV as never, db, fields: rl.fields })
    const blocked = r.rejected.filter(x => x.reason !== 'idempotent'); console.log(`     applied [${r.applied.join(',')}]` + (blocked.length ? ' BLOCKED ' + JSON.stringify(blocked) : ''))
  }
  let staged = 0
  for (const row of NEW) {
    const norm = (u: string) => { const x = new URL(u); return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') }
    const dupe = all.filter(d => { try { return d.apply_url && norm(d.apply_url) === norm(row.apply_url) } catch { return false } })
    if (dupe.length) { console.log(`  already_held: ${row.title} -> ${dupe.map(d => `${d.id.slice(0, 8)} [${d.pipeline_state}]`).join('; ')}`); continue }
    const sib = all.find(d => d.funder === row.funder && d.funder_type); const funder_type = sib?.funder_type ?? 'other'
    console.log(`  stage ${row.title} (${funder_type}) ${row.amount_min ?? '?'}-${row.amount_max ?? '?'} ${row.location_tag}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, funder_type, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single(); if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}; relinks ${RELINKS.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
