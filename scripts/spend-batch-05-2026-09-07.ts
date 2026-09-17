// Spend-restriction — batch 5, rows 81-100. Nine written, eleven reported.
//
// A trap caught on the way in, not on the way out: Tesco's Bags of Help page
// lists "Running costs and organisation overheads" under the heading
// "Projects which are ineligible" — the opposite of what the phrase looks
// like out of context. First read it as an inclusion (running costs funded,
// unrestricted); the header two lines above says otherwise. Restricted,
// capital only (sports kit, equipment, building improvements are all listed
// under what the fund DOES pay for).
//
// Two rows are Community Foundation North East wind-farm funds the verdicts
// job published this same day (Green Rigg, Shotley Low Quarter), so this
// job's spend-rows list was cut after those went live. Independently
// confirmed from the funder's own page rather than carried over: Green
// Rigg's "Running costs and revenue funding will only be considered in
// exceptional cases" reads as restricted (capital preferred, revenue the
// exception); Shotley's "You can apply for general running costs..." is a
// plain unrestricted statement.
//
// Three more Young Camden Foundation and Sussex Community Foundation
// patterns recur: Bothwell shares the "costs associated with eligible
// projects" template (not_stated, as established since batch 1); the
// Brighton and Hove Legacy Fund applies via Sussex CF's Main Grants process
// (confirmed on its own page: "Apply via our Main grants application form"),
// so it gets the same "core operational costs and project expenses" call as
// Lewes Fund (batch 3) and Main Grants - Acting on Climate (batch 4).
//
//   npx tsx --env-file=.env.local scripts/spend-batch-05-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './spend-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 5

const STEEL = 'https://steelcharitabletrust.org.uk/grants/luton-matters/new-luton-matters-fund-guidance-notes/'
const SUNRISE = 'https://www.sunrisemedical.co.uk/community-fund'
const GREEN_RIGG = 'https://www.communityfoundation.org.uk/grants/supporting-community-groups-within-10-mile-radius-green-rigg-wind-farm/'
const NADARA = 'https://www.communityfoundation.org.uk/grants/supporting-community-groups-within-a-5km-radius-of-the-sisters-and-north-steads-wind-farm-with-priority-given-to-those-within-a-3km-radius/'
const SHOTLEY = 'https://www.communityfoundation.org.uk/grants/supporting-the-community-in-the-parish-of-shotley-low-quarter/'
const SCF = 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/'
const SWIRE = 'https://www.swirecharitabletrust.org.uk/our-funding/'
const TESCO = 'https://tescobagsofhelp.org.uk/tesco-community-grants/'
const ARTS_SOC = 'https://theartssociety.org/charity-grants'

const ROWS: Row[] = [
  // 83. "Grants awarded may be for restricted or unrestricted funding" is a
  // genuine both/either statement from a single fund, not several bundled
  // funds — no single restriction value can honestly stand for it, so it is
  // left unset. Capital and revenue are both named as examples of what
  // restricted grants may cover.
  { id: '59b7e30c-4018-4d22-9e7a-074a5f19ae24', re: /Steel Charitable Trust/,
    spendTypes: ['capital', 'revenue'],
    cits: { spend_types: { snippet: 'Grants awarded may be for restricted or unrestricted funding. Restricted funding includes specifically stated running or capital costs, such as contributions to a salary for a named role, detailed IT upgrades or a building renovation.', confidence: 'high', source_url: STEEL } } },

  // 86. Mobility equipment is one of the fund's own named themes, not a
  // sibling's.
  { id: 'ca66d932-e36c-43cb-8f11-629c0191eb04', re: /Sunrise Medical/,
    spendTypes: ['capital'],
    cits: { spend_types: { snippet: 'Mobility equipment - Funding towards specialist equipment that enables greater independence.', confidence: 'high', source_url: SUNRISE } } },

  // 87. Capital is the stated priority; running costs and revenue are only
  // "considered in exceptional cases" — the same soft-exclusion shape as
  // Austin and Hope Pilkington in batch 1.
  { id: 'f5c454d7-728e-4f11-b7f1-1dc139393d3e', re: /Green Rigg/,
    restriction: 'restricted', spendTypes: ['capital'],
    cits: { spend_restriction: { snippet: 'Priority will be given to capital items with a tangible, lasting benefit, including improvements to community buildings. Running costs and revenue funding will only be considered in exceptional cases.', confidence: 'high', source_url: GREEN_RIGG } } },

  // 88. As explicit as this job gets: "for both capital and revenue funding"
  // in the fund's own opening sentence, with "core cost of the organisation"
  // named under revenue requests.
  { id: '6c091760-ee77-4a23-b1dd-36a780751eb7', re: /Nadara Sisters/,
    restriction: 'unrestricted', spendTypes: ['capital', 'revenue'],
    cits: { spend_restriction: { snippet: 'Nadara Sisters and North Steads Wind Farm Community Benefit Fund established in 2018 supports applications from a minimum of £1,000 and up to £20,000 for both capital and revenue funding from charities and voluntary groups that offer services for the residents of the wind farm area.', confidence: 'high', source_url: NADARA } } },

  // 89. General running costs are directly offered, not exceptional; the
  // one carve-out (CICs' general running costs) is narrower than the general
  // rule, not a contradiction of it.
  { id: 'db97dbb6-63b5-4604-8ccb-10a4722ea2b1', re: /Shotley/,
    restriction: 'unrestricted', spendTypes: ['capital', 'revenue'],
    cits: { spend_restriction: { snippet: 'You can apply for general running costs, specific projects or activities, or for the costs of capital developments or equipment.', confidence: 'high', source_url: SHOTLEY } } },

  // 90. Routes through Sussex Community Foundation's Main Grants process
  // (confirmed on the fund's own page), so the same "how it works" statement
  // that governed Lewes Fund and Acting on Climate applies here too.
  { id: 'c2cbe217-c515-4c4b-b7ad-e719621c598f', re: /Brighton and Hove Legacy Fund/,
    restriction: 'unrestricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'Funding provides support for organisations for up to one year, including both core operational costs and project expenses.', confidence: 'high', source_url: SCF } } },

  // 92. "Happy to consider unrestricted grants" is about as direct a
  // statement as this job sees.
  { id: 'e0055d56-8e59-49fb-bece-8cd38a91cea1', re: /Swire Charitable Trust/,
    restriction: 'unrestricted',
    cits: { spend_restriction: { snippet: 'The Swire Charitable Trust is also happy to consider unrestricted grants for charities that are a good overall fit for our programmes.', confidence: 'high', source_url: SWIRE } } },

  // 93. "Running costs and organisation overheads" sits under "Projects
  // which are ineligible" — restricted, not unrestricted as the phrase alone
  // would suggest. Capital items (equipment, building improvements) are what
  // the fund actually pays for.
  { id: 'd6f2fc61-1403-4f13-9d06-e3b47e6c4f4c', re: /Tesco Community Grants/,
    restriction: 'restricted', spendTypes: ['capital'],
    cits: { spend_restriction: { snippet: 'Running costs and organisation overheads', confidence: 'high', source_url: TESCO } } },

  // 95. "We are unable to fund: ... Capital expenditure, including staff
  // costs, core costs or general operating costs" — an explicit exclusion of
  // core costs, so restricted. Capital is not added: it is named as
  // excluded, not offered.
  { id: 'da11a3e8-998c-464c-82f2-bf3983008847', re: /The Arts Society/,
    restriction: 'restricted',
    cits: { spend_restriction: { snippet: 'We are unable to fund: ... Capital expenditure, including staff costs, core costs or general operating costs.', confidence: 'high', source_url: ARTS_SOC } } },
]

const REPORT: Report[] = [
  { id: 'dd88b889-6926-42e8-9e8f-954b3b9e5af4', title: 'Sigrid Rausing Trust — Grants', why: 'not_stated',
    quote: 'Our grant-making is organised into three main programmes: Human Rights and the Rule of Law, Open Societies, and the Environment.',
    url: 'https://www.sigrid-rausing-trust.org/' },

  { id: '8ce6d37f-0c85-44aa-a8ff-faa71ed8ab2e', title: 'South Yorkshire\'s Community Foundation — Grants', why: 'not_stated',
    quote: 'Use our Grants Wizard to find the funding you\'re looking for.',
    url: 'https://www.sycf.org.uk/apply/search-our-grants',
    note: 'A JS-driven "Grants Wizard" over an unstated number of programmes; no static filter or per-fund type data reaches the text.' },

  { id: 'aafb0cc7-0698-4659-97ee-659579042ec1', title: 'Stobart Sustainability Fund', why: 'not_stated',
    quote: 'We will now lever that offering to become the most sustainable and prosperous haulier in the UK, protecting the environment, our people, our partners and the communities around us.',
    url: 'https://eddiestobart.com/sustainability-projects/',
    note: 'apply_url redirects to a general sustainability page about Stobart\'s own operations; no separate grants page could be found.' },

  { id: '853a4569-c998-4f24-8450-5830a891efc6', title: 'Stronger Communities Fund', why: 'not_stated',
    quote: 'We\'re always looking for new causes and groups to support in projects that fit the themes of our Stronger Communities Fund.',
    url: 'https://www.welovemcrcharity.org/apply-for-funding' },

  { id: '24a624c6-27a3-413f-baa7-742d1cb02c60', title: 'Sussex Crisis Fund — Sussex Community Foundation', why: 'not_stated',
    quote: 'Sussex Community Foundation is a registered charity that exists to make Sussex a fairer and more equal place.',
    url: 'https://sussexcommunityfoundation.org/grants/' },

  { id: '1a99b534-f6f5-4792-937d-361f6a0ba067', title: 'The Access Foundation', why: 'not_stated',
    quote: 'We\'re focused on making a real difference to people\'s lives by awarding grants to charities which make a valuable and measurable positive impact.',
    url: 'https://theaccessgroupfoundation.com/' },

  { id: '8797b0c0-e49a-4b33-b82c-1dc0657254a3', title: 'The Bothwell Charitable Trust', why: 'not_stated',
    quote: 'Costs associated with eligible projects.', url: 'https://youngcamdenfoundation.org.uk/funding/the-bothwell-charitable-trust' },

  { id: '111ced72-612a-47c1-8043-c9b75455fc0b', title: 'The Dodgson Foundation', why: 'not_stated',
    quote: 'We can be quite flexible where we perceive there is a need to be so.', url: 'https://dodgson.org.uk/' },

  { id: '809e464b-0cdb-46cb-b844-8eca7d4644a9', title: 'The Grocers\' Charity — Small Grants', why: 'not_stated',
    quote: 'We do NOT fund the following activities ... Property purchase, building or refurbishment (except for Heritage charities) ... Senior leadership salary',
    url: 'https://grocershall.co.uk/the-charity/the-charity-application',
    note: 'Excludes one specific expense line each for capital and salary, not a general core-costs or project-costs statement, so no restriction call.' },

  { id: '1dcfec77-f432-4bc6-8cf4-bf553ea73e4e', title: 'The Indigo Trust', why: 'not_stated',
    quote: 'Submission of proposals is by invitation only. We are unlikely to fund anything outside our focus areas and we do not fund or sponsor individuals or events.',
    url: 'https://www.sfct.org.uk/indigo-trust/' },

  { id: 'e38c97ec-04dd-4809-8d51-a42522033adb', title: 'The JJ Charitable Trust — Literacy Programme', why: 'not_stated',
    quote: 'We do not fund: Individuals, Capital costs, Literacy work outside the UK, Organisations registered outside the UK, English lessons for children learning English as an additional language, Schools - unless this is for additional provision outside of timetabled lessons',
    url: 'https://sfct.powerappsportals.com/jjapplication/',
    note: 'Capital is explicitly excluded; nothing on the page states restricted or unrestricted, so no restriction call.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
