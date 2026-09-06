// Amounts on 176 live rows — batch 7 (rows 121-140). One column write, one prose, eighteen reported.
//
// The Sizewell C Community Fund page is the best single illustration of this
// job. It prints five different kinds of pound figure, and only one of them is
// this row's:
//   "£3.8 million in funding (excluding the Sizewell C Community Fund)"  the
//       foundation's OTHER 136 funds, ruled out by its own parenthesis
//   "Grant size ranges from £500 to £40,000 ... average £4,546"  the same
//       other funds, and the sentence a scraper would take
//   "up to £23m over the next decade"  the fund's total
//   "up to £10,000 a year ... maximum £30,000 over 3 years"  the Small Grants
//       strand, a real per-applicant ceiling
//   "In theory, there is no maxmimum grant amount for our Large Grants
//       programme"  which is why nothing goes in the columns
// Writing £30,000 would understate the fund for anyone with a large project,
// and understating a ceiling is the direction that costs an application, so
// both strands go to prose instead.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-07-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 7

const ROWS: Row[] = [
  // 124. Loans up to £10,000, usually about £5,000. The typical figure is prose
  // by the brief's table; the ceiling is a column.
  { id: '200ad44b-7a81-48e0-9ce5-1118aaaba9f0', re: /Noble Trust/,
    fields: { amount_max: 10000 },
    sources: [{ url: 'https://sjnobletrust.scot/loans/', label: 'Loans (ceiling and typical size), read 2026-09-06' }],
    cits: { amount_max: { snippet: 'The Trust normally assists between 20 and 30 businesses per annum with loans up to £10,000 in value, usually in the region of £5,000.', confidence: 'high',
      source_url: 'https://sjnobletrust.scot/loans/' } },
    typical_award: 'Interest-free loans up to £10,000, usually around £5,000, typically over up to three years with repayments starting after year one. The trust assists 20 to 30 businesses a year.',
    typical_award_cit: { snippet: 'The Trust normally assists between 20 and 30 businesses per annum with loans up to £10,000 in value, usually in the region of £5,000.', confidence: 'high',
      source_url: 'https://sjnobletrust.scot/loans/' } },

  // 130. See the header note.
  { id: 'dc68dcb0-e614-4229-a4fd-8f5b609b7143', re: /Sizewell C/,
    fields: {},
    cits: {},
    typical_award: 'Two programmes. Small Grants: up to £10,000 a year for a maximum of three years, so £30,000 in total. Large Grants: no stated maximum, bounded in practice by the size of the fund. Up to 100% of project costs can be requested. The £23 million is the whole fund over a decade, and the £500 to £40,000 range quoted elsewhere on the page belongs to Suffolk Community Foundation\'s other 136 funds, which the page explicitly excludes the Sizewell C fund from.',
    typical_award_cit: { snippet: 'Our Small Grants programme awards grants of up to £10,000 a year, for a maximum of 3 years.', confidence: 'high',
      source_url: 'https://suffolkcf.org.uk/sizewell-c/' } },
]

const REPORT: Report[] = [
  { id: '957a8b0a-3983-4f66-bc52-58b66f58faf2', title: 'Resonance — Community Investment Fund', why: 'not_stated',
    quote: 'Depending on the type of finance you need, you may find we manage an investment fund that might be suitable for your ambitions, see below.',
    url: 'https://resonance.ltd.uk/get-investment/overview',
    note: 'apply_url redirects to an overview that points at the individual funds without costing any of them.' },
  { id: 'ebe92869-c346-408b-a466-1c28861986e6', title: 'Resonance — National Homelessness Property Fund', why: 'not_stated',
    quote: 'Impact Property Funds - Resonance',
    url: 'https://resonance.ltd.uk/impact-property-funds',
    note: 'No pound sign in the rendered text. These funds buy property to lease to homelessness charities rather than lending to them, so a per-applicant figure may not exist at all.' },
  { id: '5ccc0ee4-504b-4901-84e7-212e0bf975e6', title: 'Resonance Community Developers (RCD)', why: 'pot_only',
    quote: 'an initial investment of over £8 million from Big Society Capital and Access Foundation, and an initial target fund size of £40 million by the end of 2026',
    url: 'https://resonance.ltd.uk/news/news/resonance-launches-new-8-million-social-impact-investment-fund',
    note: 'apply_url is a launch press release. Every figure on it sizes the fund — £8 million initial, £40 million target, £100 million ambition — and none sizes an investment. The Resonance Enterprise Investment Fund row was corrected on 5 September for exactly this confusion between a fund and an award.' },
  { id: '53dd63b0-f850-4a8e-a28f-6b84704e810f', title: 'Salesforce Power of Us Program', why: 'not_stated',
    quote: 'Source: 2025 Salesforce Success Metrics Industry Highlights. Data is aggregated from 153 customers.',
    url: 'https://www.salesforce.com/nonprofit/',
    note: 'Donated and discounted licences. A 555KB marketing page whose only numbers are product metrics.' },
  { id: '25f3db7e-802d-4649-8fb5-8e682b2a6d40', title: 'Samworth Brothers Community Opportunity Fund', why: 'pot_only',
    quote: 'During the year, a record £577,000 was awarded to around 60 organisations.',
    url: 'https://www.samworthbrothers.co.uk/community-opportunity-fund/',
    note: 'A year\'s total across around 60 recipients, from the fund\'s annual report summary.' },
  { id: '5da1bb15-e93e-4949-a91b-c886ecd75294', title: 'Scottish Schools Pipes and Drums Trust — Funding and Bagpipe Loans', why: 'not_stated',
    quote: 'SSPDT Funding and Bagpipe Loans',
    url: 'https://sspdt.org.uk/funding/',
    note: 'Instrument loans and tuition funding, with no figure on the funding page.' },
  { id: 'dd88b889-6926-42e8-9e8f-954b3b9e5af4', title: 'Sigrid Rausing Trust — Grants', why: 'invite_only',
    quote: 'Please note that we do not accept unsolicited applications.',
    url: 'https://www.sigrid-rausing-trust.org/',
    note: 'The two figures on the page, £591m given since 1995 and an endowment of over £300 million, are both totals. Reported as invite_only rather than pot_only because there is no application to size in the first place.' },
  { id: 'b5814b20-cfd4-46db-a8dd-3e623ed1c9fd', title: 'Sir Jules Thorn Charitable Trust — General Grants', why: 'index_over_programmes',
    quote: 'Programmes: Medical Research, The Sir Jules Thorn Award for Biomedical Research, The Research Infrastructure Fund, Scaling Impact in Health and Care Fund, Funding for Hospices, Ann Rylands Small Donations',
    url: 'https://julesthorntrust.org.uk/',
    note: 'Six named programmes and no general route, reported the same way in the timing job. No figure on the index.' },
  { id: '763f13e2-f1aa-4b50-88be-7d31a9a08bc0', title: 'Slack for Nonprofits', why: 'not_stated',
    quote: 'Apply for the Slack for Charities discount',
    url: 'https://slack.com/intl/en-gb/help/articles/204368833-Apply-for-the-Slack-for-Charities-discount',
    note: 'A discount on a product the charity pays for. The help article states the eligibility rules and no price.' },
  { id: 'd881ca00-a65b-4326-a918-34e75ea648a0', title: 'Social Firms Wales', why: 'not_stated',
    quote: 'Social Firms Wales',
    url: 'https://www.socialfirmswales.co.uk/',
    note: 'A membership and support body. No pound sign in the rendered text.' },
  { id: '759177bd-20e8-4141-821a-93f5ebe820dd', title: 'Social Investment (Esmée Fairbairn)', why: 'pot_only',
    quote: 'Since making our first social investment in 1997, we have approved over £80m in 200 plus social investments.',
    url: 'https://esmeefairbairn.org.uk/our-support/social-investment/',
    note: 'Cumulative since 1997. Note this is NOT the £30,000 minimum written to the three Esmée grant rows in batch 3: that sentence is on the grants apply page and is explicitly about grants, and the social investment page states no ticket size of its own.' },
  { id: '05fcaae0-a3d3-43b7-87b8-69d951b45c24', title: 'Somerset Community Foundation Grants', why: 'index_over_programmes',
    quote: 'Grant size Around £40,000 to £80,000 per year',
    url: 'https://www.somersetcf.org.uk/grants-and-funding/grants-and-funding-for-groups/',
    note: 'The richest index in the job for amounts as well as for dates: at least fourteen funds each printing its own Grant size line, from "Up to £500" to "Around £40,000 to £80,000 per year", plus several typical-grant figures. Every one belongs to a named fund and none to this funder-level row.' },
  { id: '8ce6d37f-0c85-44aa-a8ff-faa71ed8ab2e', title: 'South Yorkshire\'s Community Foundation — Grants', why: 'index_over_programmes',
    quote: 'Search our Grants | South Yorkshire\'s Community Foundation',
    url: 'https://www.sycf.org.uk/apply/search-our-grants',
    note: 'A grant search over the foundation\'s programmes. The results render in JavaScript, so no figure is served, and none would belong to this funder-level row in any case.' },
  { id: 'aa3d0b6c-2048-4007-beb2-25d400085dfe', title: 'Southover Manor Trust', why: 'not_stated',
    quote: 'Please note that grants for schools/organisations are generally not awarded for:',
    url: 'https://southovermanortrust.org.uk/eligibility/',
    note: 'A full eligibility page setting out who may apply and what will not be funded, with no figure on it or on the home page.' },
  { id: 'f1cd5881-e810-4928-875c-17071197523f', title: 'Sported — Funding Programmes', why: 'not_stated',
    quote: 'Current Programmes - Sported',
    url: 'https://sported.org.uk/sported-programmes/',
    note: 'No pound sign in the rendered text. Sported gives support and small grants through named programmes that come and go.' },
  { id: '57c4802f-2d34-4d89-969e-a21f9ef397db', title: 'SSE — All Programmes', why: 'not_stated',
    quote: 'Application-based, longer-term support up to a year',
    url: 'https://www.the-sse.org/learning-support/programmes/',
    note: 'The only "up to" on the page counts time. SSE programmes sometimes carry a Match Trading grant, which is a match rather than a fixed amount.' },
  { id: '6d512c2b-f3b9-43d2-9b9d-83399dc49d0c', title: 'SSE Match Trading Grant', why: 'not_stated',
    quote: 'We are keen to test the parameters of Match Trading: what are the minimum and maximum grant amounts that could be offered?',
    url: 'https://www.matchtrading.com/',
    note: 'A rare case of a page saying in terms that the answer does not exist yet. Match Trading matches an increase in trading income pound for pound, so the award is a function of the applicant\'s own growth.' },
  { id: 'ddc93bb0-b74d-42e7-86a7-172f9a39913c', title: 'SSE Start Up Programme', why: 'not_stated',
    quote: 'Application-based, longer-term support up to a year',
    url: 'https://www.the-sse.org/learning-support/programmes/',
    note: 'apply_url redirects to the same programmes index as the SSE All Programmes row above, and states no figure.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
