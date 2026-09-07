// Spend-restriction — batch 3, rows 41-60. Eight written, twelve reported.
//
// Three more Young Camden Foundation trusts (Hollick, Ian Askew, Lambert)
// share the "Costs associated with eligible projects" template and are
// not_stated under the standard set after batch 1.
//
// Two funder pages turned out to describe an award, not a fund: Gatsby's and
// Kusuma Trust's apply_urls are foundation homepages with a mission statement
// and no application route at all — reported not_stated rather than chased,
// since neither names a specific programme to read guidance from. Kusuma is
// the same trust CLAUDE.md already names as a near-miss trap on other jobs.
//
// Lambeth's own site answers this from a second page in the same fund's own
// navigation (What can we fund?), not a third party: "revenue funding" and
// "capital projects" both named as spend categories with different start
// deadlines, so both are written without a restriction call either way.
// Sussex Community Foundation's Main Grants "how it works" section is shared
// by two rows in this job (this one and Main Grants — Acting on Climate, due
// in batch 4) and states plainly that funding covers "both core operational
// costs and project expenses" — unrestricted for both.
//
//   npx tsx --env-file=.env.local scripts/spend-batch-03-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './spend-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 3

const HEART = 'https://heartresearch.org.uk/what-we-do/community-health/healthy-hearts-grants/'
const MILLER = 'https://funding.scot/funds/a0Rb00000096myaEAA/hugh-mary-miller-bequest'
const ILFORD = 'https://londoncf.org.uk/grants/ilford-community-fund'
const INMAN = 'http://www.inmancharity.org/'
const LAMBETH = 'https://www.lambeth.gov.uk/community-connections-fund/what-can-we-fund'
const LEF = 'https://lef.org.uk/funding/grants/strengthening-justice-fund'
const SCF = 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/'
const LCEF = 'https://www.london.gov.uk/programmes-strategies/environment-and-climate-change/net-zero-energy/london-community-energy-fund'

const ROWS: Row[] = [
  // 46. A dedicated FAQ answers both questions directly: overheads (core
  // costs), salaries and project equipment are all named as claimable.
  { id: 'a9ebac9e-738f-4917-bf81-73e8cf0fc3ba', re: /Heart Research UK/,
    restriction: 'unrestricted', spendTypes: ['capital', 'revenue'],
    cits: { spend_restriction: { snippet: 'Can overhead expenses/oncosts be claimed? Yes, overheads/oncosts can be claimed. We ask that you provide a full breakdown of these.', confidence: 'high', source_url: HEART } } },

  // 50. Same funding.scot pattern as row 1 (A Sinclair Henderson Trust): the
  // trust has no site of its own, and the field is the directory's own
  // categorisation rather than the trust's prose.
  { id: '738638ce-af2f-4052-b428-213248d9312a', re: /Hugh & Mary Miller Bequest/,
    spendTypes: ['capital', 'revenue'],
    cits: { spend_types: { snippet: 'Type of cost: Capital, Revenue', confidence: 'med', source_url: MILLER } } },

  // 52. Core costs are named as an eligible category for organisations based
  // in Ilford; the split by applicant location doesn't change that the fund
  // does fund core costs for one class of applicant.
  { id: '3133f461-9fd4-4d13-a4eb-52f8bb7d69e3', re: /Ilford Community Fund/,
    restriction: 'unrestricted',
    cits: { spend_restriction: { snippet: 'Organisations registered and based in Ilford and delivering activity in Ilford can apply for core organisation costs (these are the essential, behind the scenes expenses required to keep your organisation running and delivering services but are not directly tied to a specific project or service).', confidence: 'high', source_url: ILFORD } } },

  // 53. One clear sentence but thin — no elaboration beyond it, so med rather
  // than high (the standard grant-tracker-be set on Fine & Country in batch 2).
  { id: 'd38779a7-0873-4f2f-91e2-638739a2eb64', re: /Inman Charity/,
    restriction: 'unrestricted',
    cits: { spend_restriction: { snippet: 'The Trustees will support specific projects or core funding.', confidence: 'med', source_url: INMAN } } },

  // 57. From the fund's own "What can we fund?" page, not a third party:
  // revenue and capital projects both named, with different spend-start
  // deadlines for each.
  { id: '5a368644-3211-4a40-9447-d5594938a519', re: /Lambeth Community Connections Fund/,
    spendTypes: ['capital', 'revenue'],
    cits: { spend_types: { snippet: 'Successful projects will enter into a grant agreement with Lambeth Council and grant funding must begin being spent within 6 months of the grant agreement for revenue funding, and one year for capital projects.', confidence: 'high', source_url: LAMBETH } } },

  // 58. "As this is not project funding" is about as direct as unrestricted
  // gets; the full cost list separately names staff time and overheads.
  { id: '06a3f5a0-e90d-451b-a829-0d3b895aac72', re: /Legal Education Foundation/,
    restriction: 'unrestricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'As this is not project funding, we will not ask you to request a specific amount or length of grant in your first stage application.', confidence: 'high', source_url: LEF } } },

  // 59. Sussex Community Foundation's own "How it works" section, which
  // applies to every fund routed through Main Grants — this row and Main
  // Grants - Acting on Climate, due in batch 4, share this exact apply_url.
  { id: 'f79aada3-721e-487c-9e97-35097aa87ee0', re: /Lewes Fund/,
    restriction: 'unrestricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'Funding provides support for organisations for up to one year, including both core operational costs and project expenses.', confidence: 'high', source_url: SCF } } },

  // 60. Stream two names capital costs explicitly for the installation work;
  // stream three's development-fund costs (grid connection fees, legal costs)
  // are revenue-type. No overall core-costs statement, so restriction is left
  // unstated.
  { id: '0d4a2ffd-1aeb-43ca-b1e9-469c2066b968', re: /London Community Energy Fund/,
    spendTypes: ['capital', 'revenue'],
    cits: { spend_types: { snippet: 'Applicants can apply for grants of up to £60,000 (for up to one-third of capital costs), to cover the installation costs of carbon-reduction technologies.', confidence: 'high', source_url: LCEF } } },
]

const REPORT: Report[] = [
  { id: '3b836a87-fd0e-4d5c-bfdc-b44f7c793eb1', title: 'Gatsby Charitable Foundation', why: 'not_stated',
    quote: 'The Gatsby Charitable Foundation was set up by David Sainsbury to realise his charitable objectives.',
    url: 'https://www.gatsby.org.uk/' },

  { id: '3d6656f0-6f74-4635-8c87-0406ded69be2', title: 'Gordon Fraser Charitable Trust', why: 'not_stated',
    quote: 'Applicants must be organisations which are registered either with the Charity Commission in England and Wales or with the Office of the Scottish Charity Regulator.',
    url: 'https://www.gfct.org.uk/' },

  { id: '2b5a4026-5608-4b72-8849-137631789a90', title: 'Grassroots Grants', why: 'not_stated',
    quote: 'This fund is designed to be flexible and accessible, supporting a wide range of local projects and activities.',
    url: 'https://www.berkshirecf.org/available-funding/grassroots-grant-round/' },

  { id: '87dae8fd-4313-4dfa-a042-db71857d6105', title: 'Green Community Grants Programme', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.wildlifetrusts.org/green-community-grants-programme' },

  { id: 'e0dddc2b-3275-41cd-9daf-982aed9798b8', title: 'Hampstead Wells and Camden Trust', why: 'not_stated',
    quote: 'HWCT currently provides organisational funding through the following organisational grant programmes.',
    url: 'https://hwct.org.uk/grants-for-organisations/' },

  { id: '9732902b-9ddd-491e-bbf2-031afc83ba4d', title: 'Henry Smith Foundation Domestic Abuse Counselling Fund', why: 'not_stated',
    quote: 'This grant is coming soon.', url: 'https://henrysmith.foundation/grants/domestic-abuse-counselling' },

  { id: '8f57f2a0-685d-489f-9267-ac9f79b073a7', title: 'Herefordshire Community Foundation — Community Grants (Community Chest)', why: 'not_stated',
    quote: 'Herefordshire Community Foundation aims to build stronger communities in the county by giving grants to worthy community and voluntary groups, charities and individuals.',
    url: 'https://www.herefordshirecf.org/apply-for-a-grant/' },

  { id: '12bbaf28-20aa-445b-867b-1958ebcef1ef', title: 'Hollick Family Charitable Trust', why: 'not_stated',
    quote: 'Costs associated with eligible projects with charitable objectives.', url: 'https://youngcamdenfoundation.org.uk/funding/hollick-family-charitable-trust' },

  { id: 'ec9f1ec9-426a-49aa-aaea-4a3e1a718afc', title: 'Ian Askew Charitable Trust', why: 'not_stated',
    quote: 'Costs associated with eligible activities and projects.', url: 'https://youngcamdenfoundation.org.uk/funding/ian-askew-charitable-trust' },

  { id: 'ed3f6ba2-c76c-4b44-9bf4-5846f4ad4bed', title: 'James Ahern Foundation', why: 'not_stated',
    quote: 'Grants: we award small grants to young people, to help them pursue their passion in life.',
    url: 'https://www.jamesahernfoundation.org/' },

  { id: 'b7d19a10-753c-4294-95ad-ec43ac71595d', title: 'Kusuma Trust UK — Education, Communities & Environment', why: 'not_stated',
    quote: 'We\'re making sure disadvantaged young people from former coal mining areas have the confidence they need to apply for top universities.',
    url: 'https://www.kusumatrust.org/' },

  { id: '97242e7b-33ec-4249-b46b-b54f039818d5', title: 'Lambert Charitable Trust', why: 'not_stated',
    quote: 'Costs associated with eligible projects.', url: 'https://youngcamdenfoundation.org.uk/funding/lambert-charitable-trust' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
