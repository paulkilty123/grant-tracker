// Spend-restriction — batch 6, rows 101-116. The last batch: one written,
// fifteen reported.
//
// Two false positives from the applicant's-own-finances sense of
// "restricted"/"unrestricted", not the grant's: Toy Trust's eligibility
// criteria check the APPLICANT's balance sheet ("unrestricted net assets...
// of not more than £200,000") and administration-cost ratio, which is about
// the charity's financial health, not what this grant can be spent on — the
// same trap as Magdalen Hospital Trust's "TOTAL income (both unrestricted
// and restricted)" in batch 4.
//
// Virgin Media O2's Apprenticeship Talent Fund is the one write: the page
// says outright the funding does not cover an apprentice's salary, only
// their training, so it goes down as restricted rather than the
// spend_types-only treatment the verdicts job gave it when publishing the
// row (that job wasn't asked to make this call).
//
// Westminster City Council's page lists over a dozen separately named grant
// programmes with different rules — a "VCS core funding programme"
// alongside a "North Paddington Community Capital Grant" — so no single
// spend_restriction value can stand for the row. index_over_programmes.
//
// Several rows exclude one specific cost line without a general core-costs
// or project-costs statement either way, kept consistent with how JJ
// Charitable Trust and Grocers' Charity were read in batch 5: Ufi VocTech
// Activate (equipment purchases as the majority of a project's cost),
// Worthing Community Chest (salaries specifically), Pebble Trust
// (professional fees for running workshops). None gets a restriction call.
//
//   npx tsx --env-file=.env.local scripts/spend-batch-06-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './spend-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 6

const VMO2 = 'https://news.virginmediao2.co.uk/apprenticeship-talent-fund/'

const ROWS: Row[] = [
  { id: '7b924e63-a2a6-42f2-9968-4786de21cb47', re: /Apprenticeship Talent Fund/,
    restriction: 'restricted',
    cits: { spend_restriction: { snippet: 'The funding is not available to cover the salary of an apprentice.', confidence: 'high', source_url: VMO2 } } },
]

const REPORT: Report[] = [
  { id: 'c94379cc-bd70-482c-a3cd-76d406e9908f', title: 'The Julia Rausing Trust — Grants', why: 'not_stated',
    quote: 'The Julia Rausing Trust is a charitable fund that honours the memory of Julia Rausing by making grants in her name.',
    url: 'https://www.juliarausingtrust.org/' },

  { id: '554951a7-6058-4837-a6c1-1a635b7aba85', title: 'The Pebble Trust', why: 'not_stated',
    quote: 'We tend not to give money for professional fees, for example payment for running workshops.',
    url: 'https://www.pebbletrust.org/donations',
    note: 'One specific excluded cost line, not a general core-costs statement.' },

  { id: '5bb5658f-c526-4fc2-8dbc-a8162056574d', title: 'The Tedworth Charitable Trust', why: 'not_stated',
    quote: 'The Tedworth Charitable Trust supports projects in the following areas: parenting, family welfare and child development; and arts and the environment.',
    url: 'https://www.sfct.org.uk/the-tedworth-charitable-trust/' },

  { id: '1ffe7161-587d-48ce-86a2-39a94a9120ad', title: 'The Weavers\' Company Charitable Funds', why: 'unreadable',
    quote: '(connection timed out)', url: 'https://www.weavers.org.uk/charity/charitable-grants/guidelines/' },

  { id: '40c079d7-5be8-4eaf-9ad0-db4f59d34c71', title: 'The Wyseliot Rose Charitable Trust', why: 'not_stated',
    quote: 'The funding is for charitable work that addresses the Trust\'s objectives.', url: 'https://youngcamdenfoundation.org.uk/funding/the-wyseliot-rose-charitable-trust' },

  { id: '97352e7c-d16c-4a1c-98a6-ee508bce182b', title: 'Toy Trust', why: 'not_stated',
    quote: 'The applicants accounts must show a ratio of administration & overhead costs (including wages & salaries) to income of less than 30%',
    url: 'https://www.toytrust.co.uk/apply/',
    note: 'About the APPLICANT\'s financial health, not what the grant may be spent on.' },

  { id: 'cdc9da1a-1c11-428c-8be1-3f9d8cf42c04', title: 'Ufi VocTech Trust — VocTech Activate', why: 'not_stated',
    quote: 'Projects for which the majority of the costs are equipment purchases.',
    url: 'https://ufi.co.uk/grant-funding/voctech-activate/',
    note: 'Under "Ufi does not grant fund..." — a majority-of-costs exclusion, not a flat ban, and no core/project-costs statement either way.' },

  { id: '31f56c84-447a-478b-a15a-fcb19469c1aa', title: 'UK and Ireland Community Tree Planting Grant', why: 'not_stated',
    quote: 'Every year, ITF supports community groups across the UK and Ireland to bring their tree-planting ambitions to life.',
    url: 'https://www.internationaltreefoundation.org/uk-grants' },

  { id: 'fd7d2b8b-4946-43a8-be8b-1ef9b63ce244', title: 'Wakeham Trust', why: 'not_stated',
    quote: 'What would you spend the money on? Please give a rough breakdown and an overall budget.',
    url: 'https://thewakehamtrust.org/2020/05/05/how-to-apply/' },

  { id: '5f18b678-a15a-48a8-b798-8322a9816b61', title: 'Westminster City Council — Community Grants', why: 'index_over_programmes',
    quote: 'VCS core funding programme: Core funding up to £30,000 per year is available ... North Paddington Community Capital Grant: Funding is available to support capital projects for community organisations',
    url: 'https://www.westminster.gov.uk/leisure-libraries-and-community/grant-funding-opportunities',
    note: 'Over a dozen separately named programmes on one page, at least one explicitly core-funding and another explicitly capital-only.' },

  { id: '1bc07b39-f953-43ee-8248-db7ccf816f86', title: 'Weston Windfarm Community Fund', why: 'not_stated',
    quote: 'It can support any type of activity that involves local people through small community organisations, and benefits their community.',
    url: 'https://www.norfolkfoundation.com/funding-support/grants/groups/weston-windfarm-community-fund/' },

  { id: '3f5d135b-c001-4cc3-8ae3-049a9b85baef', title: 'Whirlwind Charitable Trust', why: 'not_stated',
    quote: 'Donations focused on delivery rather than general overheads.',
    url: 'https://www.whirlwind.org.uk/guidelines/',
    note: '"Modest organisational overheads and employee salaries" is listed as one of several things the Trust looks favourably on, alongside a preference for delivery over overheads — too mixed for a clean restriction call.' },

  { id: '4c6acc32-d648-451c-931b-17da273ab598', title: 'Worthing Community Chest — Seed Grants', why: 'not_stated',
    quote: 'We do not fund salaries or groups/projects that do not benefit people who live within the Worthing boundary shown in the map above.',
    url: 'https://worthingcommunitychest.org/grants/seed-grants/',
    note: 'One specific excluded cost line (salaries), not a general core-costs statement.' },

  { id: '88fd8569-c9e4-4973-b69f-b85a31425e0c', title: 'York Community Fund', why: 'not_stated',
    quote: 'We are particularly interested in: Resourcing leadership time for reflection, learning, planning and ways of working exploration.',
    url: 'https://tworidingscf.org.uk/fund/york-community-fund/' },

  { id: '581fab6f-e73b-4584-82fd-d0ab9f355aed', title: 'Zochonis Charitable Trust — Grants', why: 'not_stated',
    quote: 'Please include a \'Plan on a Page\', detailing your current funding requirement, how the money will be spent and the success criteria for which you are aiming.',
    url: 'https://www.zochonischaritabletrust.com/how-to-apply/' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
