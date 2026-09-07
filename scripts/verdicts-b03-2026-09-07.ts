// Verdicts — pile B, batch 3, rows 51-75. Two publish, one park, five reject,
// seventeen hold.
//
// Five dead_url rejects, only two of them the familiar gov.uk Find a Grant
// shape. The other three are a different pattern worth naming: a specific
// product page 404s on a funder\'s OWN site while the funder itself is
// thriving — Corra\'s Alcohol and Drugs Fund strand for Children, Young
// People, Families is no longer among Corra\'s "Available now" funds (only
// Local Support and Local Support Micro Grants remain of that programme);
// Key Fund\'s Energy Resilience Fund page is gone and Key Fund\'s current
// funding page offers one unified £5k-£300k product rather than named ones;
// CFNE\'s Dynamo Digital Inclusion Fund is absent from CFNE\'s current list of
// 18 funds. Checked each against the funder\'s own current listing before
// rejecting, not just the one dead page.
//
// A genuine contradiction rather than a finding, held rather than resolved:
// Constance Travis Community Endowment Fund\'s own page says "This fund is
// currently closed," but Northamptonshire CF\'s central deadlines table says
// the same fund "is a rolling programme; you can apply at any time." Both
// quoted for Paul rather than picked between.
//
// Two publishes, both genuinely open with a future deadline and nothing
// admin-held: D\'Oyly Carte\'s Small Charity track closes 2 October 2026;
// Focus Foundation\'s portal is explicitly "now open" with quarterly
// committee review. Several more holds name a next deadline the page states
// plainly but that a pin blocks writing (Gannochy: 2 October 2026; Baily
// Thomas: 31 December 2026; CultureStep: three dates through March 2027).
//
//   npx tsx --env-file=.env.local scripts/verdicts-b03-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 3

const DOYLY_APPLY = 'https://doylycartecharitabletrust.org/apply-for-funding/'
const DOYLY_WORK = 'https://doylycartecharitabletrust.org/our-work/'
const FOCUS = 'https://www.focusfoundation.org.uk/apply-for-a-grant'
const DELAMERE = 'https://delameredairyfoundation.org.uk/'

const ROWS: Row[] = [
  // 51. Own page says closed; the foundation\'s own central deadlines table
  // says the same fund is rolling. Contradiction, not a finding — held with
  // both sentences rather than picked between.
  { id: 'c9692361-16c7-48e7-825b-8a1d94d9e034', re: /Constance Travis/, pile: 'B', verdict: 'hold',
    quote: 'This fund is currently closed.',
    url: 'https://www.ncf.uk.com/constance-travis-community-fund',
    for_paul: 'The fund\'s own page says it is closed; Northamptonshire CF\'s central grant-deadlines table says the same fund "is a rolling programme; you can apply at any time." The two pages disagree with each other, not just with the row.' },

  { id: '60dcab53-8d08-4c2d-b5e5-a37fa8c29f10', re: /Consumer Led Flexibility/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/consumer-led-flexibility-for-the-clean-energy-superpower-mission-1' },

  // 53. The page 404s and the strand is absent from Corra\'s current
  // "Available now" list — only Local Support and Local Support Micro
  // Grants remain of the Alcohol and Drugs Fund.
  { id: '1d704e7d-adb2-48fc-a851-12a8e9ab471b', re: /Children, Young People/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Available now: Boost Fund, Alcohol and Drugs Fund – Local Support Grants, Alcohol and Drugs Fund - Local Support Micro Grants, Corra Racial Equity Fund.',
    url: 'https://www.corra.scot/grants/',
    for_paul: 'The Children, Young People, Families strand\'s own page 404s, and it is no longer among Corra\'s currently available funds.' },

  // 54. Genuinely rolling, but deadline, amount_max and is_rolling are all
  // admin-held.
  { id: '48c29df0-33d3-47dd-8a24-1094ef8445d3', re: /Local Support Grants/, pile: 'B', verdict: 'hold',
    quote: 'Funding rounds will be conducted on a rolling basis. Applications for projects delivering work up to April 2029 are welcomed.',
    url: 'https://www.corra.scot/grants/alcohol-and-drugs-fund-local-support-grants/',
    for_paul: 'Genuinely rolling, with panels meeting July, September and November 2026 then every two months. deadline, amount_max and is_rolling are all admin-held.' },

  // 55. This round closed 18 August, outcome due 31 October; no next round.
  { id: 'c78ff76b-a8d7-4dc4-98c5-955c6e9add24', re: /Partnership and Delivery/, pile: 'B', verdict: 'hold',
    quote: 'This fund closed to applications on 18 th August 2026 . We expect applicants to be notified of decisions by 31 st October 2026.',
    url: 'https://www.corra.scot/grants/alcohol-and-drugs-fund-partnership-and-delivery-grants/',
    for_paul: 'Closed, outcome due 31 October 2026; no next round stated.' },

  // 56. Stage One closed 23 July; outcome week of 19 October; no next round.
  { id: 'e17e2817-eeb9-4c89-87e0-e867f3e3b2d2', re: /Henry Duncan Grants/, pile: 'B', verdict: 'hold',
    quote: 'Stage One of the Henry Duncan Grants Programme 2026 closed to applications on Thursday 23 July at 12 noon.',
    url: 'https://www.corra.scot/grants/henry-duncan-grants/',
    for_paul: 'Closed, outcome due week of 19 October 2026; no 2027 round stated.' },

  // 57. Closes today; outcome due November; no next round.
  { id: '2612d2af-5d84-41d1-87a2-a0d84a2da367', re: /YoYo Fund/, pile: 'B', verdict: 'hold',
    quote: 'The closing date for this round of applications to the YOYO Fund will be 12pm on Tuesday 1st September.',
    url: 'https://www.corra.scot/grants/yoyo/',
    for_paul: 'Closes today (1 September 2026); outcome due November 2026; no next round stated.' },

  { id: 'd1d21112-7d49-4578-8922-4aff419e5060', re: /Creative Foundations Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/creative-foundations-fund-1' },

  // 59. Three real future deadlines, all pinned regardless.
  { id: '26945401-f658-477f-913a-a0e74baae548', re: /CultureStep/, pile: 'B', verdict: 'hold',
    quote: 'Deadline: Thursday 1 October 2026 ... Deadline: Thursday 26 November 2026 ... Deadline: Thursday 4 March 2027',
    url: 'https://aandb.cymru/culturestep/',
    for_paul: 'Three concrete future deadlines (1 October, 26 November 2026, 4 March 2027), but deadline, amounts, is_rolling and location_tag are all admin-pinned.' },

  // 60. Publish. Nothing admin-held; the Small Charity / second-stage Large
  // Charity deadline is a genuine future date.
  { id: '6add973c-430a-482b-98e9-366ecd2e6a7a', re: /D.Oyly Carte/, pile: 'B', verdict: 'publish',
    quote: 'Small Charity applicants and second-stage Large Charity applicants must complete by 5pm on 2nd October 2026.',
    url: DOYLY_APPLY,
    fields: { deadline: '2026-10-02', is_rolling: false },
    cits: { deadline: { snippet: 'Small Charity applicants and second-stage Large Charity applicants must complete by 5pm on 2nd October 2026.', confidence: 'high', source_url: DOYLY_APPLY } },
    brief: {
      who_can_apply: 'UK-registered or regulated exempt charities, requesting between £500 and £8,000. Applicants need appropriate safeguarding policies, examined annual accounts for their most recent financial year, and a senior-level colleague to co-sign the application.',
      what_they_fund: 'Work in three themes: performing arts (community music-making, performing arts engagement for underserved communities, early-stage career development), creative health (non-clinical arts-based interventions, short breaks for young carers, animal-assisted therapy and horticulture), and heritage crafts and skills (protecting rare craft skills and linking them to training and employment). The focus is on projects that increase access for communities facing barriers to opportunity.',
      how_to_apply: 'Complete the eligibility quiz, which directs applicants to the Small Charity track (income £5m and below) or the Large Charity track (above £5m), via an account with Plinth. Large Charity first-stage applications closed 31 July 2026; Small Charity applicants and second-stage Large Charity applicants must complete by 5pm on 2 October 2026.',
      exclusions: 'Capital projects and routine maintenance, general and round-robin appeals, individuals, medical research, mainstream education across all key stages, projects taking place or benefiting people outside the UK, retrospective funding, sport, universities, and direct grants to hospices (funded indirectly via Hospice UK).',
      decision_timeline: 'Successful applicants must wait 12 months before reapplying, unsuccessful applicants two years; charities awarded three grants within five years must wait three years. Work must begin at least two months after the funding decision, unless at least 75% of the required funds are already secured.',
      typical_award: 'Requests between £500 and £8,000.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'You are applying on behalf of a UK-registered or regulated exempt charity. Your request is between £500 and £8,000.', confidence: 'high', source_url: DOYLY_APPLY },
      what_they_fund: { snippet: 'We fund work in three areas: participation in the performing arts, creative health interventions, and heritage crafts and skills. Our focus is on projects that increase access for communities that face barriers to opportunity.', confidence: 'high', source_url: DOYLY_WORK },
      how_to_apply: { snippet: 'Complete the eligibility quiz to be directed to the relevant application form; Small Charity grants for those with an income of £5m and below per year, or Large Charity grants for those with an income above £5m per year.', confidence: 'high', source_url: DOYLY_APPLY },
      exclusions: { snippet: 'What we DO NOT fund: Capital projects and routine maintenance, General and round-robin appeals, Individuals, Medical research', confidence: 'high', source_url: DOYLY_APPLY },
      decision_timeline: { snippet: 'Successful applicants must wait 12 months before reapplying. Unsuccessful applicants must wait two years before reapplying.', confidence: 'high', source_url: DOYLY_APPLY },
      typical_award: { snippet: 'Your request is between £500 and £8,000.', confidence: 'high', source_url: DOYLY_APPLY },
      open_status: { snippet: 'Small Charity applicants and second-stage Large Charity applicants must complete by 5pm on 2nd October 2026.', confidence: 'high', source_url: DOYLY_APPLY },
    } },

  // 61. Park. No pins, and a plain reopening date.
  { id: '16cda59c-ec63-47b1-b03e-58699d61782a', re: /Delamere Dairy/, pile: 'B', verdict: 'park',
    quote: 'The application window is now closed. If you have not heard from us by 30th September 2026 then you have not been successful. We re-open for applications on 1 st January 2027',
    url: DELAMERE,
    fields: { next_open_date: '1 January 2027', next_open_date_parsed: '2027-01-01', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'We re-open for applications on 1st January 2027', confidence: 'high', source_url: DELAMERE } } },

  // 62. Closed 31 August; outcomes expected January 2027; no next round.
  { id: '1e255db9-6e40-41d9-bb1a-01532ac20b2c', re: /Democratic Engagement Fund/, pile: 'B', verdict: 'hold',
    quote: 'The Democratic Engagement Fund closed to applications on 31 August 2026 at 11:59pm. No further applications are being accepted.',
    url: 'https://www.gov.uk/government/publications/democratic-engagement-fund-prospectus',
    for_paul: 'Closed, outcomes due January 2027; no next round stated. deadline is admin-held.' },

  // 63. Deadline (20 July) has passed; no next round stated.
  { id: '60d8819c-14c1-47f7-8d65-451624296629', re: /Development Fund/, pile: 'B', verdict: 'hold',
    quote: 'Deadline: 12pm, 20th July 2026',
    url: 'https://harrowgiving.org.uk/development-fund/',
    for_paul: 'Deadline has passed; no next round given. Every relevant field is admin-pinned regardless.' },

  // 64. Already reads "Winter 2026" on the row, which the page still says;
  // no more specific date has been added.
  { id: '2553fb39-c2ec-46e3-b344-e442ba4840d8', re: /Didcot Powerhouse/, pile: 'B', verdict: 'hold',
    quote: 'Closing date: Coming winter 2026',
    url: 'https://oxfordshire.org/ocf_grants/the-didcot-powerhouse-fund/',
    for_paul: 'The row already holds "Winter 2026" as its next_open_date, which still matches the page; no more specific date has appeared yet.' },

  // 65. Already reads "Closed — next round TBC", which the page still
  // supports; nothing more specific has appeared.
  { id: '03d377e7-2196-4fd7-807b-36c47932705d', re: /Domestic Abuse Community Innovation/, pile: 'B', verdict: 'hold',
    quote: 'Closing date: Now closed to expressions of interest',
    url: 'https://oxfordshire.org/ocf_grants/domestic-abuse/',
    for_paul: 'The row already holds "Closed — next round TBC", which still matches the page.' },

  // 66. 404, and absent from CFNE\'s current list of 18 funds.
  { id: 'e68c5f52-de13-48fd-88bc-347f749d3035', re: /Dynamo Digital Inclusion/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found.', url: 'https://www.communityfoundation.org.uk/grants/dynamo-digital-inclusion-fund/',
    for_paul: 'The page 404s and Dynamo is absent from CFNE\'s current list of 18 apply-now funds.' },

  // 67. 404, and Key Fund\'s current funding page offers one unified
  // £5k-£300k product rather than named ones like this.
  { id: '94447c6d-5fe2-4148-9578-f15c36e97550', re: /Energy Resilience Fund — Key Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'We can provide investments from £5k to £300k to community and social enterprises.',
    url: 'https://thekeyfund.co.uk/funding/',
    for_paul: 'This product\'s own page 404s, and Key Fund\'s current funding page offers one unified investment product rather than named ones. Same shape as the Key Fund duplicates the pile A verdicts job named.' },

  // 68. Not pinned on deadline, but no round-two date is stated on the page.
  { id: '33bac7f6-8b8f-44f5-8ab6-55141aac452c', re: /Environment & Sustainability Grants/, pile: 'B', verdict: 'hold',
    quote: 'This funding programme has two rounds in 2026.',
    url: 'https://www.heathrowcommunitytrust.org/grants-for-environment-and-sustainability-projects',
    for_paul: 'The page confirms a second 2026 round exists but does not give its dates.' },

  // 69. Publish. Only max_org_income is pinned; the portal is explicitly
  // open with quarterly committee review.
  { id: '67025b88-4512-44ec-ae3b-d5c9329038b4', re: /Focus Foundation/, pile: 'B', verdict: 'publish',
    quote: 'Our portal is now open for applications',
    url: FOCUS,
    fields: { deadline: null, is_rolling: true },
    cits: { is_rolling: { snippet: 'Our portal is now open for applications', confidence: 'high', source_url: FOCUS } },
    brief: {
      who_can_apply: 'UK charities and community groups with an annual income under £1 million, whose core running costs are under 35% of income (excluding professional costs), located in the same county as a Focus Group office. Applicants must primarily support one of the foundation\'s three core pillars.',
      what_they_fund: 'Tangible projects with clear, measurable benefits under three themes: underprivileged children and young people, mental health charities and initiatives, and charitable or community projects near Focus Group\'s regional offices. Grants are not available as part-funding for a project.',
      how_to_apply: 'Register on the online portal, complete a short Expression of Interest form (about 20 minutes, response within one month), then, if invited, a Full Grant Application (2-3 hours, response within 8 weeks). Successful applications are scheduled for the next Grant Committee meeting, which meets roughly quarterly.',
      exclusions: 'The foundation does not provide part-funding for projects. Organisations must have core running costs under 35% of income (excluding professional costs) to be eligible; the Small Grants Programme, for tangible items under £1,000, is invite-only for existing charity partners.',
      decision_timeline: 'The Charity Grant Committee meets roughly four times a year, with dates that can vary; the four most recently listed are 8 December 2025, 2 March, 8 June and 7 September 2026. Full Grant Applications receive a response within about 8 weeks.',
      typical_award: 'The page states no minimum or maximum award amount; the invite-only Small Grants Programme is typically for tangible items under £1,000.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'The charity or community group needs to have an annual income of less than £1m. Have core running costs of less than 35% (this does not include professional costs).', confidence: 'high', source_url: FOCUS },
      what_they_fund: { snippet: 'The grant should be for a tangible project with clear and measurable benefits.', confidence: 'high', source_url: FOCUS },
      how_to_apply: { snippet: 'The first step is to complete a short \'Expression of Interest\' form. This helps us manage resources effectively and should take around 20 minutes to complete. You\'ll receive a response within one month.', confidence: 'high', source_url: FOCUS },
      exclusions: { snippet: 'We do not provide part funding for projects.', confidence: 'high', source_url: FOCUS },
      decision_timeline: { snippet: 'The Charity Grant Committee meet four times a year to review grant applications, but dates may vary. These are: 8 December 2025, 2 March 2026, 8 June 2026 and 7 September 2026.', confidence: 'high', source_url: FOCUS },
      typical_award: { snippet: 'These grants are designed to be quick and accessible, typically funding tangible items for under £1,000, with a turnaround time of approximately 4 weeks. Please note, this programme is invite-only.', confidence: 'high', source_url: FOCUS },
      open_status: { snippet: 'Our portal is now open for applications', confidence: 'high', source_url: FOCUS },
    } },

  // 70. Heavily admin-held; the page shows a live countdown to the next
  // round, but this is UnLtd\'s support for individual social entrepreneurs
  // rather than an organisation applying.
  { id: 'fa1cc1d5-75fa-4a7e-aa6f-178cc3931770', re: /Funding Futures Programme/, pile: 'B', verdict: 'hold',
    quote: 'Next round on 1 October 2026 at 10:00 (23 days)',
    url: 'https://unltd.org.uk/awards/funding-futures-programme/',
    for_paul: 'A live countdown to 1 October 2026, but nearly every column is admin-held, and UnLtd\'s award goes to an individual social entrepreneur rather than an organisation, which is the more basic question here.' },

  // 71. Closed, no next round stated.
  { id: '35dd731c-d8c2-4715-8439-e39a8d9b8c87', re: /London LGBT\+ Fund/, pile: 'B', verdict: 'hold',
    quote: 'Please note that this fund is now closed to applications.',
    url: 'https://lgbtfund.org.uk/live-funds/london-fund/',
    for_paul: 'Closed, no next round stated.' },

  // 72. A real future deadline, pinned regardless.
  { id: '5cec571b-26c2-4a22-b200-f2f7c60cad75', re: /Gannochy Trust/, pile: 'B', verdict: 'hold',
    quote: '2nd October 2026 at 12 noon, for consideration at the grant-making meeting on 2nd December 2026 *Application portal opens on 3rd August 2026*',
    url: 'https://www.gannochytrust.org.uk/our-grants/applying-for-grant-funding/',
    for_paul: 'A genuine future deadline, 2 October 2026, but deadline, amount_max, is_rolling and location_tag are all admin-pinned.' },

  // 73. A recurring quarterly cycle; the row\'s deadline is the current
  // (passed) one, pinned regardless. Next in the cycle: 31 December 2026.
  { id: 'f06351b9-42a7-460c-a9fa-3af50bffb9c2', re: /General and Small Grants/, pile: 'B', verdict: 'hold',
    quote: '31 August for consideration at the meeting to be held in November.',
    url: 'https://www.bailythomas.org.uk/grants/general-programme',
    for_paul: 'A recurring quarterly cycle (31 December, 31 March, 31 August, each for the following meeting); the row\'s deadline is the current, already-passed one. Next in the cycle is 31 December 2026. deadline is admin-pinned.' },

  // 74. A directory/comparison site, not a single fund; heavily admin-held.
  { id: 'eb46e253-9835-467c-ae2f-867f6c871e0b', re: /Good Finance/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://www.goodfinance.org.uk/',
    for_paul: 'A directory of social investors rather than a single fund with a date; nearly every column is admin-held regardless.' },

  // 75. A recurring three-times-a-year cycle (1 December, 1 April, 1 August);
  // the row\'s deadline (1 August) matches the current, already-passed one.
  // deadline itself is not pinned, but the amounts and structures around it
  // are, so this is reported rather than written pending a fuller look.
  { id: '961ce424-4a7d-4dd5-a73f-d3a3a6d37a5f', re: /Grants for Animal Rescue/, pile: 'B', verdict: 'hold',
    quote: '1st December (for our Spring meeting) 1st April (for our Summer meeting) 1st August (for our Winter meeting)',
    url: 'https://www.jeansainsburyanimalwelfare.org.uk/grants',
    for_paul: 'A recurring cycle, three deadlines a year; the row\'s deadline (1 August) is the current, already-passed one. Next in the cycle is 1 December 2026.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
