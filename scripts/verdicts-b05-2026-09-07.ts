// Verdicts — pile B, batch 5, rows 101-125. Two publish, one park, four
// reject, eighteen hold.
//
// Three dead_url rejects, the familiar gov.uk shape, plus one duplicate the
// publish path\'s own dedup query caught: Lloyds Bank Foundation\'s generic
// funding-programmes row describes exactly one open programme, Good Place to
// Live: New Beginnings Fund — and that fund is already a live row with its
// own dedicated page. Read as a publish candidate right up until the dedup
// check; the database, not the page, settled it.
//
// Two publishes, both genuinely open with nothing admin-held on the fields
// written: Leicestershire & Rutland CF\'s Making Local Life Better Fund is
// explicitly rolling ("No deadlines, the grant programme is open all year
// round"); Mid Sussex District Council states outright "We are currently
// accepting Community Grant Applications," closing 24 September. One park:
// Medworth Community Fund runs a fixed 1 May / 1 August cycle with nothing
// pinned, so the next occurrence (1 May 2027) is written directly.
//
// A pattern worth naming rather than resolving: three funds show a genuine,
// specific future date that a pin blocks writing — J N Derbyshire Trust
// (opens 1 September, deadline 31 January 2027), Nature Networks Fund round
// six (3 November 2026). A fourth, New Albion Community Wind Farm Fund, is
// murkier: its own entry on Northamptonshire CF\'s central deadlines table
// still shows the same date the row already holds, while sibling wind farm
// funds on the same table (Winwick, Yelvertoft, The Compton Fund) have all
// moved to 2 October 2026 — held rather than guessed at.
//
//   npx tsx --env-file=.env.local scripts/verdicts-b05-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 5

const LLR = 'https://www.llrcommunityfoundation.org.uk/making-local-life-better-fund/'
const LLOYDS = 'https://www.lloydsbankfoundation.org.uk/funding/'
const MIDSUSSEX = 'https://www.midsussex.gov.uk/business-licensing/community-grants/'
const MEDWORTH = 'https://www.cambscf.org.uk/funds/medworth/'

const ROWS: Row[] = [
  { id: '077f7cf0-20e7-4199-896c-693c3f049c8a', re: /Independent Legal Advisors Service/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/independent-legal-advisors-service-1' },

  // 102. Deadline (29 June) has passed; no next round stated. Pinned regardless.
  { id: 'e95c39ec-da7e-4fdc-b111-9fc219fee6e9', re: /Innovate 2026/, pile: 'B', verdict: 'hold',
    quote: 'Deadline for applications – Monday 29 June 2026 at 9am.',
    url: 'https://www.sound-connections.org.uk/what-we-do/innovate/',
    for_paul: 'Deadline has passed; no next round stated. Every relevant field is admin-pinned.' },

  // 103. "In delivery" — this round is closed and already funding its
  // recipients; no next round date is given.
  { id: '334ea9cf-ae9c-4df9-ae2d-3c36bff9b8f5', re: /Inspiring Lewisham Communities Fund/, pile: 'B', verdict: 'hold',
    quote: 'In delivery', url: 'https://app.actionfunder.org/fund/955',
    for_paul: 'Status reads "In delivery" — this round has closed and is funding its recipients. No next round date given.' },

  // 104. A genuine new round (opened 1 September, closes 31 January 2027),
  // but deadline is admin-held.
  { id: 'c740bb33-f49e-4c9f-b8db-110b767e985f', re: /J N Derbyshire Trust/, pile: 'B', verdict: 'hold',
    quote: 'Opening: 01/09/2026 Deadline: 31/01/2027',
    url: 'https://www.forevernotts.com/grant/j-n-derbyshire-trust/',
    for_paul: 'A genuine new round, opened 1 September 2026, closing 31 January 2027, but deadline is admin-held.' },

  // 105. Expression of Interest closed; Stage Two is by invitation only.
  { id: '415b3809-c15b-4bd7-9fc3-0a962fee9b67', re: /Places & Spaces Fund/, pile: 'B', verdict: 'hold',
    quote: 'The Expression of Interest stage has now closed. Successful applicants will be invited to submit a Full Application during August and September 2026.',
    url: 'https://www.jackpetcheyfoundation.org.uk/jack-petchey-places-spaces-fund/',
    for_paul: 'EOI stage closed; the next stage is invitation-only. Every relevant field is admin-pinned.' },

  // 106. The next board meeting is October 2026, but no new application
  // deadline is stated for it; the FY2026-27 invite round has already run.
  { id: '270eddd0-674c-4d18-9f96-80f7a6b46b27', re: /James Tudor Foundation/, pile: 'B', verdict: 'hold',
    quote: 'Full Application submission deadline: 31/07/2026 (17:00hrs)',
    url: 'https://www.jamestudor.org.uk/physical-health',
    for_paul: 'This year\'s invite round has run its course (deadline 31 July); the next board meeting is named for October 2026 but no new application window is stated.' },

  // 107. The page\'s stated deadline (2 September 2026) has itself passed by
  // the time of this read; no further round is named.
  { id: '8bb0acde-a49f-4a86-995a-9f19b23115f0', re: /Sustainable Future Programme/, pile: 'B', verdict: 'hold',
    quote: 'The next open round for the Sustainable Future programme closes on September 2, 2026.',
    url: 'https://www.jrct.org.uk/sustainable-future',
    for_paul: 'The stated round closed 2 September 2026, five days before this read; no further round is named.' },

  // 108. Names a plan of theme-by-theme windows through the year; the one
  // named so far (Environment and Countryside, May) has already closed and
  // no later window\'s date is given yet.
  { id: '1fc7173e-a9af-4efc-bc1d-92c592fd6b2c', re: /King Charles III Charitable Fund/, pile: 'B', verdict: 'hold',
    quote: 'In 2026/27, applications will open as follows: May – Environment and Countryside funding themes (applications now closed)',
    url: 'https://www.kccf.org.uk/small-grants/',
    for_paul: 'Runs a themed rolling plan through the year; the only window named so far has closed and no later window\'s date has been published yet.' },

  // 109. Already accurately rolling with no deadline on the row, but the
  // fund is still hidden — the same shape as Henry Smith\'s Christian Grants
  // in batch 4.
  { id: '6566a492-f6e9-4146-99eb-887aedb4f0a1', re: /Large Grants for Charities/, pile: 'B', verdict: 'hold',
    quote: '© 2026 Masonic Charitable Foundation', url: 'https://freemasonscharity.org.uk/get-support/grants-to-charities/',
    for_paul: 'The row\'s own rolling, no-deadline timing already matches the page; nothing here explains why it is still hidden.' },

  // 110. Publish. Explicitly rolling with no pins.
  { id: 'e04145cc-d57d-445c-8c92-bb77da0fc4f4', re: /Making Local Life Better Fund/, pile: 'B', verdict: 'publish',
    quote: 'Deadline: No deadlines, the grant programme is open all year round.',
    url: LLR,
    fields: { deadline: null, is_rolling: true },
    cits: { is_rolling: { snippet: 'Deadline: No deadlines, the grant programme is open all year round. The grant meets quarterly: 10th February 2026, 28 th April 2026, 11 th August 2026 and 10 th November 2026.', confidence: 'high', source_url: LLR } },
    brief: {
      who_can_apply: 'Not-for-profit organisations, including charities, CICs, companies limited by guarantee and other constituted community organisations, with a minimum of three committee members or directors, based in Leicester, Leicestershire or Rutland.',
      what_they_fund: 'Small grassroots community, voluntary and charitable groups improving the lives of local people, particularly those who are vulnerable, under-represented or disadvantaged, across eight themes including arts and heritage, education and employment, environment, equity and inclusion, health, poverty and disadvantage, sport and recreation, and stronger communities. Eligible costs include small capital, staffing, volunteer expenses, training, venue hire, running costs, and one-off project or pilot activity.',
      how_to_apply: 'No deadlines: the programme is open all year round, and applicants should apply when ready, allowing up to 12 weeks for assessment. The grant panel meets quarterly, on 10 February, 28 April, 11 August and 10 November 2026.',
      exclusions: 'Priority goes to organisations with a turnover under £1,000,000 and free reserves of three to six months\' core operating costs. Organisations may hold only one Making Local Life Better grant at a time, though they can reapply once monitoring on a previous grant is complete.',
      decision_timeline: 'Assessment takes up to 12 weeks. The grant panel meets quarterly (10 February, 28 April, 11 August, 10 November 2026); successful groups have 12 months to deliver the funded activity.',
      typical_award: 'Up to £3,000, with around 20 to 25 organisations supported each quarter.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'Who can apply: Not for profit organisations, including charities, CICs, companies limited by guarantee and other constituted community organisations with a minimum of 3 committee members/Directors.', confidence: 'high', source_url: LLR },
      what_they_fund: { snippet: 'Eligible costs: Small capital, staffing, volunteer expenses, training, venue hire, running costs, one off project activity, pilot activity.', confidence: 'high', source_url: LLR },
      how_to_apply: { snippet: 'Applicants should submit their application when ready, allowing 12 weeks for assessment.', confidence: 'high', source_url: LLR },
      exclusions: { snippet: 'Organisations can only have 1 Making Local Life Better grant at any one time.', confidence: 'high', source_url: LLR },
      decision_timeline: { snippet: 'The grant meets quarterly: 10th February 2026, 28 th April 2026, 11 th August 2026 and 10 th November 2026.', confidence: 'high', source_url: LLR },
      typical_award: { snippet: 'Grant size: Up to £3,000, we expect to support between 20 and 25 organisations in each quarter.', confidence: 'high', source_url: LLR },
      open_status: { snippet: 'Deadline: No deadlines, the grant programme is open all year round.', confidence: 'high', source_url: LLR },
    } },

  // 111. Already accurately "Autumn 2026", which the page still supports;
  // no more specific date has been added.
  { id: '67184349-6518-4ccd-9bd9-1f41704d85f5', re: /Lewes Town Council/, pile: 'B', verdict: 'hold',
    quote: 'The grant cycle for July 2026 has now closed. Outcomes for this round will be shared mid-September 2026.',
    url: 'https://www.lewes-tc.gov.uk/your-council/grants/',
    for_paul: 'The row already holds "Autumn 2026" as its next_open_date, which still fits; no more specific date has appeared.' },

  // 112. Already accurately "Winter 2026", which the page still says.
  { id: 'f5691225-69b9-491b-a33d-3d5f3346fffd', re: /Living Essentials Fund/, pile: 'B', verdict: 'hold',
    quote: 'Closing date: Coming winter 2026', url: 'https://oxfordshire.org/ocf_grants/living-essentials-fund/',
    for_paul: 'The row already holds "Winter 2026", which the page still says. deadline is admin-pinned.' },

  // 113. Everything pinned, and the fund named on the row ("Mental Health
  // Pillar") does not match the one programme the foundation currently
  // lists as open (Good Place to Live: New Beginnings Fund, homelessness).
  { id: '65dd568c-30c8-4e47-ac04-cb779c76a78f', re: /Mental Health Pillar/, pile: 'B', verdict: 'hold',
    quote: 'Open Programmes Good Place to Live: New Beginnings Fund',
    url: LLOYDS,
    for_paul: 'The foundation\'s current open programme is a homelessness-prevention fund, not a Mental Health Pillar by that name; every field on this row is admin-pinned regardless.' },

  // 114. Not a publish after all: the dedup query the publish path runs
  // caught it first. The one open programme this generic index page
  // describes, Good Place to Live: New Beginnings Fund, is already a live
  // row with its own dedicated page — a duplicate proved from the database,
  // not a page reading.
  { id: 'b3794a4d-7951-4d66-8f16-2b78cbca651e', re: /Lloyds Bank Foundation Funding Programmes/, pile: 'B', verdict: 'reject', code: 'duplicate',
    quote: 'Our first funding programme of 2026 is now open for applications. The Good Place to Live: New Beginnings Fund will back local organisations working to prevent homelessness before it happens by focusing on the times in people\'s lives when they are most at risk.',
    url: LLOYDS,
    dupe_of: ['2f87181a'],
    for_paul: 'Duplicate of the live row 2f87181a, Good Place to Live: New Beginnings Fund, which already has its own dedicated page (lloydsbankfoundation.org.uk/funding/good-place-to-live-new-beginnings/). This row is the generic funding index describing the same programme.' },

  { id: 'a14b6359-b0c8-45f6-a41d-8f4a0160017c', re: /LNER Customer & Community Investment Fund/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://www.lner.co.uk/about-us/customer-and-community-investment-fund/',
    for_paul: 'HTTP 403, unreadable today.' },

  { id: '1c9c502a-99a0-4637-9cbf-6d9f0b96712e', re: /Local News Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/local-news-fund-1' },

  // 117. Park. A fixed 1 May / 1 August cycle with nothing pinned; the
  // row\'s deadline (1 August) is the current, already-passed one, so the
  // next occurrence (1 May 2027) is written directly.
  { id: '999ec426-0dcc-4929-ae8e-013411ab41d5', re: /Medworth Community Fund/, pile: 'B', verdict: 'park',
    quote: 'Please note deadline 11:59am on 1st May is for both large (up to £50k) and small (up to £5k) applications. Deadline 11:59am on 1st August is for small (up to £5k) applications only.',
    url: MEDWORTH,
    fields: { deadline: '2027-05-01', is_rolling: false },
    cits: { deadline: { snippet: 'Deadlines 1 May, 1 August', confidence: 'high', source_url: MEDWORTH } } },

  { id: '9605bf45-9c22-467f-92fc-a3a5ba04b6fe', re: /Men.s Health Community Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/mens-health-community-fund-1' },

  // 119. Publish. Genuinely open now, closing in seventeen days, nothing
  // admin-held.
  { id: '3ce5848d-9703-4e93-842f-7c80a74ab1c1', re: /Mid Sussex District Council/, pile: 'B', verdict: 'publish',
    quote: 'We are currently accepting Community Grant Applications.',
    url: MIDSUSSEX,
    fields: { deadline: '2026-09-24', is_rolling: false },
    cits: { deadline: { snippet: 'Applications for the Autumn 2026 round of grants close on Thursday 24th September 2026.', confidence: 'high', source_url: MIDSUSSEX } },
    brief: {
      who_can_apply: 'Community groups and organisations whose project will directly benefit residents of Mid Sussex District. Applicants must be properly formed with a governing document, constitution or company registration, a bank account and financial records (or projections if newly formed), be open to all with an equal opportunities policy, and meet at least one of the council\'s priority areas. Each organisation can receive only one award per financial year.',
      what_they_fund: 'Community projects addressing the council\'s priority areas: strong and resilient communities, community safety, health and wellbeing, and community development, weighted towards projects that address the UN Sustainable Development Goals, particularly inequality, health and wellbeing, climate change and poverty. The maximum grant is £5,000.',
      how_to_apply: 'Apply online during one of three annual rounds (Spring, Summer, Autumn). The Autumn 2026 round opened 21 July 2026 and closes 24 September 2026, with outcomes approved at the Cabinet meeting on 16 November 2026 and applicants advised within 21 days.',
      exclusions: 'Political or specific religious activity, general appeals and day-to-day running costs (rent, utility bills, insurance, regular staff salaries), loan repayments, individuals, profit-making private organisations, local groups whose fundraising goes to a headquarters elsewhere, activities better funded by central government or the county council, town-based events better suited to a Town or Parish Council, Town and Parish Councils themselves except one-off national celebrations, projects that have started or finished, retrospective costs, ongoing maintenance and capital works, and organisations holding more than 9 months\' unrestricted reserves.',
      decision_timeline: 'Grants are generally awarded three times a year (Spring, Summer, Autumn). For the Autumn 2026 round, the Cabinet meeting to approve outcomes is 16 November 2026, with applicants advised within 21 days of the panel meeting.',
      typical_award: 'The maximum grant is £5,000; two alternative quotes are required for any equipment purchase over £500 per item.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'The grant will be of direct benefit to the residents of Mid Sussex District. You are properly formed and have a governing document, a constitution or a company registration, with a bank account and financial records.', confidence: 'high', source_url: MIDSUSSEX },
      what_they_fund: { snippet: 'The maximum grant you can apply for is £5000.', confidence: 'high', source_url: MIDSUSSEX },
      how_to_apply: { snippet: 'Generally, community grants are awarded by Cabinet three times a year: Spring, Summer, and Autumn.', confidence: 'high', source_url: MIDSUSSEX },
      exclusions: { snippet: 'General appeals and day-to-day running costs (This includes and is not limited to monthly/annual rents, utility bills, insurance, regular staff salaries)', confidence: 'high', source_url: MIDSUSSEX },
      decision_timeline: { snippet: 'The Cabinet meeting to approve application outcomes will be held on Monday 16th November 2026.', confidence: 'high', source_url: MIDSUSSEX },
      typical_award: { snippet: 'The maximum grant you can apply for is £5000.', confidence: 'high', source_url: MIDSUSSEX },
      open_status: { snippet: 'We are currently accepting Community Grant Applications.', confidence: 'high', source_url: MIDSUSSEX },
    } },

  { id: '1f0b2bab-83e0-45b9-a746-fa621e21be8a', re: /Mortgage Advice Bureau Foundation/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://www.mortgageadvicebureaufoundation.org/apply',
    for_paul: 'Every relevant field is admin-pinned; no new information found on the page beyond what the row already holds.' },

  // 121. A round is under way, but the entry point (Expression of Interest)
  // for a new applicant has already closed.
  { id: 'dd93bbdd-fe6c-497b-b781-b378a87f2cb3', re: /Museum Fundamentals/, pile: 'B', verdict: 'hold',
    quote: 'Closing date for expressions of interest 5pm Friday 7 August 2026. Full application 5pm Friday 25 September 2026.',
    url: 'https://aim-museums.co.uk/grants/museum-fundamentals/',
    for_paul: 'The Autumn round\'s Expression of Interest stage, the entry point for a new applicant, closed 7 August 2026; the 25 September full-application deadline is only for those already through EOI.' },

  // 122. Vague ("in the coming weeks"), not a stated date.
  { id: '959a853b-a16f-4c46-a18d-d841a5fe55fa', re: /Music for All/, pile: 'B', verdict: 'hold',
    quote: 'Applications for Round 3 have closed. Please check back for details of Round 4 in the coming weeks.',
    url: 'https://www.musicforall.org.uk/schools-and-community-groups-awards/',
    for_paul: 'Round 4 is promised "in the coming weeks" rather than dated.' },

  // 123. A real future deadline, pinned.
  { id: '10a2f396-3562-43d6-8841-7d9608ac08e7', re: /Nature Networks Fund/, pile: 'B', verdict: 'hold',
    quote: 'Application deadline: 12noon on 3 November 2026',
    url: 'https://www.heritagefund.org.uk/funding/nature-networks-fund-round-six',
    for_paul: 'A genuine future deadline, 3 November 2026, but deadline, amounts, is_rolling, location_tag and next_open_date are all admin-pinned.' },

  // 124. Closed, being assessed, no next window date.
  { id: '3d26a26e-b73e-47f2-8c0d-5b68e6913b92', re: /Neighbourhood Fund 2026/, pile: 'B', verdict: 'hold',
    quote: 'The Neighbourhood Fund 2026 project submission window is now closed for this year, many thanks to all of those who have submitted project ideas.',
    url: 'https://www.sutton.gov.uk/planning-and-building/planning/community-infrastructure-levy-cil/neighbourhood-fund',
    for_paul: 'Closed, being assessed; no next window date given.' },

  // 125. Murkier than the others: the fund\'s own entry on Northamptonshire
  // CF\'s central deadlines table still shows the row\'s existing date, while
  // sibling wind farm funds on the same table have moved to 2 October 2026.
  { id: '277bbe32-d3e9-48a8-b826-ebc8fa354395', re: /New Albion Community Wind Farm Fund/, pile: 'B', verdict: 'hold',
    quote: 'New Albion Wind Farm Fund Friday 4th September 2026', url: 'https://www.ncf.uk.com/grants/grant-deadlines',
    for_paul: 'This fund\'s own entry on Northamptonshire CF\'s central deadlines table still shows 4 September 2026, the same date already on the row and now three days past — while sibling wind farm funds on the same table (Winwick, Yelvertoft, The Compton Fund) have all moved on to 2 October 2026. Worth a direct check with the foundation rather than assuming either way.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
