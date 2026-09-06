// Amounts on 176 live rows — batch 3 (rows 41-60). Four column writes, sixteen reported.
//
// Both finds in this batch came from a page one link on from apply_url, and
// both were invisible to the page the row points at.
//
//   Eleanor Rathbone  apply.html is 2KB of navigation. guidelines.html, linked
//                     from it, carries the whole range in one sentence.
//   Esmée Fairbairn   three rows, three priority guidance pages, and not a
//                     pound sign between them. The shared apply-for-a-grant
//                     page states the floor for all three. Same shape as the
//                     timing job, where the same three rows took their rolling
//                     flag from the same shared page.
//
// Esmée is also the first amount_min in the job with no amount_max, and that is
// the page's own position: "the minimum amount we offer is £30,000 and we have
// no maximum amount". A ceiling invented for tidiness would be worse than none.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-03-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 3

const ESMEE = 'https://esmeefairbairn.org.uk/apply-for-a-grant/'
const ESMEE_SNIPPET = 'Amount: the minimum amount we offer is £30,000 and we have no maximum amount'
const ESMEE_SOURCE = [{ url: ESMEE, label: 'Apply for a grant (minimum grant, no maximum), read 2026-09-06' }]
const ESMEE_PROSE = 'The minimum grant is £30,000 and there is no maximum. Around 200 grants a year across 13 funding priorities; most run three to five years. Requests for less than £30,000 are not funded.'

const ROWS: Row[] = [
  // 51. Two strands in one sentence: £1,000 to £3,000 national and
  // international, up to £5,000 for Merseyside. The row is the trust's general
  // grants, so the ceiling is the higher of the two and the floor is the only
  // one stated. "In exceptional cases grants may be higher" is not a ceiling
  // and is left out of the column.
  { id: '0316480d-5a0d-41c7-9c46-8695cb7d8465', re: /Eleanor Rathbone/,
    fields: { amount_min: 1000, amount_max: 5000 },
    sources: [{ url: 'https://eleanorrathbonetrust.org.uk/guidelines.html', label: 'Guidelines for applicants (grant range), read 2026-09-06' }],
    cits: {
      amount_min: { snippet: 'Grants are made in the range £1000 to £3,000 for national and international grants, and up to £5,000 for merseyside grants.', confidence: 'high',
        source_url: 'https://eleanorrathbonetrust.org.uk/guidelines.html' },
      amount_max: { snippet: 'Grants are made in the range £1000 to £3,000 for national and international grants, and up to £5,000 for merseyside grants.', confidence: 'high',
        source_url: 'https://eleanorrathbonetrust.org.uk/guidelines.html' },
    },
    typical_award: 'National and international grants £1,000 to £3,000; Merseyside grants up to £5,000. In exceptional cases grants may be higher. The trust gave £356,618 in total in 2020/21.',
    typical_award_cit: { snippet: 'Grants are made in the range £1000 to £3,000 for national and international grants, and up to £5,000 for merseyside grants.', confidence: 'high',
      source_url: 'https://eleanorrathbonetrust.org.uk/guidelines.html' } },

  // 54, 55, 56. One foundation, one figure, three rows.
  { id: 'af98107b-eda0-4294-9fcb-0e125e2733ff', re: /A Fairer Future/,
    fields: { amount_min: 30000 },
    sources: ESMEE_SOURCE,
    cits: { amount_min: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } },
    typical_award: ESMEE_PROSE,
    typical_award_cit: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } },
  { id: '732a41ad-8df9-405f-a74f-cd25be2b64c2', re: /Creative, Confident Communities/,
    fields: { amount_min: 30000 },
    sources: ESMEE_SOURCE,
    cits: { amount_min: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } },
    typical_award: ESMEE_PROSE,
    typical_award_cit: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } },
  { id: '6bee86de-f50a-4c01-b409-d72a6f4ed686', re: /Natural World/,
    fields: { amount_min: 30000 },
    sources: ESMEE_SOURCE,
    cits: { amount_min: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } },
    typical_award: ESMEE_PROSE,
    typical_award_cit: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } },
]

const REPORT: Report[] = [
  { id: '0967c01b-4171-4082-903d-d80774586dc3', title: 'Cranfield Trust — Pro Bono Management Consultancy', why: 'not_stated',
    quote: 'Pro bono charity support',
    url: 'https://www.cranfieldtrust.org/',
    note: 'Volunteer management consultancy. No pound sign on the home page.' },
  { id: '094397c0-1d2c-47dc-b112-c15d3d14bfd4', title: 'Cumbria Community Foundation — Community Grants', why: 'index_over_programmes',
    quote: 'Before applying, we strongly encourage you to read the guidance the fund you are interested in.',
    url: 'https://www.cumbriafoundation.org/apply-for-a-grant/',
    note: 'Funder-level page over many funds, each with its own amount. Reported for the same reason in the timing job, where it says as plainly that the deadlines belong to the individual funds.' },
  { id: '50343bc9-4d8e-4416-8aad-c9e3ed2300ac', title: 'Data First Aid', why: 'not_stated',
    quote: 'Approximately 1-6 days over a period of up to 5 months.',
    url: 'https://pbe.co.uk/our-services/data-first-aid/',
    note: 'Pro bono analyst time. The only quantity on the page counts days.' },
  { id: '94b05b92-fde2-48fd-931c-a5b969279a44', title: 'Didymus Fund', why: 'not_stated',
    quote: 'Annual income between £20,000 and £1 million for each of the past 3 years.',
    url: 'https://didymus-charity.org.uk/how-to-apply/',
    note: 'The only range on the page is an eligibility band on the applicant\'s income, which belongs in min_org_income and max_org_income rather than here. Nothing about grant size.' },
  { id: '3e92d23a-b238-4fb4-8d4f-75dc9793d8bd', title: 'Doit Life Volunteer Matching Platform', why: 'not_stated',
    quote: 'The Doit Life volunteering platform is a joint enterprise between Doit Life and the Doit Foundation, provided completely free to charities and members of the public.',
    url: 'https://www.doit.life/non-profits',
    note: 'A free platform. The quote is the closest the page comes to a price and it is zero.' },
  { id: '2df4a8ac-2902-4ffb-9a86-e945b1dbc23b', title: 'Domestic Pro Bono Resources / LawWorks Referral Network', why: 'not_stated',
    quote: 'Domestic pro bono resources',
    url: 'https://www.lawsociety.org.uk/topics/pro-bono/domestic-pro--bono-resources',
    note: 'A Law Society resource index for solicitors. No pound sign, and nothing a charity applies to for money.' },
  { id: '67f13b86-837d-4202-a94c-6e638eb6f14f', title: 'Donate Computers Programme', why: 'not_stated',
    quote: 'If your devices are not within the minimum requirements as detailed on our Call for Equipment, but they are still in great condition, please fill in one of the forms below.',
    url: 'https://turingtrust.co.uk/give-computers/',
    note: 'Worth a look beyond amounts: apply_url is the page for GIVING equipment to the Turing Trust, not for receiving it. Nothing here for a fundraiser to ask for.' },
  { id: '574fc073-bca6-4b01-95c0-a7dc8627c3e0', title: 'Dulverton Trust Grants', why: 'pot_only',
    quote: 'We\'re excited to share that we awarded £777,519 in grants to 19 charities at our February Board meeting.',
    url: 'https://www.dulverton.org/',
    note: 'One board meeting\'s total. It divides to about £41,000 and the trust states no per-grant figure, so nothing is written.' },
  { id: 'a7b1e535-b639-471c-9231-1d87cff07489', title: 'DWF Foundation', why: 'pot_only',
    quote: 'As of December 2025, the Foundation had distributed grants totalling over £1.5million to good causes.',
    url: 'https://dwfgroup.com/en/about-us/dwf-foundation',
    note: 'The same £1.5 million appears three times on the page as a ten-year cumulative total. No per-grant figure on either the foundation page or its Grant Giving page.' },
  { id: '0d90187a-15da-4625-8739-34ae7134aecd', title: 'East End Community Foundation — Grants', why: 'index_over_programmes',
    quote: 'To get all the latest information on applying for grants just sign up to our Newsletter.',
    url: 'https://eastendcf.org/grants/',
    note: 'Funder-level page over its own funds and the programmes it runs for partners, with no figure at this level. Reported the same way in the timing job.' },
  { id: 'a0e69102-abcd-4bb0-a11c-840ad6a3e433', title: 'Emerton-Christie Charity', why: 'not_stated',
    quote: 'Welcome to the Emerton-Christie Charity Website',
    url: 'https://www.emertonchristie.org/',
    note: 'A 308KB Wix site whose rendered text contains no pound sign at all, checked against the raw HTML as well as the stripped text.' },
  { id: '21f84400-4330-4267-9a62-4540617a573d', title: 'Eranda Rothschild Foundation', why: 'not_stated',
    quote: 'The Eranda Rothschild Foundation is a UK registered charitable trust and makes donations to registered charities working in the fields of medical research, education and the arts.',
    url: 'https://erandarothschild.org/',
    note: 'A four-page site with no how-to-apply section, no date and no figure. Reported as not_stated in the timing job for the same reason.' },
  { id: 'eae4707d-3f42-41e9-b31a-48618b09b2f8', title: 'Ethical Property Affordable Charity Workspace', why: 'not_stated',
    quote: 'GET 2 MONTHS RENT-FREE when you lease your workspace by 30th September 2026.',
    url: 'https://www.ethicalproperty.co.uk/',
    note: 'Discounted workspace rather than a grant. The offer on the page is two months of rent, which is a discount on something the charity pays for and not an award.' },
  { id: '7e5b73df-1210-42a9-9c24-fafeb8357cef', title: 'Family Fund — Grants for Families with Disabled Children', why: 'not_stated',
    quote: 'Play the Family Fund lottery from £1 per week, for your chance to win up to £25,000 whilst supporting our work',
    url: 'https://www.familyfund.org.uk/',
    note: 'The only figures on the home page are a lottery ticket price and a lottery prize, neither of them a grant. Grants go to families rather than organisations, which is a separate question for the audience rule.' },
  { id: '1b62fbe2-6a97-45bd-9f40-63a8b59dc7eb', title: 'FareShare Greater Manchester — Community Food Membership', why: 'not_stated',
    quote: 'From fresh to dairy to chilled foods, catering, ambient and frozen items, the cost for the food from FareShare is on average 80-90% cheaper than buying from a low-cost supermarket.',
    url: 'https://faresharegm.org.uk/get-support/join-our-community-membership/',
    note: 'A discount rate rather than an award, and a percentage at that, which the brief excludes from the columns by name.' },
  { id: '65032b04-e949-4d96-b34c-3049d4915a8c', title: 'Farmer Welfare Grant', why: 'pot_only',
    quote: 'Defra are launching a Farmer Welfare Grant with a total value of £1.5m which will run from November 2026 to March 2029.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/farmer-welfare-grant-1',
    note: 'The whole Find a grant listing was read: objectives, criteria, dates and application process are all set out and the £1.5m programme total is the only figure on it.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
