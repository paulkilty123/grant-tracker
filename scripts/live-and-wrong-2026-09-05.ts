// "Live and wrong" to zero, 2026-09-05, at Paul's request. Fifteen rows.
// Every funder page was read today; the sentence each change rests on is in
// its citation. Where a page states no figure, the figure comes off rather
// than being replaced by a guess: a wrong number a fundraiser is sized
// against is worse than none.
//
// Two are NOT changed:
//   Allen Lane Foundation — the site puts up a real captcha, which nobody
//     here solves. £5,000 to £25,000 and 1 October stay flagged until a
//     person reads the page.
//   Financial Futures Fund — deadline 7 October was read in a browser on
//     2 September and stays; the host blocks the checker so the flag will
//     persist. The £3 million ceiling IS changed: it is the annual pot.
//
//   npx tsx --env-file=.env.local scripts/live-and-wrong-2026-09-05.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:live-and-wrong-2026-09-05'
type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low' }>
const src = (url: string, label: string) => ({ url, label, added_at: '2026-09-05' })

const EDITS: { id: string; title: string; fields: Record<string, unknown>; citations?: Cit }[] = [
  { id: '250e4dea-d08b-49e7-9a1e-cde60c135849', title: 'Resonance Enterprise Investment Fund',
    fields: {
      title: 'Resonance Enterprise Investment Fund',
      apply_url: 'https://resonance.ltd.uk/get-investment/enterprise-growth-funds/resonance-enterprise-investment-fund',
      url_status: 'unchecked',
      amount_min: 25001, amount_max: 250000, is_rolling: true, deadline: null,
      location_tag: 'South West England, West Midlands and North West England', is_local: true,
      eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_shares', 'ltd_guarantee', 'cooperative'],
      grant_sources: [src('https://impact-investor.com/resonance-launches-10m-social-impact-fund-for-english-regions/', 'Launch coverage (the £10m is the fund, not an award)')],
      description: 'Growth investment of £25,001 to £250,000 for social enterprises in the South West, West Midlands and North West of England, from charities with trading income and community interest companies to companies limited by shares. Loans at 6.5 to 8.5% a year, with revenue share and equity options. Register interest at any time and Resonance arranges a call to confirm eligibility. The £10 million is the size of the fund, not an award.',
    },
    citations: {
      amount_max: { snippet: '£25,001-£250,000', confidence: 'high' },
      apply_url:  { snippet: 'register your interest in the fund and have us arrange an initial call with you to confirm eligibility', confidence: 'high' },
      eligible_structures: { snippet: 'charities (with trading income) and Community Interest Companies to Companies Limited by Shares', confidence: 'high' },
      location_tag: { snippet: 'South West; West Midlands & North West', confidence: 'high' },
    } },
  { id: '31f56c84-447a-478b-a15a-fcb19469c1aa', title: 'UK and Ireland Community Tree Planting Grant',
    fields: { amount_min: null, amount_max: null, deadline: null,
      description: 'Grants from the International Tree Foundation for community tree planting across the UK and Ireland, with a maintenance grant of 10p per tree a year for the first two years. The grants page states no per-project figure and no closing date; both are in the guidelines it links to, which the checker cannot read. Start an application on the foundation\'s grant platform.' },
    citations: {
      amount_max: { snippet: 'This is set at 10p per tree for each year ... Read our guidelines before you apply.', confidence: 'high' },
      deadline:   { snippet: 'Read our guidelines before you apply.', confidence: 'med' },
    } },
  { id: '49ff8ed7-c7a9-432d-aeb7-9acf2afb8b0a', title: 'Garfield Weston Foundation General Grants',
    fields: { funding_index_url: 'https://garfieldweston.org/for-grant-applicants/how-to-apply/', is_rolling: true, deadline: null },
    citations: { is_rolling: { snippet: 'accepts applications year-round ... We will aim to get back to you with our decision within 4–6 months.', confidence: 'high' } } },
  { id: '523da313-e449-46a1-8647-c5a51e58b304', title: 'Cornwall Community Foundation',
    fields: { funding_index_url: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/' } },
  { id: '9e63bf54-8956-4816-b32d-d164f99ab0ea', title: 'Chichester City Council Community Grants',
    fields: { funding_index_url: 'https://chichestercity.gov.uk/community-grants/' } },
  { id: 'daf20da3-2ce9-498f-a0bd-e6f3abce6651', title: 'Ernest Kleinwort Charitable Trust Small Grants',
    fields: { grant_sources: [src('https://ekct.org.uk/apply/', 'Apply page (grant size and application windows), read 2026-09-03')] } },
  { id: 'e0c1a655-d377-481b-b806-0c171095f7be', title: 'Financial Futures Fund',
    fields: { amount_min: null, amount_max: null,
      description: 'Funds long-term solutions that improve financial resilience across the UK: building financial confidence and capability, improving access to fair and inclusive financial services, and tackling systemic barriers. Up to £3 million a year is awarded across the fund; the page states no per-grant figure. For UK-registered organisations with an annual income of £1 million or more. Round two closes 7 October 2026.' },
    citations: { amount_max: { snippet: 'The Financial Futures Fund opens for applications twice a year, with up to £3 million in grants awarded annually.', confidence: 'high' } } },
  { id: 'f2e16253-0b5f-4aac-8415-0cfb00771d81', title: 'Innovate UK Investor Partnerships',
    fields: { funding_type: 'investment', amount_min: null, amount_max: null,
      eligible_structures: ['ltd_shares', 'ltd_guarantee', 'cic_shares', 'cic_guarantee'],
      description: 'Innovate UK R&D grants paired with aligned equity investment of at least one to two times the grant, led by one of Innovate UK\'s approved investor partners. For high-growth UK micro, small and medium-sized businesses that already have a relationship with an approved investor. The page states no grant range and no current competition dates.' },
    citations: {
      funding_type: { snippet: 'non-dilutive capital ... paired with aligned equity investment from 105 investor partners ... at least 1-2x the amount of grant funding', confidence: 'high' },
      eligible_structures: { snippet: 'Micro, small, and medium-sized enterprises (SMEs) in the UK', confidence: 'high' },
    } },
  { id: 'f79aada3-721e-487c-9e97-35097aa87ee0', title: 'Lewes Fund (via SCF Main Grants)',
    fields: { amount_min: 1000, amount_max: 10000, deadline: '2026-09-11', is_rolling: false, max_org_income: 2000000,
      grant_sources: [src('https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/', 'Main Grants page (amounts, round dates), read 2026-09-05')],
      description: 'Grants for charities and community groups in Lewes and the surrounding parishes supporting disadvantaged local people, made through Sussex Community Foundation\'s Main Grants rounds three times a year. Main grants range from £1,000 to £10,000, for not-for-profit organisations with income up to £2 million. The current round closes on Friday 11 September 2026.' },
    citations: {
      amount_max: { snippet: 'range from £1,000 to £10,000', confidence: 'high' },
      deadline:   { snippet: 'Applications close: Friday 11 September', confidence: 'high' },
      max_org_income: { snippet: 'not-for-profit volunteer-led organisations whose annual income does not exceed £2 million', confidence: 'high' },
    } },
]

// Tower Hamlets: between rounds now; the next opens in September with October
// submissions. is_rolling false + no deadline + next_open_date is what the
// matcher reads as "closed, watch it", which is the truth today.
const TOWER = { id: '9192771f-4c81-4761-8a59-9a39231b973c', fields: {
  amount_min: null, amount_max: 6000, max_org_income: 150000, is_rolling: false, deadline: null,
  next_open_date: 'Round 2 opens September 2026, submissions due October 2026, awards December 2026',
  next_open_date_parsed: '2026-10-01',
  description: 'Tower Hamlets Council\'s Mayor\'s Small Grants Programme for small organisations with an annual income of no more than £150,000: community events and capacity building £2,500, community chest £1,000, positive activities for young people £6,000, youth empowerment £3,500. Three rounds a year; round 2 opens in September 2026 with submissions due in October and awards in December.',
}, citations: {
  amount_max: { snippet: 'Positive Activities for Young People: £6,000', confidence: 'high' },
  max_org_income: { snippet: 'small organisations with a maximum annual income of £150,000', confidence: 'high' },
  next_open_date: { snippet: 'Application opens September 2026; submissions due October 2026', confidence: 'high' },
} as Cit }

const REJECT = { id: '9ae71432-a044-4988-8eae-1f2c3223c764', title: 'Cambridge Social Ventures', code: 'out_of_scope',
  note: 'incubator and training for individual founders; no funding stated',
  quote: 'individuals from varied backgrounds who are committed to make positive social or environmental impact' }

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  const run = async (id: string, what: string, fields: Record<string, unknown>, citations?: Cit) => {
    console.log(`  ${what.padEnd(46)} -> ${Object.keys(fields).join(', ')}`)
    if (!APPLY) return
    const r = await mergeGrantUpdate({ id, fields, source: SOURCE, db, citations })
    const refused = r.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${r.applied.join(', ') || 'nothing'}]${refused.length ? ` REFUSED ${JSON.stringify(refused)}` : ''}`)
  }
  const full = async (id: string, expect: RegExp) => {
    const { data } = await db.from('scraped_grants').select('id, title, funder_brief').eq('id', id).single()
    if (!data || !expect.test(data.title)) throw new Error(`${id}: ${data?.title}`)
    return data
  }

  for (const e of EDITS) {
    await run(e.id, e.title, e.fields, e.citations)
  }

  const cash = await full('91737208-0bd3-45c4-8866-ec6256e85a58', /Cash for Kids/)
  await run(cash.id, 'Cash for Kids Cost of Living', { funding_index_url: 'https://cashforkids.org.uk/grants/' })

  const ffilm = await full('c1ca1f42-98fa-471c-ad65-b078bf97c20c', /Ffilm Cymru/)
  await run(ffilm.id, 'Ffilm Cymru Wales', { amount_min: null, amount_max: null,
    description: 'Ffilm Cymru Wales funds cinemas, film festivals and pop-up screenings in Wales through three strands: a Cinema Innovation Fund for independent cinema operators, a Film Festivals Fund for established festivals with a proven audience record, and an Audience Discovery Fund for cultural organisations and community groups developing new audiences. Amounts and dates are in each strand\'s guidelines; the overview page states none.' },
    { amount_max: { snippet: 'In 2026–27, Ffilm Cymru Wales is evolving the way we fund audience and exhibition projects', confidence: 'med' } })

  const tower = await full(TOWER.id, /Tower Hamlets/)
  await run(tower.id, 'Tower Hamlets Mayor\'s Small Grants', TOWER.fields, TOWER.citations)

  const sg = await full('f7e51198-d22b-484a-bec3-aadbe08fb748', /Network Membership/)
  const brief = { ...(sg.funder_brief as Record<string, unknown>) }
  brief.typical_award = 'Membership is free. StreetGames passes funding to its community partners through its own programmes rather than a fixed award; in 2024/25 £9.84 million reached 515 partners.'
  await run(sg.id, 'StreetGames Network Membership', { funder_brief: brief })

  const csv = await full(REJECT.id, /Cambridge Social Ventures/)
  await run(csv.id, `${REJECT.title} (reject)`, { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason(REJECT.code, `${REJECT.note}. Page: "${REJECT.quote}"`) })
}
main().catch(e => { console.error(e); process.exit(1) })
