// Verdicts — pile B, batch 1, rows 1-25. Three publish, two reject, twenty hold.
//
// Job 2 of the Sonnet brief (docs/handoffs/sonnet-2026-09-07.md): these rows
// were live once and are hidden now, mostly by an expired deadline. The
// question is narrow — has it reopened with a date or gone rolling, does it
// state a next date, or is it gone — but a publish still needs the full
// seven-field brief the main verdicts brief requires; nothing here skips that.
//
// Two pin-outlived holds this batch, both the same shape: the page says the
// fund has reopened with a specific closing date, but deadline and is_rolling
// are admin-pinned on the row, so a write would be refused. Reported rather
// than attempted, with both the row's pin and the page's sentence for Paul —
// Alec Dickson Trust (closes 4 Oct 2026) and Andrew Wainwright Reform Trust
// (closes 14 Sept 2026).
//
// Two dead_url rejects are both gov.uk's Find a Grant service returning a
// genuine "Page not found" — the grant has been removed from the listing
// once its round closed, which is "the fund the site no longer lists" in the
// brief's own words, not a scraping fluke.
//
// Several holds are pages that look reopened at a glance but turn out to be
// stale: BFI's "Challenge Call 6" deadline is the exact date already on the
// row; Brave Futures' "Applications Open!" cites the same July deadline the
// row already carries. Read past the headline before crediting either as new.
//
//   npx tsx --env-file=.env.local scripts/verdicts-b01-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 1

const BCBN = 'https://bcbn.org.uk/grant-initiative/'
const BLACKRIDGE = 'https://foundationscotland.org.uk/apply-for-funding/funding-available/blackridge'
const BELLA = 'https://bellahoustonbequestfund.org.uk/grant-application/'

const ROWS: Row[] = [
  // 1. Annual programme; no 2027 window announced yet.
  { id: '81a25490-24a7-451d-95f8-2f2e00f973ae', re: /2026 Grant Applications/, pile: 'B', verdict: 'hold',
    quote: 'Grant applications for 2026 are now closed. The closing date for application submissions was Friday 31st July.',
    url: 'https://www.iyf.org.uk/2026grants/',
    for_paul: 'Runs every year but no 2027 dates are up yet ("Every year we invite applications from welfare organisations..."). Nothing to park until a date appears.' },

  // 2. A clean park: a stated reopening season.
  { id: 'b4684d67-9022-4707-9dd6-516d280d3860', re: /2026 Grant Programme/, pile: 'B', verdict: 'park',
    quote: 'Our next grant window will be the Summer of 2027.',
    url: 'https://www.hugoburgefoundation.org/grants',
    fields: { next_open_date: 'Summer 2027', next_open_date_parsed: '2027-06-01', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'Our next grant window will be the Summer of 2027.', confidence: 'high', source_url: 'https://www.hugoburgefoundation.org/grants' } } },

  // 3. No fixed cycle at all.
  { id: '32856768-7d40-446f-a45f-ab905ede96cb', re: /Access to Justice Foundation/, pile: 'B', verdict: 'hold',
    quote: 'We don\'t run regular grant rounds that open at the same time each year. We launch funding opportunities as soon as we\'ve raised enough money to do this.',
    url: 'https://atjf.org.uk/grants/apply-for-a-grant',
    for_paul: 'The named Legal Support Grant 2026-2029 round is closed (outcome due September 2026); the funder is explicit it has no regular cycle, so there is no date to park on.' },

  // 4. A one-off cohort challenge; no statement either way about repeating.
  { id: 'd6f36313-3238-4cc4-a5ea-cb59a5875132', re: /AI and Social Mobility Challenge Prize/, pile: 'B', verdict: 'hold',
    quote: 'Applications are now closed. We will contact all applicants with an update during July and August 2026.',
    url: 'https://www.socialtechtrust.org/ai-and-social-mobility-challenge-prize',
    for_paul: 'A single cohort culminating at a Parliament event in October 2026; the page gives no indication whether this repeats. Historic or hold is a judgement call.' },

  // 5. Pin outlived: the page has moved on, the row has not, and it cannot.
  { id: 'b1a9dbcd-dce0-45d7-bcd9-9dcaa6a55023', re: /Alec Dickson Trust/, pile: 'B', verdict: 'hold',
    quote: 'The Alec Dickson Trust application window is now open and closes on 4th October 2026 at 5pm.',
    url: 'https://www.alecdicksontrust.org.uk/',
    for_paul: 'Reopened with a date the row cannot take: deadline and is_rolling are both admin-pinned. Page says open now, closing 4 October 2026 — move the pin and this becomes a publish.' },

  // 6. Heavily pinned (almost every column) and an audience question on top:
  // "aged 18-26" reads as an individual applicant, not an organisation.
  { id: '75040abd-4796-479d-ba18-2f3596a3e7a8', re: /All About Business Entrepreneurs Fund/, pile: 'B', verdict: 'hold',
    quote: 'Applicants must be aged 18–26 at point of application, a UK resident with the right to work in the UK, running an existing business that has been trading for a minimum of 6 months.',
    url: 'https://www.reed.com/entrepreneurs',
    for_paul: 'Two separate questions: nearly every column (title, deadline, is_rolling, apply_url, amounts, structures) is admin-pinned, so little here could be updated even if wanted; and the eligibility reads as an individual founder scheme rather than an organisation applying, which the audience test in the programmes brief would need settling first.' },

  // 7. Deadlines shown may be a stale round, not a live one.
  { id: 'dc33bc71-60d1-4b7a-a88f-67fa9490852d', re: /Amazon Sustainability Accelerator/, pile: 'B', verdict: 'hold',
    quote: 'Application Deadlines Consumer Product: 26th April 2026 Climate Tech: 10th July 2026',
    url: 'https://sell.amazon.co.uk/programmes/sustainability-accelerator',
    for_paul: 'Both listed deadlines have passed, yet "Apply Now" and "Register your interest" buttons remain live next to "Our programmes for 2026" — unclear whether this is a genuinely open evergreen page or one that has not been updated for a new round.' },

  // 8. Same pin-outlived shape as Alec Dickson.
  { id: '9f87e023-012b-4b82-9b36-629d76fd816e', re: /Andrew Wainwright Reform Trust/, pile: 'B', verdict: 'hold',
    quote: 'Important notice: applications for the current funding round are now open and will close on 14 September 2026. Trustees will meet to allocate grants in November 2026.',
    url: 'https://www.wainwrighttrusts.org.uk/awrt.html',
    for_paul: 'Reopened with a date (closes 14 September 2026) but deadline and is_rolling are admin-pinned. Move the pin and this becomes a publish.' },

  // 9. The page's own deadlines (Dec 2025, Feb 2026) are all in the past;
  // nothing suggests a new round has been announced.
  { id: '610f11c7-ba38-431b-ace0-a2613cdc0265', re: /Anglian Water Thriving Communities/, pile: 'B', verdict: 'hold',
    quote: 'Applications of £10,000 – £50,000 can complete an application form using the link below. Deadline: 11:59am on 1 February 2026',
    url: 'https://www.ncf.uk.com/grants/grants-available/anglian-water-thriving-communities',
    for_paul: 'Both deadlines on the page (8 December 2025, 1 February 2026) are stale; nothing indicates a new round for the fund\'s remaining four years of committed funding.' },

  // 10. Closed, no reopening date given.
  { id: '321ed3d9-0619-4a5b-9a39-cae978857a03', re: /Argyll & Bute Council/, pile: 'B', verdict: 'hold',
    quote: 'The Supporting Communities Fund 2026 / 27 is now CLOSED. Thank You for your interest.',
    url: 'https://www.argyll-bute.gov.uk/my-community/communities-and-partnerships/supporting-communities-fund',
    for_paul: 'Named as a 2026/27 fund, closed, with no reopening date stated.' },

  // 11. Closed; outcome due late August 2026, no next round given.
  { id: 'd5bd53ee-b341-46b0-8ef1-bf24e2cc735d', re: /Autotrader Digital Inclusion Fund/, pile: 'B', verdict: 'hold',
    quote: 'The latest round of the Autotrader Digital Inclusion Fund, in partnership with Forever Manchester, is NOW CLOSED to applications.',
    url: 'https://forevermanchester.com/fund/autotrader-community-fund/',
    for_paul: 'Closed with an outcome date (late August 2026) but no reopening date.' },

  // 12. gov.uk's Find a Grant genuinely returns Page not found, not a network
  // hiccup — the listing has been removed now the round is closed.
  { id: '42bf79de-416b-455e-822d-2c6478a31ec5', re: /Barnsley AI Upskilling Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/barnsley-ai-upskilling-fund-1',
    for_paul: 'gov.uk\'s Find a Grant service has removed this listing now the round is closed; the site no longer lists it.' },

  // 13. Publish: effectively rolling, quarterly trustee meetings, no fixed
  // deadline stated anywhere on the site.
  { id: 'dff42471-e15e-4c23-930e-0adfe6f44aec', re: /Bellahouston Bequest Fund/, pile: 'B', verdict: 'publish',
    quote: 'Applications received will normally be considered by the trustees at the next quarterly meeting and applicants will be informed thereafter whether or not a grant has been awarded.',
    url: BELLA,
    fields: { deadline: null, is_rolling: true },
    cits: {
      is_rolling: { snippet: 'Applications received will normally be considered by the trustees at the next quarterly meeting and applicants will be informed thereafter whether or not a grant has been awarded.', confidence: 'high', source_url: BELLA },
    },
    brief: {
      who_can_apply: 'Small charities and organisations based, primarily, in the Greater Glasgow area, within five miles of the Glasgow Parliamentary boundaries.',
      what_they_fund: 'Relief of poverty or disease, education (including religious education), safeguarding places of historical and artistic significance, and the protection and renewal of Protestant Evangelical church buildings and other places of religious worship. The Trustees may also fund scholarships and bursaries connected with the University of Glasgow, and other educational institutions, professorships or masterships in scientific and technical instruction within Greater Glasgow.',
      how_to_apply: 'Complete the Grant Application Form and email or post it to the fund\'s administrator, Mitchells Roberton. Applications are normally considered by the trustees at their next quarterly meeting.',
      exclusions: 'The page states no exclusions beyond its five charitable purposes and its Greater Glasgow, five-mile focus.',
      decision_timeline: 'Applications are normally considered at the trustees\' next quarterly meeting, and applicants are informed thereafter whether a grant has been awarded.',
      typical_award: 'The page states no minimum or maximum award amount.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'The Bellahouston Bequest Fund is a Scottish Charity, the principal focus of which is to assist small charities and organisations based, primarily, in the Greater Glasgow area.', confidence: 'high', source_url: 'https://bellahoustonbequestfund.org.uk/' },
      what_they_fund: { snippet: 'aid with the relief of poverty or disease, promote education (including religious education), safe-guard places of historical and artistic significance, protect and renew church buildings of Protestant Evangelical denominations and other places of religious worship.', confidence: 'high', source_url: 'https://bellahoustonbequestfund.org.uk/' },
      how_to_apply: { snippet: 'Please submit Grant Application Forms by email. Applicants can either complete the form electronically and email it to bellahouston@mitchells-roberton.co.uk or print it off and mail it to the address on the contact page.', confidence: 'high', source_url: BELLA },
      exclusions: { snippet: 'The fund is restricted to making donations to recipients within five miles of the Glasgow Parliamentary boundaries.', confidence: 'high', source_url: 'https://bellahoustonbequestfund.org.uk/history/' },
      decision_timeline: { snippet: 'Applications received will normally be considered by the trustees at the next quarterly meeting and applicants will be informed thereafter whether or not a grant has been awarded.', confidence: 'high', source_url: BELLA },
      typical_award: { snippet: 'Please submit Grant Application Forms by email.', confidence: 'low', source_url: BELLA },
      open_status: { snippet: 'Applications received will normally be considered by the trustees at the next quarterly meeting.', confidence: 'high', source_url: BELLA },
    } },

  // 14. A generic front door over several concurrently-open rounds with
  // different windows through the year — no single date describes it.
  { id: '64b1d9e1-5e5a-440c-9986-d2acf6ec1602', re: /Berkshire Community Foundation Grants/, pile: 'B', verdict: 'hold',
    quote: 'Our Surviving Winter Funding Round will be open for applications from 28th September until 29th October.',
    url: 'https://www.berkshirecf.org/available-funding/',
    for_paul: 'A front door over several rounds through the year (Surviving Winter opens 28 September, Grassroots opens January 2027), not one fund with one date. Needs relinking to a named round rather than a single park date.' },

  // 15. Same gov.uk removal as row 12.
  { id: '97949835-da9c-4100-8c98-55cf3e3d865d', re: /Better Commissioning Pathways/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/better-commissioning-pathways-1',
    for_paul: 'gov.uk\'s Find a Grant service has removed this listing now the round is closed.' },

  // 16. Publish: Term 3 is the next concrete deadline on the page.
  { id: '27c436ad-babd-45f4-9214-4de4000d234f', re: /Better Community Business Network/, pile: 'B', verdict: 'publish',
    quote: 'Please note that BCBN Grant Initiative 2026 will conclude on 9 November 2026, and no further applications will be accepted beyond this date.',
    url: BCBN,
    fields: { deadline: '2026-11-09', is_rolling: false },
    cits: { deadline: { snippet: 'Term 3 Application Deadline: 9 November 2026', confidence: 'high', source_url: BCBN } },
    brief: {
      who_can_apply: 'Non-profit organisations, charities and community groups, including local branches of national charities, that work for the betterment of local communities. Organisations must be registered with a recognised governing body (such as the Charity Commission or Companies House) for a minimum of 18 months, with annual accounts available. Projects must be UK based, excluding Northern Ireland.',
      what_they_fund: 'One-off grants of up to £3,000 to a charity or small but credible community project that can demonstrate a positive impact on the communities it serves. BCBN distributes up to £36,000 annually across grassroots charities and community initiatives.',
      how_to_apply: 'Take the eligibility quiz on the fund\'s page, then submit the online application form. Applications are reviewed within three grant terms across the year; Term 3 closes 9 November 2026, after which BCBN accepts no further applications for 2026.',
      exclusions: 'Overseas activities, party political activity, sponsorship of individuals, travel and accommodation costs, retrospective funding, requests over £3,000, part-funded projects where other funders are not disclosed, core or running costs (ongoing venue hire, staff costs and salaries, bills, printing), professional training, organisations without charitable aims, and endowments, loans, deficits or general appeals.',
      decision_timeline: 'Term 3 of 2026 closes 9 November 2026, with finalists awarded by 30 November 2026.',
      typical_award: 'Up to £3,000 per project, from an annual pot of up to £36,000.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'Grant applications are open to non-profit organisations, charities, and community groups (including local branches of national charities) that work for the betterment of local communities through charitable initiatives. To be eligible, all organisations and community interest groups must be registered with a recognised governing body (such as the Charity Commission or Companies House) for a minimum of 18 months', confidence: 'high', source_url: BCBN },
      what_they_fund: { snippet: 'This initiative will distribute a one-off grant award of up to £3,000 per charity or to small but credible community projects, which are able to demonstrate their positive impact on the communities they aim to serve.', confidence: 'high', source_url: BCBN },
      how_to_apply: { snippet: 'You must take the eligibility quiz below prior to submitting an application. Then please apply by clicking the button below: Online Application Form', confidence: 'high', source_url: BCBN },
      exclusions: { snippet: 'Core/ Running costs and expenses (on-going venue hire, staff cost and salary, bills, printing)', confidence: 'high', source_url: BCBN },
      decision_timeline: { snippet: 'Term 3 Application Deadline: 9 November 2026 Finalists Awarded: 30 November 2026', confidence: 'high', source_url: BCBN },
      typical_award: { snippet: 'Each project may be awarded up to £3,000, with BCBN distributing up to £36,000 annually to support grassroots charities and community initiatives across the UK.', confidence: 'high', source_url: BCBN },
      open_status: { snippet: 'Term 2 applications are NOW LIVE', confidence: 'med', source_url: BCBN },
    } },

  // 17. Stale: the deadline it names is exactly the row's own stored (now
  // past) deadline, with no year given and no next call announced.
  { id: '41d96aaf-6752-4fb3-98ab-a045ae22fdb5', re: /BFI National Lottery Innovation Challenge Fund/, pile: 'B', verdict: 'hold',
    quote: 'The deadline for applications is midnight on Thursday 9 April. Awards are expected to be made in August 2026.',
    url: 'https://www.bfi.org.uk/get-funding-support/bfi-national-lottery-innovation-challenge-fund',
    for_paul: 'Challenge Call 6\'s page still shows the row\'s existing 9 April deadline and an August 2026 award date, both already past — looks unrefreshed rather than newly reopened.' },

  { id: 'fb7d23b2-8848-4ace-becc-b28766bc9a7d', re: /Big Give/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://biggive.org/women-girls-match-fund/',
    for_paul: 'HTTP 403, unreadable today.' },

  // 19. Publish: a fresh, specific deadline that supersedes the row's own
  // "rolling" reading, and nothing here is admin-held.
  { id: '4ecd6375-b06c-47af-b249-d1f1080f99f4', re: /Blackridge Community Fund/, pile: 'B', verdict: 'publish',
    quote: 'Application deadline (For decisions late Nov 2026): 25/09/26',
    url: BLACKRIDGE,
    fields: { deadline: '2026-09-25', is_rolling: false },
    cits: { deadline: { snippet: 'Application deadline (For decisions late Nov 2026): 25/09/26', confidence: 'high', source_url: BLACKRIDGE } },
    brief: {
      who_can_apply: 'Groups and organisations working to benefit people in Blackridge, whether formally constituted or informal. You do not need to be a registered charity, but the group must meet Foundation Scotland\'s standard eligibility criteria, usually including a Safeguarding Policy. Groups based outside Blackridge are considered case by case if they show clear benefit to Blackridge residents and evidence of local consultation.',
      what_they_fund: 'Community projects benefiting the Blackridge community council area in West Lothian, including equipment, staff or sessional workers, consultations, running costs for local groups, and maintenance or refurbishment of community facilities. Recurring costs over up to three years can also be requested.',
      how_to_apply: 'Complete the online standard grant application form (up to £5,000, one year) or the large grant form (over £5,000 or multi-year). The next deadline is 25 September 2026, with decisions expected late November 2026; contact Foundation Scotland first if requesting more than the typical maximum.',
      exclusions: 'Anti-wind farm or anti-renewable energy activities, and anything contrary to the interests of the fund\'s contributing companies (Gresham House, Netro Energy, EDF Power Solutions) or Foundation Scotland. Grants under £500 are not currently available.',
      decision_timeline: 'The next application deadline is 25 September 2026, with decisions expected late November 2026. A community panel typically meets three to four times a year.',
      typical_award: 'Typically £500 to £5,000; recurring costs over up to three years can go up to £10,000, and larger amounts may be considered case by case with evidence of community support.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'Groups and organisations working to benefit people in Blackridge can apply. You don\'t need to be a registered charity to apply, but your group/organisation must meet our standard eligibility criteria.', confidence: 'high', source_url: BLACKRIDGE },
      what_they_fund: { snippet: 'Grants may support a wide range of costs, such as equipment, staff or sessional workers, consultations, running costs for local groups, maintenance or refurbishment of community facilities, and so on.', confidence: 'high', source_url: BLACKRIDGE },
      how_to_apply: { snippet: 'Please complete the online application form. Completed applications and supporting documents must be received by the application deadline.', confidence: 'high', source_url: BLACKRIDGE },
      exclusions: { snippet: 'Anti-wind farm or anti-renewable energy activities, including activities contrary to the interests of the companies contributing to the fund', confidence: 'high', source_url: BLACKRIDGE },
      decision_timeline: { snippet: 'Application deadline (For decisions late Nov 2026): 25/09/26', confidence: 'high', source_url: BLACKRIDGE },
      typical_award: { snippet: 'Grant size typically available: £500 - £5,000', confidence: 'high', source_url: BLACKRIDGE },
      open_status: { snippet: 'Application deadline (For decisions late Nov 2026): 25/09/26', confidence: 'high', source_url: BLACKRIDGE },
    } },

  // 20. Closed, outcome expected but no next round.
  { id: '5e097507-c0dc-4439-86fd-b54483c82494', re: /Borough Council of King's Lynn/, pile: 'B', verdict: 'hold',
    quote: 'Funding decisions are expected to be announced by early November 2026.',
    url: 'https://www.norfolkfoundation.com/funding-support/grants/groups/borough-council-of-kings-lynn-west-norfolk-small-grants-scheme/',
    for_paul: 'Closed, outcome due early November 2026, no next round date given.' },

  // 21. Stale: names the same July deadline already on the row.
  { id: '0c9aa487-7fe1-459a-802b-89447b3cc3a1', re: /Brave Futures/, pile: 'B', verdict: 'hold',
    quote: 'We are now recruiting for its next cohort of organisations to take part in the Brave Futures programme.',
    url: 'https://artsfundraising.org.uk/programmes/brave-futures/',
    for_paul: '"Applications Open! Apply by Monday 13th July" is the same July deadline already on the row — the page has not been refreshed since it passed.' },

  // 22. The apply_url is dead, but the fund itself is alive and rolling at a
  // different address on the same company's site.
  { id: 'ef36f740-2f40-40e6-a561-8aa4c72a8a97', re: /Brewers Foundation/, pile: 'B', verdict: 'hold',
    quote: 'The Brewers Foundation is at the heart of Brewers. We want to make the world a brighter place by providing support to communities, organisations and charities up and down the country through sponsorship and donations of paint to transform vital spaces.',
    url: 'https://www.brewers.co.uk/about/community',
    for_paul: 'apply_url (info.brewers.co.uk) 404s, but the Foundation is live and rolling at brewers.co.uk/about/community, offering "your share of this year\'s £50,000 pot" with no deadline. A relink, not a dead fund — the row\'s own is_rolling was already true.' },

  // 23. Closed, no next date.
  { id: 'cdd31f5e-4fc4-4f98-be98-c452cf0c253f', re: /Brighton & Hove Buses/, pile: 'B', verdict: 'hold',
    quote: 'Please note: applications for the Community Support Fund are now closed.',
    url: 'https://www.buses.co.uk/community-support-fund',
    for_paul: 'Closed for the year, no reopening date on the page.' },

  // 24. Process under review, no date given.
  { id: 'd7afb72d-ddf5-4ec5-a733-2ac876dd3837', re: /Calisen Impact Charitable Trust/, pile: 'B', verdict: 'hold',
    quote: 'We are making changes to our Grant Application process. Due to the substantial number of applications received relative to the level of funding available, we are unfortunately required to decline a greater proportion of submissions than we would otherwise wish. Updated details will be published in due course.',
    url: 'https://www.calisenimpactcharitabletrust.com/about-funding',
    for_paul: 'The trust says it is changing its process and will publish updated details "in due course" — no date to park on yet.' },

  // 25. "TBC" is not a date to schedule against.
  { id: '014db2eb-c6b5-4575-9e03-ac51822820f4', re: /Cambridge 2030 Fund/, pile: 'B', verdict: 'hold',
    quote: 'Applications to re-open in 2027 TBC',
    url: 'https://www.cambscf.org.uk/funds/cambridge2030/',
    for_paul: 'Names 2027 but marks the date TBC — too vague to park on; worth a re-check nearer the time.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
