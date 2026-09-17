// Spend-restriction — batch 2, rows 21-40. Four written, sixteen reported.
//
// grant-tracker-be corrected batch 1 after reading it: "costs associated with
// eligible projects" describes what the fund pays for without excluding core
// or running costs, so it is not_stated, not restricted. That reading applies
// across this whole batch. Cuthbert Horn, Dixie Rose Findlay and Fitton share
// the Young Camden Foundation template with exactly that sentence and are all
// reported not_stated here rather than written restricted, and Fitton and
// Dixie Rose Findlay both had a second trap on top: a nearby "Capital
// grants..." / "Small grants... capital projects" sentence in each page's
// "Other grants to consider" sidebar belongs to a sibling trust, not the one
// this row is about.
//
// Two 403s (Chichester, Comic Relief via Groundwork) are Cloudflare
// interstitials, not silence.
//
// Cornwall Community Foundation's "Community Grants" row is the front door
// over several concurrently-open funds, and its own filter categories list
// three different types side by side (Project costs / Core & project costs /
// Unrestricted) — a single spend_restriction value would misdescribe two of
// the three. Reported index_over_programmes rather than guessed.
//
//   npx tsx --env-file=.env.local scripts/spend-batch-02-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './spend-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 2

const CBF = 'https://www.citybridgefoundation.org.uk/funding/climate-and-environmental-justice/round-one'
const DCMS = 'https://www.find-government-grants.service.gov.uk/grants/dcms-connections-through-gaming-pilot-fund-boys-11-16-1'
const FC = 'https://www.fineandcountryfoundation.com/grants/'
const STEM = 'https://www.communityfoundation.org.uk/grants/funding-for-stem-activities-in-the-north-east/'

const ROWS: Row[] = [
  // 23. Explicit, positive: core costs are the thing this round asks
  // applicants to plan for, named alongside staff salaries.
  { id: 'ae6a6a3c-a0bb-4be9-a1fc-ee1b58c62739', re: /Climate & Environmental Justice/,
    restriction: 'unrestricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'Organisations will need to demonstrate how they will use flexible funding to support their core costs and long-term strategic objectives, and how their work contributes to systems change.', confidence: 'high', source_url: CBF } } },

  // 28. "The funds may not be used for: ... capital expenditure; core costs -
  // other than for those that can be evidenced as directly related to the
  // project" — both explicitly excluded in general, with a narrow carve-out
  // for project-necessary equipment, which reinforces restricted rather than
  // contradicting it. Capital is not added: it is named as excluded.
  { id: 'b3d10128-b913-4815-8e7d-5d8118698c14', re: /Connections Through Gaming/,
    restriction: 'restricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'core costs - other than for those that can be evidenced as directly related to the project outlined in the application', confidence: 'high', source_url: DCMS } } },

  // 37. "the project(s) or overheads which you require funding for" names
  // overheads (core costs) as an eligible category alongside projects.
  { id: 'bfaa140a-ed84-4862-a455-6e48ca22e906', re: /Fine & Country Foundation/,
    restriction: 'unrestricted',
    cits: { spend_restriction: { snippet: 'We focus on complete transparency which is why we request as much detail as possible about the nature of your charity and the project(s) or overheads which you require funding for.', confidence: 'high', source_url: FC } } },

  // 40. Staffing costs are named as an eligible (if capped) cost category —
  // enough for revenue, not enough to call the fund's restriction either way:
  // "well justified and not a significant portion" is a condition, not a
  // core-costs exclusion.
  { id: '58982bd3-de15-4000-9c4b-a4f7a767a64d', re: /Funding for STEM activities/,
    spendTypes: ['revenue'],
    cits: { spend_types: { snippet: 'Please be advised that requests for staffing costs should be well justified and not make up a significant portion of the grant budget.', confidence: 'high', source_url: STEM } } },
]

const REPORT: Report[] = [
  { id: '6aa5d536-2a0f-4e65-b45b-892b8acdc352', title: 'Chichester District Council — Community Grants Programme', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.chichester.gov.uk/grantprogramme' },

  { id: '90da13dd-fdc8-4246-8f63-00a8cb80c4e5', title: 'Childs Charitable Trust', why: 'not_stated',
    quote: 'The Trust does NOT currently accept applications in the categories listed below: Any building work/repairs/refurbishment/fixtures and fittings or restoration projects ... Funding for Youth Worker salaries',
    url: 'https://childscharitabletrust.org/funding/' },

  { id: '1805dc7a-5123-42d2-b283-dce6b6098556', title: 'City Bridge Foundation Communities Building Economic Change', why: 'not_stated',
    quote: 'Full funding information will be published on our website on Monday 14 September 2026, including eligibility guidance and application details.',
    url: 'https://www.citybridgefoundation.org.uk/funding/economic-justice' },

  { id: 'da34170c-1a2a-43ab-9b5c-7cbbf924a4c2', title: 'Comic Relief Community Fund England', why: 'unreadable',
    quote: 'Just a moment... Checking your browser...', url: 'https://www.groundwork.org.uk/comic-relief/' },

  { id: '523da313-e449-46a1-8647-c5a51e58b304', title: 'Cornwall Community Foundation — Community Grants', why: 'index_over_programmes',
    quote: 'Grant type: Select option — Show all — Core & project costs, Project costs, Unrestricted',
    url: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/',
    note: 'The front door over several concurrently-open funds, each tagged with a different type in the page\'s own filter. A single spend_restriction cannot honestly stand for all of them.' },

  { id: '4e4060c3-e8f0-4aba-8877-0f41f509f78d', title: 'Cuthbert Horn Trust', why: 'not_stated',
    quote: 'Costs associated with eligible projects.', url: 'https://youngcamdenfoundation.org.uk/funding/cuthbert-horn-trust' },

  { id: 'ca53ae09-15ca-41a3-bd09-70d97d1b068f', title: 'Dixie Rose Findlay Charitable Trust', why: 'not_stated',
    quote: 'Costs associated with eligible projects.', url: 'https://youngcamdenfoundation.org.uk/funding/dixie-rose-findlay-charitable-trust' },

  { id: '91873653-fafe-475a-b8ff-1584187c6f4c', title: 'Education Foundation For John Vaughan', why: 'not_stated',
    quote: 'The Educational Foundation of John Vaughan was established for those resident in the parish of Llangynog, Carmarthenshire.',
    url: 'https://communityfoundationwales.org.uk/grants/education-foundation-for-john-vaughan/' },

  { id: '0316480d-5a0d-41c7-9c46-8695cb7d8465', title: 'Eleanor Rathbone Charitable Trust — General Grants', why: 'not_stated',
    quote: 'Grants are made in the range £1000 to £3,000 for national and international grants, and up to £5,000 for merseyside grants.',
    url: 'https://eleanorrathbonetrust.org.uk/guidelines.html' },

  { id: 'a0e69102-abcd-4bb0-a11c-840ad6a3e433', title: 'Emerton-Christie Charity', why: 'not_stated',
    quote: 'The Emerton-Christie charity is a grant-making trust donating to other UK-registered charities.',
    url: 'https://www.emertonchristie.org/' },

  { id: '21f84400-4330-4267-9a62-4540617a573d', title: 'Eranda Rothschild Foundation', why: 'not_stated',
    quote: 'The Eranda Rothschild Foundation is a UK registered charitable trust and makes donations to registered charities working in the fields of medical research, education and the arts.',
    url: 'https://erandarothschild.org/' },

  { id: 'b6add755-6f1c-453b-9cfe-54e6b88b3f6d', title: 'Ernest Kleinwort Charitable Trust Medium Grants', why: 'not_stated',
    quote: 'Please read the information on the Grants page to understand what is and is not funded.',
    url: 'https://ekct.org.uk/apply/' },

  { id: 'af98107b-eda0-4294-9fcb-0e125e2733ff', title: 'Esmée Fairbairn Foundation — A Fairer Future', why: 'not_stated',
    quote: 'Organisations working towards social change across four priority areas.',
    url: 'https://esmeefairbairn.org.uk/apply-for-a-grant/a-fairer-future-guidance/' },

  { id: '65032b04-e949-4d96-b34c-3049d4915a8c', title: 'Farmer Welfare Grant', why: 'not_stated',
    quote: 'Defra are launching a Farmer Welfare Grant with a total value of £1.5m which will run from November 2026 to March 2029 for projects which support the mental health and wellbeing of those in the agricultural industry.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/farmer-welfare-grant-1' },

  { id: '2d2d4bc6-1c4e-43e8-8357-e14b85dd3510', title: 'Fitton Trust', why: 'not_stated',
    quote: 'Costs associated with eligible projects.', url: 'https://youngcamdenfoundation.org.uk/funding/fitton-trust' },

  { id: 'f14ca7b1-4e12-48b0-b59c-31b64e602b61', title: 'Forever Manchester — Community Grants', why: 'not_stated',
    quote: 'We manage and administer a number of funds. For support and guidance on the best fund to apply to, please call us before making an application.',
    url: 'https://forevermanchester.com/funding/' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
