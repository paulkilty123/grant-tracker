// Verdicts — pile B, batch 8 (FINAL), rows 176-195. One publish, nine park,
// one reject, nine hold. Closes out pile B's 195 rows.
//
// Following the corrected park/publish rule from batch 7: park never writes
// `deadline`, only `next_open_date` — reserved for a fund closed now with a
// stated reopening, however that reopening is phrased (an exact date, a
// named month, or a recurring cycle's next occurrence). Nine rows fit that
// shape here, including three identical "Trading for Good" branches (Bury,
// Milton Keynes, Stockport) that all read "Applications closed - Applications
// will open again in Spring 2027" word for word.
//
// One publish: Worthing Community Chest's Grants for Growth reads "you can
// apply at any time during the year" with a full published brief (who can
// apply, exclusions, three funding rounds, typical award) — genuinely
// rolling, nothing admin-held.
//
// Two rows are audience mismatches rather than resolved: Variety Club's
// Equipment Grants are applied for directly by disabled children/families,
// not organisations; Vivensa Academy's Ignition Fund is open only to
// individual ageing researchers who are Academy members. Both held rather
// than force-fit into a reject code this job doesn't have.
//
//   npx tsx --env-file=.env.local scripts/verdicts-b08-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 8

const WORTHING_GROWTH = 'https://worthingcommunitychest.org/grants/grants-for-growth/'
const WORTHING_ROUNDS = 'https://worthingcommunitychest.org/funding-rounds/'

const ROWS: Row[] = [
  // 176-178. Park. Identical wording across all three branches: closed now,
  // reopens Spring 2027. Each has next_open_date free even though nearly
  // everything else is admin-held.
  { id: 'a06424c3-643c-458c-8f97-a228cef657a6', re: /Trading for Good: Bury/, pile: 'B', verdict: 'park',
    quote: 'Applications closed - Applications will open again in Spring 2027',
    url: 'https://www.the-sse.org/programme/trading-for-good-bury/',
    fields: { next_open_date: 'Spring 2027', next_open_date_parsed: '2027-03-01' },
    cits: { next_open_date: { snippet: 'Applications closed - Applications will open again in Spring 2027', confidence: 'high', source_url: 'https://www.the-sse.org/programme/trading-for-good-bury/' } } },

  { id: '15eaab1e-d531-403b-a4da-d7c75c3b113b', re: /Trading for Good: Milton Keynes/, pile: 'B', verdict: 'park',
    quote: 'Applications closed - Applications will open again in Spring 2027',
    url: 'https://www.the-sse.org/programme/trading-for-good-milton-keynes/',
    fields: { next_open_date: 'Spring 2027', next_open_date_parsed: '2027-03-01' },
    cits: { next_open_date: { snippet: 'Applications closed - Applications will open again in Spring 2027', confidence: 'high', source_url: 'https://www.the-sse.org/programme/trading-for-good-milton-keynes/' } } },

  { id: 'dc32afec-6ae0-4e3c-aca0-50792a6b9b40', re: /Trading for Good: Stockport/, pile: 'B', verdict: 'park',
    quote: 'Applications closed - Applications will open again in Spring 2027',
    url: 'https://www.the-sse.org/programme/trading-for-good-stockport/',
    fields: { next_open_date: 'Spring 2027', next_open_date_parsed: '2027-03-01' },
    cits: { next_open_date: { snippet: 'Applications closed - Applications will open again in Spring 2027', confidence: 'high', source_url: 'https://www.the-sse.org/programme/trading-for-good-stockport/' } } },

  // 179. Park. Own dedicated page (not a shared sidebar): partnership
  // closed, deadline for the next round is March 2027.
  { id: '8c23420c-99d3-49c9-b13e-f5062b3616a8', re: /Trailblazer Community Grants/, pile: 'B', verdict: 'park',
    quote: 'Partnership: Closed ... Deadline: March 2027',
    url: 'https://betterconnect.org.uk/our-projects/trailblazer-community-grants/',
    fields: { next_open_date: 'March 2027', next_open_date_parsed: '2027-03-01' },
    cits: { next_open_date: { snippet: 'Partnership: Closed ... Deadline: March 2027', confidence: 'high', source_url: 'https://betterconnect.org.uk/our-projects/trailblazer-community-grants/' } } },

  // 180. Park. Round 13 closed; Round 14 explicitly named as opening in the
  // future, not open yet.
  { id: '71fcd1d1-2bde-4513-ae91-c8c86d3cea49', re: /Trailblazer Fund/, pile: 'B', verdict: 'park',
    quote: 'Trailblazer Round 13 - closed. Trailblazer Round 14: Round Opens: 23 October 2026, Deadline: 28 August 2026, 5pm.',
    url: 'https://www.youthmusic.org.uk/funding/i-need-funding/trailblazer-fund',
    fields: { next_open_date: '23 October 2026 (Round 14 opens; deadline 20 November 2026)', next_open_date_parsed: '2026-10-23' },
    cits: { next_open_date: { snippet: 'Trailblazer Round 14 Round Opens: 23 October 2026 Deadline: 20 November 2026, 5pm', confidence: 'high', source_url: 'https://www.youthmusic.org.uk/funding/i-need-funding/trailblazer-fund' } } },

  { id: 'fb2df025-d6cc-46f9-b878-265a40214da7', re: /Trauma Responsive Greater Manchester Fund/, pile: 'B', verdict: 'hold',
    quote: 'This fund is closed to applications',
    url: 'https://10gm.org.uk/10gms-work/trauma-responsive-greater-manchester-fund/',
    for_paul: 'Closed, no next round stated.' },

  // 182. Park. A recurring fixed cycle stated as bare fact (no "currently
  // open" framing, same shape as Medworth in batch 5); today\'s 1 August
  // deadline has passed, so the next is 1 February 2027.
  { id: 'c36678c2-0801-49a3-a1c0-f7fe6c59b784', re: /Triton Knoll Offshore Community Wind Farm Fund/, pile: 'B', verdict: 'park',
    quote: 'Closing date: 1st February and 1st August',
    url: 'https://lincolnshirecf.co.uk/grants/triton-knoll/',
    fields: { next_open_date: '1 February 2027', next_open_date_parsed: '2027-02-01' },
    cits: { next_open_date: { snippet: 'Closing date: 1st February and 1st August', confidence: 'high', source_url: 'https://lincolnshirecf.co.uk/grants/triton-knoll/' } } },

  // 183. Park. Explicitly "Opening Soon" — not open yet.
  { id: 'eef413f5-805b-4919-b54e-f3e5bd1e7e26', re: /UnLtd . Awards for Social Entrepreneurs/, pile: 'B', verdict: 'park',
    quote: 'Opening Soon | Next round on 1 October 2026 at 10:00',
    url: 'https://unltd.org.uk/awards/',
    fields: { next_open_date: '1 October 2026', next_open_date_parsed: '2026-10-01' },
    cits: { next_open_date: { snippet: 'Opening Soon | Next round on 1 October 2026 at 10:00', confidence: 'high', source_url: 'https://unltd.org.uk/awards/' } } },

  { id: '23774850-f7bd-4f23-abdd-265d1c1b5690', re: /Valour Recognised/, pile: 'B', verdict: 'hold',
    quote: 'This programme is now closed – the application resources below are provided for reference only.',
    url: 'https://covenantfund.org.uk/programme/valour-recognised-centres-development-fund/',
    for_paul: 'Listed under the funder\'s own "Closed Programmes" heading, same shape as Together for Service and Reducing Veteran Homelessness. No reopening mentioned.' },

  { id: 'd7358629-ddba-41f5-b8db-669e5b1dc23e', re: /Variety Club - Equipment Grants/, pile: 'B', verdict: 'hold',
    quote: 'You can submit an application at any time.',
    url: 'https://www.variety.org.uk/how-can-we-help/equipment-grants-for-children/',
    for_paul: 'Genuinely rolling, but disabled children and their families apply directly for equipment — not an organisation applying on their behalf. An audience mismatch, not resolved by any of this job\'s codes.' },

  { id: 'eb625734-ad25-42cf-b2f8-08f0cd6b0ca6', re: /Vivensa Academy/, pile: 'B', verdict: 'hold',
    quote: 'Academy Ignition Fund: Now open – applications are accepted on a rolling basis with quarterly review deadlines.',
    url: 'https://vivensafoundation.org.uk/apply-for-funding/',
    for_paul: 'Open to individual ageing researchers who are Academy members, not organisations — another audience mismatch. Deadline, amounts, funding type and structure fields are admin-pinned regardless.' },

  { id: '131181c3-caf3-43f0-b7e5-86e96cd50e00', re: /Voicescape Community Fund/, pile: 'B', verdict: 'hold',
    quote: 'The Voicescape Community Fund, in partnership with Forever Manchester, is NOW CLOSED to applications from Community Groups in Greater Manchester.',
    url: 'https://forevermanchester.com/fund/voicescape-community-fund/',
    for_paul: 'Closed, no next round stated.' },

  // 188. Park. Own dedicated fund page states the reopening date directly.
  { id: '5520dd51-755e-4695-a348-99463ccab9d6', re: /Warwick and Dominey Fund/, pile: 'B', verdict: 'park',
    quote: 'Applications re-open on 2 November 2026',
    url: 'https://www.cambscf.org.uk/funds/warwick-dominey/',
    fields: { next_open_date: '2 November 2026', next_open_date_parsed: '2026-11-02' },
    cits: { next_open_date: { snippet: 'Applications re-open on 2 November 2026', confidence: 'high', source_url: 'https://www.cambscf.org.uk/funds/warwick-dominey/' } } },

  { id: 'dc4eb9d8-2cae-43e5-b9c6-870b60162446', re: /Welcome for Newcomers Fund/, pile: 'B', verdict: 'hold',
    quote: 'This grant is now closed ... Applications are now closed.',
    url: 'https://henrysmith.foundation/grants/welcome-for-newcomers/',
    for_paul: 'Closed, no next round stated.' },

  { id: '4c400a67-e826-496b-978c-a20504df041d', re: /Westminster Climate Fund/, pile: 'B', verdict: 'hold',
    quote: 'Applications to the fund are open until 6pm on Friday 13 March 2026.',
    url: 'https://www.westminster.gov.uk/leisure-libraries-and-community/grant-funding-opportunities',
    for_paul: 'Confirms the deadline the row already holds; this is a stale general funding index (it still lists programmes closed back in 2023 and 2024) with no next round for this fund.' },

  { id: '1c558d41-a3b9-403d-b8ed-e0ffc6e176ae', re: /Westminster Community Contribution Fund/, pile: 'B', verdict: 'hold',
    quote: 'Stage 2: If you receive the application form, applications must be submitted by 23:59 on Friday 3 April.',
    url: 'https://www.westminster.gov.uk/community-contribution-fund-application-guidelines',
    for_paul: 'Confirms round 7\'s already-known deadline; no round 8 dates stated.' },

  // 192. Park via next_open_date: everything else relevant is pinned.
  // Quarterly cycle stated as bare fact; today\'s end-of-August deadline has
  // passed, so the next is end of November 2026.
  { id: '31807e92-d843-484f-bd73-f6524af16e99', re: /Wise Music Foundation Grants/, pile: 'B', verdict: 'park',
    quote: 'The Wise Music Foundation trustees meet on a quarterly basis... End of November – for applications reviewed in December.',
    url: 'https://wisemusicfoundation.com/apply/',
    fields: { next_open_date: 'end of November 2026', next_open_date_parsed: '2026-11-30' },
    cits: { next_open_date: { snippet: 'End of November – for applications reviewed in December.', confidence: 'high', source_url: 'https://wisemusicfoundation.com/apply/' } } },

  // 193. Publish. "You can apply at any time" — genuinely rolling, full
  // brief available, nothing admin-held.
  { id: '046fb170-b998-4d81-a20a-d768f40a13eb', re: /Worthing Community Chest/, pile: 'B', verdict: 'publish',
    quote: 'For Grants for Growth you can apply at any time during the year when you are ready.',
    url: WORTHING_GROWTH,
    fields: { deadline: '2026-10-31', is_rolling: true },
    cits: { is_rolling: { snippet: 'For Grants for Growth you can apply at any time during the year when you are ready.', confidence: 'high', source_url: WORTHING_ROUNDS } },
    brief: {
      who_can_apply: 'Non-profit groups and charities with a formal constitution, whose projects directly benefit Worthing residents, with an annual income below £100,000 (or 12-month operating costs below that level). Groups must wait two years after a successful Appraisal Panel award before applying again.',
      what_they_fund: 'Larger projects from groups ready to grow, funded up to £1,500. Grants are paid retrospectively, not upfront.',
      how_to_apply: 'Apply at any time during the year. The Grants Administrator guides preparation; the Grants Committee of trustees checks structure and finance, then the Appraisal Panel (representatives from previously funded groups, meeting three times a year) makes the final decision at whichever Funding Round is in effect once the application is complete.',
      exclusions: 'Does not fund projects that have already happened, salaries or professional fees, groups with income over £100,000 (or 12-month operating costs above that), groups whose beneficiaries are outside the Worthing boundary, or activities that are primarily religious or political.',
      decision_timeline: 'Three Funding Rounds a year. The current round (Round 3) accepts applications from 1 July, with an application deadline of 31 October 2026 and an Appraisal Panel expected around 25 November 2026.',
      typical_award: 'Up to £1,500 per award.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'your organisation must have a formal set of rules or constitution / your annual income as an organisation must be below £100,000 or 12m operating costs / you must wait 2 years from a successful award by our Appraisal panel to apply for subsequent funding', confidence: 'high', source_url: WORTHING_GROWTH },
      what_they_fund: { snippet: 'Grants for Growth funding awards up to £1,500 to groups with larger projects in mind. ... Grants for Growth funds are paid retrospectively, NOT upfront', confidence: 'high', source_url: WORTHING_GROWTH },
      how_to_apply: { snippet: 'For Grants for Growth you can apply at any time during the year when you are ready. Your application will be looked at initially by our Grants Committee to check its eligibility... your application will not be considered for an award until the Appraisal Panel of the Funding Round in effect when your application is complete.', confidence: 'high', source_url: WORTHING_ROUNDS },
      exclusions: { snippet: 'We do not fund projects that have already happened, salaries or professional fees, groups with incomes over £100k or 12m operating costs, or groups whose beneficiaries are outside the Worthing boundary... We don\'t fund activities that are primarily religious or political.', confidence: 'high', source_url: WORTHING_GROWTH },
      decision_timeline: { snippet: 'Funding Round 3: Applications accepted from: July 1st, Start Date: September 1st, Application Deadline: October 31st, Appraisal Panel: November 25th*', confidence: 'high', source_url: WORTHING_ROUNDS },
      typical_award: { snippet: 'Grants for Growth funding awards up to £1,500 to groups with larger projects in mind.', confidence: 'high', source_url: WORTHING_GROWTH },
      open_status: { snippet: 'For Grants for Growth you can apply at any time during the year when you are ready.', confidence: 'high', source_url: WORTHING_ROUNDS },
    } },

  { id: 'fae1af9e-dd6c-4f8b-a0f8-5ee4c6fef64d', re: /Young Women in Mind/, pile: 'B', verdict: 'hold',
    quote: 'This grant programme has now closed for this year and we are no longer accepting applications. Please follow us on LinkedIn for updates on our grant programmes.',
    url: 'https://www.thepilgrimtrust.org.uk/young-womens-mental-health-grants/',
    for_paul: 'Closed for the year, no next round stated.' },

  { id: 'ac17f2a9-ae1c-44bc-b6ba-a2398bf957fd', re: /Youth Matters Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/youth-matters-fund-1' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
