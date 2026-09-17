// Cohort programmes, batch 1 — the Firstport compound-funder split.
// See docs/handoffs/programmes-cohorts-2026-09-08.md (updated at 50a82f9e).
//
// One live row, 1e994bdb "Firstport Start It Programme", has stood in front of
// five separately paged funds with the funding INDEX as its apply_url. All five
// were read today. Four are staged here as their own rows.
//
// THE FIFTH IS NOT RELINKED, AND THAT IS A DELIBERATE DEPARTURE FROM THE BRIEF.
// The brief says to relink 1e994bdb to Start It's own page and correct its
// fields from that page. Reading that page changes the question, because Start
// It is individuals only:
//
//   "Who's it for? Individuals with a business idea that addresses a social,
//    environmental and/or community issue."
//   "Eligibility ... You are aged 18 or over. You are a permanent resident of
//    Scotland."
//
// Under CLAUDE.md's audience rule an individuals-only row is out_of_scope, so
// the correct action is not a relink to a more precise page, it is a reject of
// a live row. Three other things on that row are also wrong against the page:
// it holds £5,000 to £25,000 where the page says "Up to £5,000" and the £25,000
// appears nowhere; it lists seven eligible_structures where the page's test is a
// person's age and residence; and its description says the programme is for
// "social entrepreneurs and early-stage social enterprises".
//
// Rejecting a live row is Paul's call, not this job's, and the launch freeze is
// in force, so this script does not touch it. It is reported for him instead.
// Relinking it would have made an out-of-scope row point more precisely at the
// page that proves it is out of scope.
//
// Name collision handled per the brief: Firstport's Community Enterprise Fund
// carries the funder in its title because we already hold a different fund of
// exactly that name from Social Investment Business (18627ca4, live).
//
// Every quote below is from a page fetched in this session with node's fetch,
// each read whole rather than truncated. No search summaries, no proxy.
//
//   npx tsx --env-file=.env.local scripts/programmes-cohorts-batch-01-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:programmes-cohorts-2026-09-08'

type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

const brief = (url: string, o: Record<string, string>, c: Cit) => ({
  source: 'live_fetch', last_enriched: '2026-09-08', ...o,
  _citations: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, source_url: v.source_url ?? url }])),
})

const BUILD_IT = 'https://www.firstport.org.uk/funding/social-entrepreneurs-fund-build-it/'
const CEF = 'https://www.firstport.org.uk/funding/community-enterprise-fund/'
const BOOST = 'https://www.firstport.org.uk/funding/social-enterprise-boost-fund/'
const SIC = 'https://www.firstport.org.uk/funding/social-innovation-challenge/'

const NEW_ROWS: Record<string, unknown>[] = [
  {
    title: 'Firstport Build It',
    funder: 'Firstport',
    funder_type: 'trust_foundation',
    funding_type: 'programme',
    funding_subtypes: ['includes_grant'],
    apply_url: BUILD_IT,
    location_tag: 'Scotland', is_local: false,
    amount_max: 40000,
    deadline: '2026-09-24', is_rolling: false,
    eligible_structures: ['cic_guarantee', 'cic_shares', 'cooperative', 'ltd_guarantee', 'scio', 'registered_charity'],
    impact_sectors: ['social_economy', 'employment', 'community'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'Grants of up to £40,000 towards salary costs for social enterprises in Scotland that have been trading for three years or less. The money is for creating new, permanent, Real Living Wage roles that grow trading income over a 12 month funding period, typically up to £27,000 for a single salary or up to £40,000 split across two or more part time posts. Four deadlines a year, with the next at noon on Thursday 24 September 2026 and pitching panels on 17 and 18 November, then Thursday 21 January 2027. Shortlisted applicants pitch to an independent panel that makes the final decision.',
    eligibility_criteria: ['Registered office in Scotland', 'Trading for three years or less', 'Asset-locked constitution', 'Business bank account in the name of the social enterprise', 'Board of directors, no more than half related or employed'],
    funder_brief: brief(BUILD_IT, {
      who_can_apply: 'Incorporated social enterprises with a registered office in Scotland that operate primarily for the benefit of people or communities in Scotland, have been trading for three years or less, hold an asset-locked constitution registered with Companies House, OSCR or the Mutual Public Register, and have a business bank account in the name of the enterprise. A board must be in place with no more than half its members related to one another or employed by the enterprise. Activities involving political campaigning or the advancement of religion are excluded.',
      what_they_fund: 'Salary costs only, for new permanent roles that increase income generation and measurable social impact during a 12 month funding period. Typical requests are up to £27,000 for a single salary at the Real Living Wage, or up to £40,000 split between two or more salaries.',
      how_to_apply: 'Submit an application form, business plan, pitch document and cash flow projections using Firstport\'s own templates, through an account in its application portal. Shortlisted applicants are invited to pitch to an independent panel.',
      exclusions: 'Not open to unincorporated groups, to organisations with model Articles of Association because those carry no asset lock, or to enterprises without a business bank account. Sessional and casual staff are not covered.',
      decision_timeline: 'Four deadlines a year, usually one a quarter. The next is Thursday 24 September 2026 with pitching panels on 17 and 18 November, then Thursday 21 January 2027. Around two months from submission deadline to pitch outcome, with the result a few days after the pitch.',
      typical_award: 'Up to £40,000. Up to £27,000 for a single salary at the Real Living Wage, or up to £40,000 split between two or more salaries.',
      open_status: 'open',
    }, {
      who_can_apply: { snippet: 'Eligibility To apply for Build It, your social enterprise must meet the following eligibility criteria: Has a registered office in Scotland. Operates primarily for the benefit of people or communities in Scotland.', confidence: 'high' },
      what_they_fund: { snippet: 'It offers up to £40,000 in grant funding for salary costs, helping organisations create jobs that grow income, reduce reliance on grants, and strengthen long-term social impact.', confidence: 'high' },
      how_to_apply: { snippet: 'You must submit an application form, a business plan, a pitch document and cash flow projections. We have templates for all these, which you can find in the downloads section below.', confidence: 'high' },
      exclusions: { snippet: 'Model Articles of Association are standard default articles and do not include an asset lock.', confidence: 'high', source_url: 'https://www.firstport.org.uk/funding/build-it/' },
      decision_timeline: { snippet: 'Upcoming deadlines: Thursday 24 September 2026 Thursday 21 January 2027', confidence: 'high' },
      typical_award: { snippet: 'Typical requests are: Up to £27,000 for a single salary (at Real Living Wage) Up to £40,000 split between two or more salaries at Real Living Wage', confidence: 'high' },
      open_status: { snippet: 'The next deadline is Noon Thursday 24th September 2026', confidence: 'high' },
    }),
  },
  {
    title: 'Firstport Community Enterprise Fund',
    funder: 'Firstport',
    funder_type: 'trust_foundation',
    funding_type: 'programme',
    funding_subtypes: ['includes_grant'],
    apply_url: CEF,
    location_tag: 'Scotland', is_local: false,
    amount_max: 5000,
    is_rolling: true,
    impact_sectors: ['social_economy', 'community'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'Grants of up to £5,000, to be spent over twelve months, helping constituted community groups and third sector organisations in Scotland start trading or set up a social enterprise. Funded by the Scottish Government\'s Social Entrepreneurs Fund. An open, rolling programme with no deadline: eligible proposals go to an independent funding panel and a decision normally follows within 12 to 14 weeks. Groups that are not yet constituted are pointed to Firstport\'s Start It instead, which funds individuals.',
    eligibility_criteria: ['Constituted third sector or community group', 'Based in Scotland', 'Not yet trading on a regular basis', 'Bank account in the name of the group', 'Proposal must be or plan to be an asset-locked social enterprise'],
    funder_brief: brief(CEF, {
      who_can_apply: 'Constituted third sector or community groups based in Scotland that operate primarily for the benefit of people or communities in Scotland, hold a bank account in the name of the group, and are not yet trading on a regular basis. Unconstituted groups are not eligible. Political campaigning and the advancement of religion are excluded.',
      what_they_fund: 'Start-up costs for a group beginning to trade or setting up a social enterprise, so it can generate income and reduce its reliance on grant funding. The proposal must be, or plan to be, an asset-locked organisation reinvesting all profits into its social aims.',
      how_to_apply: 'Create an account in Firstport\'s application portal and submit the Community Enterprise application with the required documents. Applications can be made at any point.',
      exclusions: 'Funding cannot be used towards existing activities. Unconstituted groups cannot apply and are directed to Start It, which is for individuals.',
      decision_timeline: 'An open, rolling programme with no deadline. All eligible proposals go to an independent funding panel, and a decision normally arrives within 12 to 14 weeks of submitting the form.',
      typical_award: 'Up to £5,000, to be spent over twelve months.',
      open_status: 'open',
    }, {
      who_can_apply: { snippet: 'Eligibility The Community Enterprise Fund is open to constituted third sector or community groups. To be eligible, your organisation must : Be based in Scotland', confidence: 'high' },
      what_they_fund: { snippet: 'The Community Enterprise Fund is a funding programme that helps community organisations to start trading or set up social enterprises in Scotland. It offers grants of up to £5,000, to be spent over twelve months.', confidence: 'high' },
      how_to_apply: { snippet: 'Community Enterprise is an open, rolling programme. If you are ready to apply, make sure you first read the guidance notes below in full and follow the link at the top of the page to start your application.', confidence: 'high' },
      exclusions: { snippet: 'Be a constituted group (unconstituted groups are not eligible; if your group is not yet constituted, you may be better suited to the Start It programme)', confidence: 'high' },
      decision_timeline: { snippet: 'All eligible proposals go to an independent funding panel who makes the final decisions. You will normally receive a decision within 12-14 weeks of submitting the form.', confidence: 'high' },
      typical_award: { snippet: 'What do I get? Up to £5,000 towards start-up costs.', confidence: 'high' },
      open_status: { snippet: 'Where do I apply? Applications are now open', confidence: 'high' },
    }),
  },
  {
    title: 'Firstport Social Enterprise Boost Fund',
    funder: 'Firstport',
    funder_type: 'trust_foundation',
    funding_type: 'programme',
    funding_subtypes: ['includes_grant', 'support_programme'],
    apply_url: BOOST,
    location_tag: 'Sunderland & South Tyneside', is_local: true,
    amount_max: 10000,
    is_rolling: false,
    impact_sectors: ['social_economy', 'employment', 'community'],
    target_beneficiaries: ['social_impact_orgs'],
    description: 'Grants of up to £10,000 to start and grow social enterprises in Sunderland and South Tyneside, funded by the UK Government and delivered by Firstport with PNE. Open to existing social enterprises that have been trading for five years or less with a turnover under £250,000, and to individuals setting up a new social enterprise. Applications are open, and applicants are encouraged to use the business support and training PNE provides alongside the grant. This is Firstport\'s only fund outside Scotland.',
    eligibility_criteria: ['Existing social enterprise trading five years or less', 'Turnover under £250,000', 'Delivers most of its social benefit in Sunderland or South Tyneside'],
    funder_brief: brief(BOOST, {
      who_can_apply: 'Early-stage social enterprises and individuals setting up a new social enterprise in Sunderland and South Tyneside. An existing social enterprise must have been trading for five years or less and have a turnover of less than £250,000, and the application must deliver most of its social or environmental benefit within one or both of those areas.',
      what_they_fund: 'Start-up and development costs, to kick start and accelerate social enterprise ideas. Business support and training from PNE runs alongside the grant.',
      how_to_apply: 'Read the guidance notes, then use the application links in the Ready to Apply section of the fund page.',
      exclusions: 'Restricted to Sunderland and South Tyneside. An existing social enterprise trading more than five years, or with a turnover of £250,000 or more, is outside the criteria.',
      decision_timeline: 'The page states applications are now open and gives no closing date.',
      typical_award: 'Up to £10,000 towards start-up and development costs.',
      open_status: 'open',
    }, {
      who_can_apply: { snippet: 'Social enterprises To be eligible, your existing social enterprise: Has been trading for five years or less Has a turnover of less than £250,000', confidence: 'high' },
      what_they_fund: { snippet: 'The Social Enterprise Boost Fund is a programme funded by the UK Government. It aims to kick start and acce', confidence: 'high' },
      how_to_apply: { snippet: 'Applications are now open. Scroll down to the ‘Ready to Apply?\' section to find the application links.', confidence: 'high' },
      exclusions: { snippet: 'Up to £10,000 for individuals and social enterprises in Sunderland and South Tyneside to start and grow their businesses.', confidence: 'high' },
      decision_timeline: { snippet: 'Applications are now open.', confidence: 'med' },
      typical_award: { snippet: 'What do I get? Up to £10,000 towards start-up and development costs.', confidence: 'high' },
      open_status: { snippet: 'Applications are now open.', confidence: 'high' },
    }),
  },
  {
    title: 'Firstport Social Innovation Challenge',
    funder: 'Firstport',
    funder_type: 'trust_foundation',
    funding_type: 'programme',
    funding_subtypes: ['award', 'includes_grant'],
    apply_url: SIC,
    location_tag: 'Scotland', is_local: false,
    amount_max: 30000,
    is_rolling: false,
    impact_sectors: ['social_innovation', 'social_economy', 'environment', 'employment'],
    target_beneficiaries: ['social_impact_orgs', 'people_in_poverty'],
    description: 'A competition for innovative solutions to four named challenges in Scotland: eradicating child poverty, growing the economy through routes to employment for people facing barriers, tackling the climate emergency, and sustainable public services. One winner receives a £30,000 grant plus tailored support for the duration of the award, and two finalists receive £10,000 each along with introductions to other funders and capacity building programmes. Open to social enterprises, unincorporated groups, community associations and individuals. Applications are open and run in two stages, an expression of interest followed by a full application.',
    eligibility_criteria: ['Social enterprise, unincorporated group, community association or individual', 'Idea addressing one of the four named themes', 'Scotland focused'],
    funder_brief: brief(SIC, {
      who_can_apply: 'Social enterprises, unincorporated groups, community associations or individuals with an idea for a new social enterprise project. The idea must address one of four themes: eradicating child poverty, growing the economy, tackling the climate emergency, or ensuring high quality and sustainable public services.',
      what_they_fund: 'Start-up fees, research and development, salaries and other essential costs such as rent or critical equipment, for a project delivering long-lasting impact against one of the four themes.',
      how_to_apply: 'Two stages: an expression of interest followed by a full application. Read the guidance notes on the fund page before starting.',
      exclusions: 'The themes are the gate: an application not addressing one of the four is not eligible. The aim is stated as supporting solutions to issues present in Scotland.',
      decision_timeline: 'The page states applications are now open and describes a two stage process, without giving a closing date.',
      typical_award: 'One winner receives a £30,000 grant and tailored support for the duration of the award. Two other finalists receive £10,000 each, plus signposting or introductions to alternative funders and capacity building programmes.',
      open_status: 'open',
    }, {
      who_can_apply: { snippet: "Who's it for? Social enterprises, unincorporated groups, community associations or individuals with an idea for a new project.", confidence: 'high' },
      what_they_fund: { snippet: 'The winner can use the funding to help with start-up fees, research and development, salaries and other essential costs, such as rent or buying critical equipment.', confidence: 'high' },
      how_to_apply: { snippet: 'The application process has two stages: an Expression of Interest (EOI) followed by a full application .', confidence: 'high' },
      exclusions: { snippet: 'we are looking for eligible applications addressing any one of the following four themes', confidence: 'high' },
      decision_timeline: { snippet: 'Applications are now open.', confidence: 'med' },
      typical_award: { snippet: 'The winner will receive a £30,000 grant and tailored support for the duration of their award to help them kick-start their solution. The other finalists will receive £10,000 each', confidence: 'high' },
      open_status: { snippet: 'Applications are now open.', confidence: 'high' },
    }),
  },
]

/** Host clashes already reviewed in SQL. Firstport's own index row is expected. */
const CLEARED: Record<string, string> = {
  '1e994bdb-bb99-4c97-b02c-ee23c1874e18': 'Firstport Start It Programme, the live index row this split exists to break up. Reported for Paul, not touched here.',
  '18627ca4-7544-4719-93d8-1d7c80a10489': 'A DIFFERENT Community Enterprise Fund, from Social Investment Business, England and Wales. Same name, different funder, which is why the staged title carries "Firstport".',
}

async function main() {
  const db = getAdminDb()
  console.log(`programmes-cohorts batch 1 — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${NEW_ROWS.length} rows to stage`)
  console.log(`  source: ${SRC} (trust 50)\n`)

  for (const row of NEW_ROWS) {
    const title = String(row.title)
    const url = String(row.apply_url)
    // Dedup on the exact fund page as well as the title, because the provider's
    // host is shared by all five funds and by the live index row.
    const { data: byUrl } = await db.from('scraped_grants').select('id, title, pipeline_state').eq('apply_url', url)
    const { data: byTitle } = await db.from('scraped_grants').select('id, title, pipeline_state').ilike('title', `${title}%`)
    const clash = [...(byUrl ?? []), ...(byTitle ?? [])].filter(c => !CLEARED[c.id])
    if (clash.length) {
      console.log(`  SKIP ${title}\n       clash: ${clash.map(c => `${c.id} ${c.title} (${c.pipeline_state})`).join(' | ')}`)
      continue
    }
    console.log(`  ${String(row.location_tag).padEnd(26)} ${title}`)
    console.log(`       ${url}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) console.log(`       FAILED: ${error.message}`)
    else console.log(`       staged ${data.id}`)
  }

  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
    .eq('pipeline_state', 'tagged_awaiting_review').eq('source', SRC)
  console.log(`\n  rows staged under ${SRC}: ${count}`)

  // The live row this job deliberately does not touch. Printed every run so a
  // re-read shows whether anything moved it.
  const { data: live } = await db.from('scraped_grants')
    .select('id, title, is_active, pipeline_state, apply_url, amount_min, amount_max')
    .eq('id', '1e994bdb-bb99-4c97-b02c-ee23c1874e18').single()
  console.log(`  untouched live row: ${JSON.stringify(live)}`)
}
main().catch(e => { console.error(e); process.exit(1) })
