// Verdicts — pile B, batch 6, rows 126-150. Two publish, four park, three
// reject, sixteen hold.
//
// Two rows share an apply_url and a near-identical title: Severn Trent
// Community Fund\'s "New Project Funding" appears twice (1ef69197,
// f4225849), and the fund\'s own page names two grant tiers (£2,000-£20,000
// and £20,001-£50,000) with the same "always open" status — not enough to
// justify two rows describing the same fund. Publishing both would create a
// live duplicate the ordinary dedup check cannot catch, since neither is
// live yet. Published the first; held the second as a likely duplicate for
// Paul to resolve once the first is live, rather than guessing which to keep
// or rejecting a row that has no live counterpart to be a duplicate of.
//
// A pattern worth naming: three rows read as a stale "reopens today" or
// "now open" headline that turns out to be an old news item once the whole
// page is read — Reducing Veteran Homelessness sits under the funder\'s own
// "Closed Programmes" heading despite a same-page news snippet from a past
// reopening; SEGA and Persimmon\'s Open Application Programme both name a
// current, not a future, state without a date to act on.
//
//   npx tsx --env-file=.env.local scripts/verdicts-b06-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 6

const COWARD = 'https://www.noelcoward.com/ncf-apply'
const COWARD_HOME = 'https://www.noelcoward.com/foundation'
const SEVERN = 'https://www.stwater.co.uk/about-us/severn-trent-community-fund/new-project-funding/'
const RESILIENCE = 'https://cornwallcommunityfoundation.com/grants/resilience-fund/'
const SKINNERS = 'https://skinners.org.uk/young-peoples-vocational-development-charities'
const GAMBLING = 'https://www.ukri.org/opportunity/gambling-harms-research-grants/'

const ROWS: Row[] = [
  { id: '5b3b9ba1-88ca-4aa4-85de-0f62f04e49b8', re: /Newcastle Fund/, pile: 'B', verdict: 'hold',
    quote: '10:00am on Thursday 23 July 2026', url: 'https://new.newcastle.gov.uk/communities/grants-funding/funding-voluntary-community-organisations/newcastle-fund',
    for_paul: 'Closed, no next round stated. Every relevant field is admin-pinned.' },

  // 127. Publish. Genuinely open now — the application window (31 August to
  // 9 October 2026) is running today — and nothing is admin-held.
  { id: '0b009875-2b19-4b2d-bd66-965cbe3f43d4', re: /No.l Coward Foundation/, pile: 'B', verdict: 'publish',
    quote: '10am, Monday 31st August 2026 to 5pm, Friday 9th October 2026.',
    url: COWARD,
    fields: { deadline: '2026-10-09', is_rolling: false },
    cits: { deadline: { snippet: 'Only applications received during this window of time will be considered.', confidence: 'high', source_url: COWARD } },
    brief: {
      who_can_apply: 'Performing arts organisations and educational groups. Organisations working exclusively in music, dance or opera must demonstrate a connection to Noël Coward\'s work, either through repertoire or by including his work in the project; organisations already successful in a previous application remain welcome to reapply without this restriction.',
      what_they_fund: 'Educational and professional development projects across the performing arts, with priority for a strong educational element aimed at the 16+ age group, support for people entering or early in an Arts career, projects extending access to groups who have not traditionally engaged with the performing arts, and projects exploring Noël Coward\'s work in educational or theatre settings.',
      how_to_apply: 'Email a single PDF application, maximum four pages including the cover sheet and budget, using the NCF Application Form as the first page. The application window for the 20 November 2026 Grants Committee meeting runs from 10am on Monday 31 August to 5pm on Friday 9 October 2026; only applications received in that window are considered.',
      exclusions: 'The Foundation does not award funding to cover production costs in any form, and will not award money to individuals except through organisations and companies that might themselves make awards to individuals — so it cannot fund individual applicants seeking university or drama school fees.',
      decision_timeline: 'The Grants Committee meets twice a year, usually late spring and late autumn; the next meeting is 20 November 2026.',
      typical_award: 'The page states no minimum or maximum award amount.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'Following a significant increase in applications from outside the NCF\'s core theatre interests, the Trustees have taken the decision to restrict new applications from groups working solely in music, dance or opera to those who are engaged somehow with the work of Noël Coward.', confidence: 'high', source_url: COWARD },
      what_they_fund: { snippet: 'a strong educational element aimed at the 16+ age group; emphasis on supporting people entering or in the early stages of a career in the Arts', confidence: 'high', source_url: COWARD_HOME },
      how_to_apply: { snippet: 'Each application must be a single PDF and have a completed NCF Application Form (download the PDF below) as its first page.', confidence: 'high', source_url: COWARD },
      exclusions: { snippet: 'Please note that the Foundation does not award funding to cover production costs in any form, and will not award money to individuals except through organisations and companies who might themselves wish to make awards to individuals.', confidence: 'high', source_url: COWARD_HOME },
      decision_timeline: { snippet: 'The Grants Committee meets twice a year, usually late spring and late autumn.', confidence: 'high', source_url: COWARD },
      typical_award: { snippet: 'Reasons for applying to the Noël Coward Foundation.', confidence: 'low', source_url: COWARD },
      open_status: { snippet: 'Only applications received during this window of time will be considered.', confidence: 'high', source_url: COWARD },
    } },

  { id: '09b3d42a-e698-4194-9a61-f41062fb46e2', re: /Open Application Programme/, pile: 'B', verdict: 'hold',
    quote: 'Applications for our second funding round are now closed and we will announce the successful updates in September. Please look out for further updates on this page.',
    url: 'https://www.persimmonhomes.com/corporate/foundation/open-application-programme/',
    for_paul: 'Closed, outcome due this month; no third round date given.' },

  { id: 'de5286bb-765c-4fcf-8d76-b19a6a657a4d', re: /Peter Harrison Foundation/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://peterharrisonfoundation.org/active-lives-positive-futures/small-grants-within-surrey/',
    for_paul: 'apply_url 404s, but the foundation is alive with an Active Lives & Positive Futures programme at a different path — a relink candidate rather than a dead fund.' },

  { id: '5c4dccbf-0fe9-4587-a49d-530053bc45fc', re: /Postcode Local Trust Grants/, pile: 'B', verdict: 'hold',
    quote: 'Our funding rounds for 2026 are now closed. Funding rounds for 2027 will be published in the new year.',
    url: 'https://www.postcodelocaltrust.org.uk/apply-for-a-grant',
    for_paul: 'Closed, no 2027 dates yet — the page says they will be published in the new year.' },

  { id: '2de07a97-2272-45e6-a759-c602a607041d', re: /Postcode Lottery Dream Fund/, pile: 'B', verdict: 'hold',
    quote: 'The Dream Fund supports charities to develop innovative solutions to society\'s most challenging problems and was open for formal expressions of interest from March 25th',
    url: 'https://www.postcodedreamfund.org.uk/',
    for_paul: 'Closed; every relevant column is admin-pinned.' },

  // 132. Park. A genuine future opening date, and only location_tag is
  // pinned.
  { id: '792c4cce-e971-4544-8f5c-3e4d098bf087', re: /Gambling harms research grants/, pile: 'B', verdict: 'park',
    quote: 'The funding opportunity will open on 21 September 2026 when more information will be available on this page.',
    url: GAMBLING,
    fields: { next_open_date: '21 September 2026', next_open_date_parsed: '2026-09-21', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'The funding opportunity will open on 21 September 2026 when more information will be available on this page.', confidence: 'high', source_url: GAMBLING } } },

  { id: 'f2a29bb1-d0e6-43b7-864b-1ebd6aadde9d', re: /R&D MAP Creative Content Exchange/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/rd-map-creative-content-exchange-pilot-early-adopters-fund-grant-1' },

  // 134. Sits under the funder\'s own "Closed Programmes" heading; a
  // same-page news item about a past reopening is not current status.
  { id: 'debe4866-33ef-423e-b456-344af55a7367', re: /Reducing Veteran Homelessness/, pile: 'B', verdict: 'hold',
    quote: 'Home > Find funding > Closed Programmes > Reducing Veteran Homelessness programme',
    url: 'https://covenantfund.org.uk/programme/reducing-veteran-homelessness-programme/',
    for_paul: 'Listed under the funder\'s own "Closed Programmes" heading; a news item further down the page about a past reopening is not current status. No next round given.' },

  // 135. Park. A specific future opening period, nothing pinned.
  { id: '2402fd26-f087-4265-a0c6-4170cebea981', re: /Resilience Fund/, pile: 'B', verdict: 'park',
    quote: 'please note interim reporting must be provided by mid March 2027 to ensure eligibility for next round of funding from June 2027',
    url: RESILIENCE,
    fields: { next_open_date: 'June 2027', next_open_date_parsed: '2027-06-01', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'please note interim reporting must be provided by mid March 2027 to ensure eligibility for next round of funding from June 2027', confidence: 'high', source_url: RESILIENCE } } },

  { id: '6ab7b061-bd05-4a44-a7c7-8f3ea331627e', re: /Richard and Siobh.n Coward Foundation/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://www.cowardphotography.org/',
    for_paul: 'apply_url 404s; the foundation\'s main site loads but no equivalent grants page could be located from it.' },

  { id: 'b5c373ef-b3a5-41ff-8a1f-8398f837642c', re: /Rosa . Stand With Us Fund/, pile: 'B', verdict: 'hold',
    quote: 'Applications to the Rosa\'s Stand With Us Fund Fund are currently closed.',
    url: 'https://rosauk.org/our-programmes/stand-with-us/',
    for_paul: 'Closed, no reopening date; every relevant field is admin-pinned.' },

  { id: '14469b5f-f30c-44cd-90f4-8414a4f41dff', re: /Rusholme Wind Farm Fund/, pile: 'B', verdict: 'hold',
    quote: 'Microgrants are currently closed and will be reopen towards the end of the summer.',
    url: 'https://tworidingscf.org.uk/fund/rusholme-wind-farm-fund/',
    for_paul: '"End of the summer" is not specific enough to park on and today (7 September) may already be past it; the standard/larger grant deadline (7 August) has passed with no next round named.' },

  { id: 'b6d72fd6-3fd3-4bc6-971e-624f9cd2f716', re: /Safer in Sussex Community Fund/, pile: 'B', verdict: 'hold',
    quote: 'Applications for the current round of Safer in Sussex Funding are closed.',
    url: 'https://www.sussex-pcc.gov.uk/get-involved/apply-for-funding/safer-in-sussex-community-fund/',
    for_paul: 'Closed, no reopening date given.' },

  { id: 'b4dd4488-867a-48c2-9853-1250c43865f6', re: /Schroder Charity Trust/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://schrodercharitytrust.org/',
    for_paul: 'apply_url is the homepage; no application status or dates could be found on it, and several fields are admin-sourced.' },

  { id: '482cfc54-f0a5-4529-8571-2614a9cd3dac', re: /Seed Funding for Social Entrepreneurs/, pile: 'B', verdict: 'hold',
    quote: 'November 2, 2026, 5 p.m.', url: 'https://www.shackletonfoundation.org/who-we-fund/#how-to-apply',
    for_paul: 'A genuine future deadline, 2 November 2026, but nearly every column is admin-held.' },

  // 142. Publish. The fund is always open, with two grant-size tiers each
  // reviewed roughly every six months; nothing here is admin-held.
  { id: '1ef69197-b551-4da9-860c-645c97acfb09', re: /Severn Trent Community Fund . New Project Funding/, pile: 'B', verdict: 'publish',
    quote: 'Our Community Fund is always open for applications and our Customer Panel who ultimately make the decision on which projects are funded, review applications for new projects every 6 months.',
    url: SEVERN,
    fields: { deadline: null, is_rolling: true },
    cits: { is_rolling: { snippet: 'Our Community Fund is always open for applications and our Customer Panel who ultimately make the decision on which projects are funded, review applications for new projects every 6 months.', confidence: 'high', source_url: SEVERN } },
    brief: {
      who_can_apply: 'Not-for-profit organisations with a legal structure appropriate to their size (a constitution or memorandum/articles of association including a dissolution clause or asset lock), whose project is located in the Severn Trent region — from the Bristol Channel to the Humber, and the West Midlands to the East Midlands — and benefits Severn Trent customers.',
      what_they_fund: 'Brand new projects with genuine community need, linked to People, Place and Environment, especially projects connected to water such as river access, grey water recycling or sustainable drainage. Both capital and revenue projects are considered, provided the project is sustained beyond the initial investment. Two grant sizes: £2,000 to £20,000, and £20,001 to £50,000.',
      how_to_apply: 'The fund is always open for applications; the Customer Panel reviews new-project applications for each grant size roughly every six months. Severn Trent must be the majority funder, covering over 50% of total project cost, and projects have up to 24 months to complete. One application per organisation per year.',
      exclusions: 'Severn Trent will not fund more than 50% of a project cost outside a discussed "standalone phase" arrangement; a full-time two-year salary is unlikely to be approved given the fund\'s size and regional spread. Projects outside the Severn Trent region, including the Hafren Dyfrdwy area, should apply via that area\'s separate community fund instead.',
      decision_timeline: 'For the £2,000-£20,000 tier, the next panel deadline after today is 28 February 2027 (outcome by May 2027); for £20,001-£50,000, the next is 31 January 2027 (outcome by April 2027).',
      typical_award: 'Two sizes: £2,000 to £20,000, and £20,001 to £50,000, with Severn Trent covering more than 50% of the total project cost.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'The proposed project must be located in the Severn Trent region and the community it is benefiting must be Severn Trent customers.', confidence: 'high', source_url: SEVERN },
      what_they_fund: { snippet: 'We\'ll consider both capital and revenue projects , as long as the project has plans to be sustained beyond our initial investment.', confidence: 'high', source_url: SEVERN },
      how_to_apply: { snippet: 'Severn Trent must be the majority funder of the project, so you\'ll need to be applying to us for over 50% of the total project cost.', confidence: 'high', source_url: SEVERN },
      exclusions: { snippet: 'If your project is located in the HafrenDyfrdwy region, please see hdcmyru.co.uk/communityfund for available funding.', confidence: 'high', source_url: SEVERN },
      decision_timeline: { snippet: 'Sunday 28 February 2027 ... Sunday 31 Janaury 2027', confidence: 'high', source_url: SEVERN },
      typical_award: { snippet: 'There are two sizes of grant that you can apply for in 2026: £2,000 to £20,000 ... £20,001 to £50,000', confidence: 'high', source_url: SEVERN },
      open_status: { snippet: 'Our Community Fund is always open for applications', confidence: 'high', source_url: SEVERN },
    } },

  // 143. Not a duplicate of a live row (the ordinary reject path), but a
  // near-identical near-duplicate of the row just published above — same
  // apply_url, same fund, no live counterpart yet for the dedup check to
  // catch. Held rather than guessed at.
  { id: 'f4225849-0663-4532-b73e-b8720dd67fb2', re: /Severn Trent Community Fund New Project Funding/, pile: 'B', verdict: 'hold',
    quote: '', url: SEVERN,
    for_paul: 'Same apply_url and near-identical title as the row just published in this batch (1ef69197). Likely a duplicate ingestion of the same fund rather than a second, distinct tier — recommend rejecting this one once the other is live, unless there is a reason to keep both.' },

  { id: 'b49ef70d-9aaa-43bc-b5fd-bd37abcd7049', re: /Sir Halley Stewart Trust/, pile: 'B', verdict: 'hold',
    quote: 'Next Application Closing Date 26th February 2027 or earlier once the meeting capacity is reached.',
    url: 'https://www.sirhalleystewart.org.uk/',
    for_paul: 'A genuine future deadline, 26 February 2027 (or earlier if capacity is reached), but nearly every column is admin-held.' },

  { id: 'b2d727c6-ffe5-4cbf-bcf8-91a22dd48db5', re: /Sir John Fisher Foundation/, pile: 'B', verdict: 'hold',
    quote: 'Not at present, these grants are on hold.', url: 'https://sirjohnfisherfoundation.org.uk/our-funding/',
    for_paul: 'The foundation\'s own words: grants are "on hold" for now, with new criteria released for 2026 but no application route open yet. Every relevant field is admin-pinned regardless.' },

  // 146. Park. A genuine future reopening date, nothing pinned.
  { id: '2d515d44-595b-421a-8d7d-90b2b32b50e8', re: /Skinners. Company Charity Programme/, pile: 'B', verdict: 'park',
    quote: 'This programme is currently closed and will reopen to new expressions of interest on 30 November.',
    url: SKINNERS,
    fields: { next_open_date: '30 November 2026', next_open_date_parsed: '2026-11-30', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'This programme is currently closed and will reopen to new expressions of interest on 30 November.', confidence: 'high', source_url: SKINNERS } } },

  // 147. Same shape as Large Grants for Charities (batch 5, same funder):
  // already reads rolling with no deadline, matching the page, but still
  // hidden.
  { id: 'd6c9730d-022b-4ad2-b57b-0e28e2131741', re: /Small Grants for Charities/, pile: 'B', verdict: 'hold',
    quote: '© 2026 Masonic Charitable Foundation', url: 'https://freemasonscharity.org.uk/get-support/grants-to-charities/',
    for_paul: 'The row\'s own rolling, no-deadline timing already matches the page — the same shape as Large Grants for Charities from the same funder in batch 5 — and nothing here explains why it is still hidden.' },

  { id: 'd360f51b-e3dc-4789-92bc-128092b83e5e', re: /Small Grants to Support People with Disabilities/, pile: 'B', verdict: 'hold',
    quote: '2026 application deadlines:', url: 'https://www.danmaskelltennistrust.org.uk/apply-for-a-grant/',
    for_paul: 'Every relevant field is admin-pinned; the page\'s 2026 deadline list did not yield a clear future date beyond what the row already holds.' },

  // 149. Reads as open now, but this is a fully-funded advice and support
  // programme rather than a grant, and it explicitly includes individuals
  // developing a new social enterprise idea, not only organisations.
  { id: '4fa14077-7904-4fd9-ba4f-d8ad7a501bff', re: /Social Enterprise Growth Accelerator/, pile: 'B', verdict: 'hold',
    quote: 'Applications are now open for the third iteration of the Social Enterprise Growth Accelerator. Sheffield-based social enterprises and people developing a new social enterprise idea can now apply for fully funded, specialist support.',
    url: 'https://www.ssen.org.uk/sega',
    for_paul: 'Reads as open now, but this is advisory and workshop support rather than money, and it is explicitly open to "people developing a new social enterprise idea" as well as existing organisations — an audience question. No deadline is stated either way, and deadline and next_open_date are admin-held.' },

  { id: '474dd39e-81f2-4613-bec3-2da7bcae6c11', re: /Social Justice Small Grants Programme/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://communityfoundationni.org/grants/social-justice-small-grants-programme/',
    for_paul: 'The specific page 404s; no equivalent could be found in Community Foundation NI\'s current grants listing.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
