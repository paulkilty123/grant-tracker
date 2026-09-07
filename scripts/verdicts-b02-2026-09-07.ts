// Verdicts — pile B, batch 2, rows 26-50. One park, eight reject, sixteen hold.
//
// Eight dead_url rejects this batch, all the same gov.uk Find a Grant
// "Page not found" shape confirmed in batch 1 — the listing has been removed
// now each round has closed. One of the eight (CfI Improving Outcomes for
// Children Experiencing Homelessness) has a sibling row on the funder's own
// UKRI page rather than gov.uk; that one is held instead, since its own page
// is readable, just fully pinned and stale.
//
// Several holds this batch are pin-outlived in the opposite direction from
// batch 1: the row is heavily admin-held across nearly every column (title,
// funder, deadline, apply_url, amounts, is_rolling), so even a genuine
// reopening on the page could not be written. Charity Entrepreneurship's
// Incubation Program page says "open till September 13th" — six days from
// today — but deadline is admin-sourced, and the audience reads as
// individual founders rather than organisations, a second reason to hold.
//
// Two funder pages carry a twice-yearly cycle rather than a single date
// (Cambridgeshire CF's Warwick & Dominey General fund: 1 February, 1 August;
// Chapman Charitable Trust: Spring and Autumn meetings) — both admin-pinned
// on deadline/deadline_cycle regardless, so held rather than parked even
// though the next occurrence could be named.
//
//   npx tsx --env-file=.env.local scripts/verdicts-b02-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 2

const GIVINGMACHINE = 'https://www.thegivingmachine.co.uk/solutions/for-causes/community-grants/'

const ROWS: Row[] = [
  // 26. Pinned on deadline, is_rolling and deadline_cycle. The fund's own page
  // shows an ongoing twice-yearly cycle (1 February, 1 August), not a single
  // closure — the next occurrence would be 1 February 2027.
  { id: '8230b7a2-1212-433d-93e9-59d3cfd11b52', re: /Warwick & Dominey/, pile: 'B', verdict: 'hold',
    quote: 'Warwick and Dominey Fund – General ... Application deadlines: 1 February, 1 August',
    url: 'https://www.cambscf.org.uk/funds/',
    for_paul: 'Runs an ongoing twice-yearly cycle rather than a single closure; the next date would be 1 February 2027. deadline, is_rolling and deadline_cycle are all admin-pinned, so nothing here could be written even confirmed.' },

  // 27. Everything pinned. The specific fund (The Local Community Fund) ran
  // its annual round 22 June to 3 July 2026, now closed with an outcome due
  // this month; no 2027 date announced yet.
  { id: 'd5e32f3e-cc11-4f66-a7f1-320f48f2971a', re: /cardfactory Foundation/, pile: 'B', verdict: 'hold',
    quote: '2026 Community Fund Applications Closed. The application period has now closed. We are currently reviewing all submissions and will contact applicants in September with the outcome of their application.',
    url: 'https://cardfactoryfoundation.org.uk/our-funds/the-local-community-fund/',
    for_paul: 'Annual round, closed, outcome due this month; no 2027 date yet. Every relevant column is admin-pinned regardless.' },

  // 28. A voting-based fund; this year's entry deadline (31 May) has passed
  // and voting for the current shortlist closes today. No next round stated.
  { id: '0b3d2a8b-3d24-462e-8059-1cb5c5c0d445', re: /Caremark/, pile: 'B', verdict: 'hold',
    quote: 'The deadline for entries is 31st May 2026. No entries received after this time will be considered. Voting will open shortly after the shortlist announcement and close at 9am on 1 st September 2026.',
    url: 'https://www.caremark.co.uk/community-care-fund/',
    for_paul: 'This year\'s round is in its voting phase (closes today); no next entry-round date is given.' },

  // 29. Annual; the 2026 fellows were already announced in March. No 2027
  // dates published yet, and the award goes to individual entrepreneurs'
  // businesses rather than an organisation applying in the usual sense.
  { id: 'ef11edf5-15dd-4a03-9d73-9d59dbf81595', re: /Cartier Women/, pile: 'B', verdict: 'hold',
    quote: 'Our 2026 fellows were announced on March 26, 2026.',
    url: 'https://www.cartierwomensinitiative.com/',
    for_paul: 'Annual programme with no 2027 dates published yet; also worth an audience check, since it selects individual entrepreneurs\' businesses rather than a fixed organisational structure.' },

  // 30. Closed for the 2026 round; no 2027 fund page exists yet.
  { id: 'a789db28-6332-42a2-ada2-db51a9bee328', re: /Central District Alliance/, pile: 'B', verdict: 'hold',
    quote: 'Central District Alliance Social and Community Fund 2026 | Closed',
    url: 'https://app.actionfunder.org/fund/979',
    for_paul: 'Closed, no 2027 round published yet.' },

  // 31. Everything pinned; the page\'s own two dates (19 May, 8 July 2026) are
  // both already past, same as the row\'s stored deadline.
  { id: 'fa668359-889b-437e-b3a4-e80d24ab5115', re: /CfI Improving Outcomes for Children Experiencing Homelessness/, pile: 'B', verdict: 'hold',
    quote: '8 July 2026 11:00am UK time',
    url: 'https://www.ukri.org/opportunity/cfi-improving-outcomes-for-children-experiencing-homelessness/',
    for_paul: 'UKRI\'s own page for this call shows the same passed deadline the row holds, and every relevant field is admin-pinned. A duplicate gov.uk listing for the same call is rejected dead_url in this batch.' },

  // 32-34, 39, 40, 42, 44, 47. gov.uk\'s Find a Grant service, genuine
  // "Page not found" — the listing is removed once its round closes.
  { id: 'b5d02e56-00e8-4119-a60f-9d79a4da247a', re: /CfI Improving Outcomes for Children Experiencing Homelessness/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/cfi-improving-outcomes-for-children-experiencing-homelessness-1',
    for_paul: 'gov.uk\'s Find a Grant has removed this listing; the funder\'s own UKRI page for the same call is held separately in this batch.' },

  { id: '4e7f6bd7-6343-499b-8441-51520f259353', re: /Boosting fathers/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/cfi-boosting-fathers-engagement-to-improve-child-outcomes-1' },

  { id: '295ea646-11c0-49cf-8ec4-cf4ff025baba', re: /Earlier identification of UK children with SEN/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/cfi-earlier-identification-of-uk-children-with-sen-1' },

  // 35. Closed to new applications, no reopening date stated.
  { id: 'd7c556c0-18a6-48e1-b881-46444b7723bd', re: /Change Makers Partnership/, pile: 'B', verdict: 'hold',
    quote: 'Closed to applications. The Change makers fund is now closed to new applications.',
    url: 'https://www.tnlcommunityfund.org.uk/funding/funding-programmes/change-makers',
    for_paul: 'Closed, no reopening date on the page.' },

  // 36. Pinned on everything. Runs Spring and Autumn meetings each year;
  // Autumn 2026\'s deadline (31 August) matches the row and has passed, with
  // no Spring 2027 date announced yet.
  { id: 'a0dd3472-4d4f-4987-84c2-fbf919da3c4f', re: /Chapman Charitable Trust/, pile: 'B', verdict: 'hold',
    quote: 'Use the form below to submit an application for the Autumn 2026 meeting. Deadline for applications is 31st August 2026 (midnight GMT).',
    url: 'https://www.chapmancharitabletrust.org.uk/apply',
    for_paul: 'Runs Spring and Autumn meetings each year; Autumn 2026\'s deadline has passed and no Spring 2027 date is up yet. Every relevant field is admin-pinned regardless.' },

  // 37. deadline is admin-sourced (not user-writable even though it isn\'t
  // flagged pinned), and the page\'s own audience is individual founders, not
  // an organisation applying.
  { id: '30706aff-5124-4dba-8776-1e15561c6a78', re: /Charity Entrepreneurship/, pile: 'B', verdict: 'hold',
    quote: 'Applications are now open till September 13th.',
    url: 'https://www.charityentrepreneurship.com/incubation-program',
    for_paul: 'Reads as open until 13 September (six days out), but deadline is admin-held so nothing here could be written; and the programme trains and funds individual future charity founders, not an organisation applying, which is an audience question before anything else.' },

  // 38. An index over several named programmes (SWEF, South Cheshire
  // Funders\' Forum, Active Futures) rather than one dated fund; deadline and
  // is_rolling are pinned regardless.
  { id: '2f8b8ab2-582a-47d9-a034-ba78a9bc7a9f', re: /Cheshire Community Foundation/, pile: 'B', verdict: 'hold',
    quote: 'Grants & Programmes Open Grants Programmes Theme: Tackling disadvantage in Cheshire and Warrington\'s most deprived wards',
    url: 'https://cheshirecommunityfoundation.org.uk/grants-programmes/',
    for_paul: 'apply_url is an index over several named programmes with no single date visible for the Open Grants Programme specifically; deadline is admin-pinned regardless.' },

  { id: 'ca11a595-5a4b-4e00-a926-fadcf4b8c218', re: /Child Focused Court IDVA/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/child-focused-courts-idva--cheshire--merseyside-1' },

  { id: 'e3cdafc8-497c-4ec4-a6e5-916eb2f66bf2', re: /Childcare Support Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/childcare-support-grant-1' },

  // 41. Individual residents propose the improvement, not an organisation;
  // the row\'s existing rolling/no-deadline reading already matches the page.
  { id: 'c5e41501-c19d-4184-a701-1eecd4871c5e', re: /Chrysalis Programme/, pile: 'B', verdict: 'hold',
    quote: 'Anyone who is 18 or over and lives, works or studies in Hillingdon can propose an improvement.',
    url: 'https://www.hillingdon.gov.uk/article/1823/Chrysalis-projects',
    for_paul: 'An individual resident proposes the improvement to council-owned assets; an audience question rather than a timing one. Rolling with no deadline already matches what the page describes.' },

  { id: '34c24b63-de1c-480f-93f7-0f0fb4b62403', re: /Civil Society Resilience Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/civil-society-resilience-infrastructure-fund-1' },

  // 43. Pinned on deadline and next_open_date. This year\'s window (opened 8
  // June, closed 7 August) has run its course; no next round stated.
  { id: '963baf0d-5303-43d2-8ab2-31927e558e25', re: /Clean Air Solar Farm/, pile: 'B', verdict: 'hold',
    quote: 'We will be open for applications on the 8th of June 2026. Then, the deadline is noon on the 7th August 2026.',
    url: 'https://tworidingscf.org.uk/fund/clean-air-solar-farm-community-benefit-fund/',
    for_paul: 'This year\'s window has closed; no next round stated. deadline and next_open_date are both admin-pinned regardless.' },

  { id: 'ee7b5fc6-f705-4852-b411-a1ec89a5c222', re: /Commercial Climate Services Call/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/commercial-climate-services-call-1' },

  // 45. Closed, and title/apply_url/amounts/is_rolling are all admin-sourced.
  { id: 'cfb56fe7-0ddb-4ac4-ab6f-c04102b8009d', re: /Community Action Fund/, pile: 'B', verdict: 'hold',
    quote: 'The Community Action Fund is currently closed for applications.',
    url: 'https://www.greggsfoundation.org.uk/grants/community-funding',
    for_paul: 'Closed, no reopening date stated; several fields are admin-sourced regardless.' },

  // 46. A clean park: only eligible_structures is pinned, and the fund
  // states its own reopening date plainly.
  { id: '6e32f1bc-2acd-4e86-bbeb-b73980d141dc', re: /Community Grants Programme/, pile: 'B', verdict: 'park',
    quote: 'We will open the application process again on 1st October 2026.',
    url: GIVINGMACHINE,
    fields: { next_open_date: '1 October 2026', next_open_date_parsed: '2026-10-01', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'We will open the application process again on 1st October 2026.', confidence: 'high', source_url: GIVINGMACHINE } } },

  { id: '6aec6f51-67e6-4534-a34e-0070d1f2d969', re: /Community Hub Project Grants/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/community-hub-project-grants-1' },

  // 48. Pinned on deadline_cycle. This year\'s window (opened 29 June, closed
  // 6 August) has run its course; no next round stated.
  { id: '14bd601a-0921-41b1-ad4c-3f1ec64b370a', re: /Community Wellbeing and Mental Health Fund/, pile: 'B', verdict: 'hold',
    quote: 'This Fund is now CLOSED. The deadline to apply was midday on August 6, 2026.',
    url: 'https://www.dorsetcommunityfoundation.org/funds/community-wellbeing-and-mental-health-fund/',
    for_paul: 'This year\'s window has closed; no next round stated. deadline_cycle is admin-pinned regardless.' },

  // 49. No spend, timing or route detail on the page beyond a general
  // description of the charity.
  { id: '0d07f6e5-8619-4ccc-9434-307e5644612d', re: /Company of Actuaries Charitable Trust/, pile: 'B', verdict: 'hold',
    quote: 'Our principal sources of funding are donations and legacies from our members.',
    url: 'https://www.actuariescompany.co.uk/charity/',
    for_paul: 'No application route, deadline or reopening information found on the page.' },

  // 50. The apply_url redirects to a rebranded site (Computers 4 Good); a
  // relink question more than a timing one, and heavily admin-held anyway.
  { id: 'c2f62efc-64e7-4635-8a2c-9802e2ea089d', re: /Computers 4 Charity/, pile: 'B', verdict: 'hold',
    quote: 'Donate Your Old Laptops and Computers for Charity', url: 'https://computers4good.com/',
    for_paul: 'apply_url now redirects to computers4good.com, a rebrand of the same organisation, still offering refurbished equipment to charities. A relink candidate; nearly every column is admin-held regardless.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
