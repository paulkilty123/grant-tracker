// Timing on 187 live rows — batch 7 (rows 121-140). Six written, fourteen reported.
//
// The low yield here is a property of the rows, not the reading. Nine of the
// fourteen reported are pages that describe a funder or a service and never
// describe an application at all: Peabody, Persimmon, Reach, Resolution
// Foundation, PTES, Rayne, Screen Scotland, Create Growth North East, and a
// gov.uk policy publication that is not a fund. There is no sentence to quote
// on any of them because there is no sentence.
//
// Two cycles written here are the strongest in the job so far, because the
// funders state the recurrence themselves rather than leaving it to be inferred
// from a list of dates:
//   Q Futures  "Closing dates are on 1 May and 1 November every year."
//   Red Hill   "Applications should be submitted by 1st February or 1st
//              September to ensure consideration."
// Red Hill's 1 September has just passed, so its deadline is 1 February 2027.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-07-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 7

const ROWS: Row[] = [
  // 124. "Consider applications across the year" is about applications rather
  // than only about decisions, which is what earns high here where Hedley and
  // Fat Beehive got med.
  { id: '52d6008d-17c3-414e-84be-909177c218ed', re: /Organisation Grants/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'The Trustees meet regularly and consider applications across the year', confidence: 'high',
      source_url: 'https://www.debk.org.uk/organisations' } } },

  // 129. Between rounds: the fund's key-dates block reads Deadline TBC,
  // Opening Date October 2026, Decision Date Early 2027. med, because "Opening
  // Date" and "October 2026" are separate spans either side of an hourglass
  // icon, so the quotable string is the bare month.
  { id: 'a2c9cddb-26a2-466e-a1ae-6811368e9813', re: /Pilkington/,
    fields: { is_rolling: false, deadline: null, next_open_date: 'October 2026' },
    cits: { next_open_date: { snippet: 'October 2026', confidence: 'med',
      source_url: 'https://cfmerseyside.org.uk/grants/pilkington-charities-fund' } } },

  // 131. Two fixed closing dates a year, stated as recurring in so many words.
  { id: '0aac4dfb-fc85-4cdf-a3e9-79ca9dd4f7d3', re: /Q Futures/,
    fields: { deadline: '2026-11-01', is_rolling: false,
      deadline_cycle: [
        { day: 1, month: 5,  label: 'Closing date' },
        { day: 1, month: 11, label: 'Closing date' },
      ] },
    cits: { deadline: { snippet: 'Closing dates are on 1 May and 1 November every year.', confidence: 'high',
      source_url: 'https://lincolnshirecf.co.uk/grants/qfcf/' } } },

  // 134. Trustees meet in March and October; the submission dates are 1
  // February and 1 September. The meetings are not the deadlines — the same
  // distinction that separated the Hampton Fund from Fat Beehive in batch 4,
  // except that here the fund publishes both.
  { id: '35ba6bf6-d21b-4239-b490-6ed905c81898', re: /Red Hill Trust/,
    fields: { deadline: '2027-02-01', is_rolling: false,
      deadline_cycle: [
        { day: 1, month: 2, label: 'For the March trustees meeting' },
        { day: 1, month: 9, label: 'For the October trustees meeting' },
      ] },
    cits: { deadline: { snippet: 'Applications should be submitted by 1st February or 1st September to ensure consideration.', confidence: 'high',
      source_url: 'https://redhilltrust.org/grant-criteria/' } } },

  // 136. Open now, closes 9 October.
  { id: 'd828c430-1b85-4e6c-9634-55d7bc4346c7', re: /Rewilding Challenge Fund/,
    fields: { deadline: '2026-10-09', is_rolling: false },
    cits: { deadline: { snippet: 'Applications are now open until 9 October 2026', confidence: 'high',
      source_url: 'https://www.rewildingbritain.org.uk/how-to-rewild/funding-for-rewilding/rewilding-challenge-fund' } } },

  // 137. The fund's own page has no date; it says it gives once a year in line
  // with the September Main grants deadline, and the Main grants page has that
  // date. Same date as the Lewes Fund row set on 5 September, which is the
  // consistency check: two Sussex funds riding the same round now agree.
  { id: '181c66e2-24d0-4ba5-addb-02ecc3c7c236', re: /Rye Fund/,
    fields: { deadline: '2026-09-11', is_rolling: false },
    sources: [{ url: 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/', label: 'Main grants page (round dates), read 2026-09-06' }],
    cits: { deadline: { snippet: 'Applications are open. The deadline is Friday 11 September', confidence: 'high',
      source_url: 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/' } } },
]

const REPORT: Report[] = [
  { id: '68a158d4-e2c7-42af-934b-fbb418f08e28', title: 'North East Create Growth Programme', why: 'not_stated',
    quote: 'A 6-9 month programme of tailored investment readiness support and mentoring',
    url: 'https://www.wearecreative.uk/support/regional-growth-programmes/north-east/',
    note: 'Describes the programme and its alumni; names no intake, cohort date or application window.' },
  { id: 'e316f5e1-0dcb-4952-b835-02ea3326d38e', title: 'Northern Ireland Screen — Production Fund', why: 'unreadable',
    quote: 'Sorry, you have been blocked. You are unable to access northernirelandscreen.co.uk',
    url: 'https://northernirelandscreen.co.uk/funding/production-funding/',
    note: 'HTTP 403 with a Cloudflare block page, harder than the interstitials elsewhere in this job.' },
  { id: '93e4b316-cb4b-45fb-b8a8-b74f5fb6b831', title: 'Open Society Foundations — Europe & UK Programmes', why: 'index_over_programmes',
    quote: 'The Open Society Foundations award grants and fellowships throughout the year to organizations and individuals who share Open Society values.',
    url: 'https://www.opensocietyfoundations.org/grants',
    note: 'The quote reads as rolling and was deliberately not used: it is about when OSF AWARDS grants worldwide, not about when this row\'s Europe and UK programmes accept applications, and the grants page is an index of separate open calls and fellowships each with its own dates.' },
  { id: 'a6736794-2668-4ea0-aaf2-6523240c163c', title: 'Peabody Community Foundation', why: 'not_stated',
    quote: 'Our Community Investment Strategy 2024-27 shows how we\'ll continue to make a positive difference for residents, creating healthier, wealthier and happier communities.',
    url: 'https://www.peabodygroup.org.uk/our-work/peabody-community-foundation-pcf/',
    note: 'A strategy and impact page with no application route on it at all. Every date is a report or a strategy period.' },
  { id: '3fe7c722-1434-4bdb-8d66-48749104b5e3', title: 'People\'s Health Trust — Health Justice Fund', why: 'not_stated',
    quote: 'The learning and evidence we gain from data, independent evaluation, and on-the-ground practice will be used to influence decision makers and support action that leads to real health justice for communities across Great Britain.',
    url: 'https://www.peopleshealthtrust.org.uk/funding/health-justice-fund',
    note: 'Describes the fund and the programmes inside it; no window, round or deadline anywhere on the page.' },
  { id: 'c2c9241d-e7f4-449d-b7ac-0418505906bf', title: 'People\'s Trust for Endangered Species — Grants', why: 'not_stated',
    quote: 'If you are a scientist or conservationist looking for a grant you can check our funding criteria and apply for one of our grants online.',
    url: 'https://ptes.org/grants/',
    note: 'The grants landing page states no dates and the available-grants sub-page returns 404.' },
  { id: '3a37a464-8110-4e6f-9591-92baf6254893', title: 'Persimmon Homes — Persimmon Community Champions', why: 'not_stated',
    quote: 'Applying for a donation is really simple. All you need to do is complete the online form by clicking the link below.',
    url: 'https://www.persimmonhomes.com/community-champions',
    note: 'An always-available donation form with no stated window. An open form is not a statement that applications are accepted at any time.' },
  { id: '824677b4-075c-45a0-baed-5a36fd733135', title: 'Public Sector Contracts (Social Value Act)', why: 'not_stated',
    quote: 'Published 19 August 2014. Last updated 29 March 2021.',
    url: 'https://www.gov.uk/government/publications/social-value-act-information-and-resources',
    note: 'apply_url is a gov.uk guidance publication about the Social Value Act, not a fund with an application. Worth a look beyond timing: there is nothing here for a fundraiser to apply to.' },
  { id: '8687dd37-8bc0-4c35-9830-aa31f9b6eeb3', title: 'Rayne Foundation', why: 'not_stated',
    quote: 'Rayne Foundation 2024-2026 Following the announcement of our intention to move to targeted calls...',
    url: 'https://www.raynefoundation.org.uk/',
    note: 'The home page trails a move to targeted calls and the how-to-apply and apply-for-a-grant paths both return 404, so no application route could be read at all.' },
  { id: '970ce070-6fea-44fc-bfea-a7317776681a', title: 'Reach Volunteering — TrusteeWorks', why: 'not_stated',
    quote: 'Once your role is live, you can search for volunteers and use the \'Contact volunteer\' button on their profile to ask them to apply to your role.',
    url: 'https://reachvolunteering.org.uk/build-dynamic-trustee-board',
    note: 'A recruitment platform a charity uses whenever it needs a trustee. No round and no statement that it is always open.' },
  { id: '25466243-4af6-453a-9ea4-5f471919fa30', title: 'Resolution Foundation Workertech Partnership', why: 'not_stated',
    quote: 'We\'re open to applications for funding from companies, charities, CICs and cooperatives.',
    url: 'https://www.resolutionfoundation.org/ventures/',
    note: 'The closest call in this batch. "We are open to applications" says the door is open today but names no closing date and does not say applications are taken at any time, so it is reported on the same reasoning as Accelerate in batch 1.' },
  { id: '50a75c68-f590-42ce-96b3-bc71f63faff5', title: 'Sainsbury Family Charitable Trusts', why: 'index_over_programmes',
    quote: 'The Trusts. Find out about the work of individual Trusts here.',
    url: 'https://www.sfct.org.uk/the-trusts/',
    note: 'An index of eighteen live trusts, several of which are separate rows in this job (Gatsby and the Aurora Trust among them, both already reported). Nothing at this level can carry a date.' },
  { id: '18d9e659-bfdc-4d37-9625-6e740f7b46e8', title: 'ScottishPower Foundation — Annual Grants Programme', why: 'not_stated',
    quote: 'ScottishPower Foundation Applying For Funding',
    url: 'https://www.scottishpower.com/about_us/the_scottishpower_foundation/scottishpower_foundation_applying_for_funding/annual_grants_fund',
    note: 'Nothing needed from this job: the row was already given a next_open_date of 2027-07-01 by Paul on 1 September and the parsed column was backfilled today, so it is no longer untimed. The page itself is a 480KB navigation shell listing project announcements back to 2013 and states no window.' },
  { id: '49dba18b-28ee-47b6-98b8-b90104057183', title: 'Screen Scotland — Production & Development Funding', why: 'not_stated',
    quote: 'After applying to the BFI, please ensure you have read the guidelines and Funding Privacy Notice fully before you complete the the Film Development and Production Fund application form.',
    url: 'https://www.screen.scot/funding-and-support/funding/film-development-and-production-fund',
    note: 'A two-step process described in full with no date at either step. Any timing is in the downloadable guidance document.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
