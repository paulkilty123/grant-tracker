// Timing on 187 live rows — batch 8 (rows 141-160). Eight written, twelve reported.
//
// Two rows in this batch are the same fund. #118 "Newcastle Culture Investment
// Fund" and #154 "Supporting Newcastle based organisations to engage residents
// in culture" have different apply_urls that resolve to the same Community
// Foundation North East page — #118's redirects to #154's. Both are written the
// same way because both are live rows and a fundraiser landing on either should
// see the same answer, but they are almost certainly one catalogue entry and
// are flagged in the results for the dedup job rather than fixed here.
//
// Sussex Community Foundation now has three rows in this catalogue riding the
// same Main grants round — Lewes (set 5 September), Rye (batch 7) and Brighton
// and Hove Legacy (here). All three now read 11 September, which is the useful
// property: named funds that defer to a parent round should agree, and if one
// ever disagrees that is a signal rather than noise.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-08-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 8

const SCF_MAIN = 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/'
const NCIF = 'https://www.communityfoundation.org.uk/grants/supporting-newcastle-based-organisations-to-engage-residents-in-culture/'

const ROWS: Row[] = [
  // 146. Mixed and stated on both sides: small grants rolling with no cut-off,
  // main grants to quarterly committee deadlines (20 Jan, 7 Apr, 7 Jul, 15 Sep,
  // 8 Dec in 2026). Those dates are Tuesdays and move year to year, so no
  // cycle; the rolling half is what an applicant can act on today.
  { id: 'f999cba2-95c7-4c48-940a-611ecd0e6514', re: /South Lanarkshire Renewable Energy Fund/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: 'https://www.southlanarkshire.gov.uk/info/200321/community_grants_and_funding/744/renewable_energy_fund_grants/4', label: 'Grant scale and application deadlines, read 2026-09-06' }],
    cits: { is_rolling: { snippet: 'Small grants are assessed on a rolling basis and you can apply at any time.', confidence: 'high',
      source_url: 'https://www.southlanarkshire.gov.uk/info/200321/community_grants_and_funding/744/renewable_energy_fund_grants/4' } } },

  // 150. Six closing dates a year, roughly every two months, published two at a
  // time. The next is 7 September, printed as a bare paragraph under a "Next
  // application deadlines" heading, hence med on the snippet alone.
  { id: '32949533-a7ae-4c48-a7a6-57368e083dee', re: /Strategic Legal Fund/,
    fields: { deadline: '2026-09-07', is_rolling: false },
    cits: { deadline: { snippet: '7 September 2026', confidence: 'med',
      source_url: 'https://strategiclegalfund.org.uk/how-to-apply/' } } },

  // 153. A funder-level row that IS writable, for the same reason as Community
  // Foundation North East in batch 3: the foundation keeps a route open when no
  // named fund fits. Everything else on the page is per-fund and dated.
  { id: '5c396ce2-92b2-40c2-96d0-2c334009acbf', re: /Suffolk Community Foundation/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'which is accessible year‑round', confidence: 'high',
      source_url: 'https://suffolkcf.org.uk/current-grants/' } } },

  // 154. See the header note: same page as row 118.
  { id: 'cf23c001-d792-4938-93bb-5fd2b99286f5', re: /Newcastle based organisations/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Rolling grant fund', confidence: 'high', source_url: NCIF } } },

  // 155. Third Sussex fund on the September Main grants round.
  { id: 'c2cbe217-c515-4c4b-b7ad-e719621c598f', re: /Brighton and Hove Legacy Fund/,
    fields: { deadline: '2026-09-11', is_rolling: false },
    sources: [{ url: SCF_MAIN, label: 'Main grants page (round dates), read 2026-09-06' }],
    cits: { deadline: { snippet: 'Applications are open. The deadline is Friday 11 September', confidence: 'high', source_url: SCF_MAIN } } },

  // 158, 159. Both say it in the same words on their own pages. Note for a
  // different job: both are for individuals aged 18-30 starting a business, and
  // the audience rule would put them out of scope. That is not a timing
  // question, so the timing is written and the scope is flagged.
  { id: '5fcfa9df-c3f9-41c0-8701-417b90dece8e', re: /SWEF Enterprise Fund Business Grant/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Applications are open year-round and will be considered periodically throughout the year.', confidence: 'high',
      source_url: 'https://communityfoundationni.org/grants/swef-enterprise-fund-business-grant/' } } },
  { id: '168943e0-ffa2-4200-a811-a1a2630b2436', re: /SWEF Enterprise Fund Start-Up Grant/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Applications are open year-round and will be considered periodically throughout the year.', confidence: 'high',
      source_url: 'https://communityfoundationni.org/grants/swef-enterprise-fund-start-up-grant/' } } },

  // 160. Closed and says when it reopens, in one sentence.
  { id: '573f008c-93bf-4ab6-a347-4fd0aeab62ea', re: /Waddilove/,
    fields: { is_rolling: false, deadline: null, next_open_date: 'October 2026' },
    cits: { next_open_date: { snippet: 'The next application round will open in October 2026.', confidence: 'high',
      source_url: 'https://pwwsolicitors.co.uk/charity-grants/waddilove-foundation-uk/' } } },
]

const REPORT: Report[] = [
  { id: 'dd88b889-6926-42e8-9e8f-954b3b9e5af4', title: 'Sigrid Rausing Trust — Grants', why: 'invite_only',
    quote: 'Please note that we do not accept unsolicited applications.',
    url: 'https://www.sigrid-rausing-trust.org/', note: '' },
  { id: 'b5814b20-cfd4-46db-a8dd-3e623ed1c9fd', title: 'Sir Jules Thorn Charitable Trust — General Grants', why: 'index_over_programmes',
    quote: 'Programmes: Medical Research, The Sir Jules Thorn Award for Biomedical Research, The Research Infrastructure Fund, Scaling Impact in Health and Care Fund, Funding for Hospices, Ann Rylands Small Donations',
    url: 'https://julesthorntrust.org.uk/',
    note: 'The row is "General Grants" but the trust runs six named programmes with their own pages and no general route. The home page states no date for any of them.' },
  { id: 'ce83058b-740b-479c-9848-b97e9e2ef383', title: 'Smallwood Trust', why: 'not_stated',
    quote: 'Our Strategic Plan 2022-2024',
    url: 'https://www.smallwoodtrust.org.uk/grants-for-policy-system-change/',
    note: 'apply_url /grants/ redirects to a policy and systems change page whose most recent content is from 2021 and whose newest date is a strategic plan ending in 2024. No application route or window on it.' },
  { id: 'e48bb644-14c4-4785-8825-47babba04a2b', title: 'Social Investment Programme', why: 'not_stated',
    quote: 'We hold four investment rounds each year, and bring forward a maximum of four full applications per round.',
    url: 'https://www.postcodeinnovationtrust.org.uk/social-investment',
    note: 'A six-step process described in detail, with an EOI as the entry point and four rounds a year, and not one date. "We welcome draft submissions ahead of the deadline" refers to a deadline the page never gives.' },
  { id: '05fcaae0-a3d3-43b7-87b8-69d951b45c24', title: 'Somerset Community Foundation Grants', why: 'index_over_programmes',
    quote: 'We run a variety of funding programmes that support around 400 local groups every year.',
    url: 'https://www.somersetcf.org.uk/grants-and-funding/grants-and-funding-for-groups/',
    note: 'The richest index page in the job: every fund carries its own state, including four different reopening answers (N/A, TBC, Autumn 2026, Early 2027, April 2027, September 2026, Monday 7 September 2026). None of them belongs to this funder-level row, and unlike Suffolk and the North East there is no general year-round route.' },
  { id: '8ce6d37f-0c85-44aa-a8ff-faa71ed8ab2e', title: 'South Yorkshire\'s Community Foundation — Grants', why: 'index_over_programmes',
    quote: 'Please note that we are transitioning to a new system so the online process may be different on each programme, depending on whether it is accessed via our old or new system.',
    url: 'https://www.sycf.org.uk/apply/search-our-grants',
    note: 'A grant search page over the foundation\'s programmes, each with its own dates.' },
  { id: 'f1c42af9-3659-4b39-8fb5-4c00a8f5ce7e', title: 'Southwark Council — Neighbourhood Grants', why: 'not_stated',
    quote: 'For more information on Southwark Council grant funding including opening/closing dates, please click here.',
    url: 'https://southwarkgrants.benefactorcloud.co.uk/Home/Programmes',
    note: 'apply_url is the council\'s BenefactorCloud portal, which points elsewhere for its own opening and closing dates and gives none itself.' },
  { id: '6d512c2b-f3b9-43d2-9b9d-83399dc49d0c', title: 'SSE Match Trading Grant', why: 'not_stated',
    quote: 'So far, we have offered Match Trading grants to grantees over a period of one year. They can draw down the grant on a quarterly basis, matched against increases in their income from trading compared with the baseline year.',
    url: 'https://www.matchtrading.com/',
    note: 'A page about the Match Trading model and the task force behind it rather than an open grant. The quarterly cadence described is drawdown, not application.' },
  { id: '853a4569-c998-4f24-8450-5830a891efc6', title: 'Stronger Communities Fund', why: 'not_stated',
    quote: 'We\'re always looking for new causes and groups to support in projects that fit the themes of our Stronger Communities Fund.',
    url: 'https://www.welovemcrcharity.org/apply-for-funding',
    note: 'The closest call in this batch. "Always looking" is about appetite rather than about when applications are taken, and no window, round or deadline appears anywhere on the page.' },
  { id: '33e3bb3f-4d36-4ee6-8984-b3e3befa62e5', title: 'Suffolk Carers Fund', why: 'closed_no_date',
    quote: 'Deadlines: 21 August 2026 with decisions expected by the end of October 2026. Apply online (now closed)',
    url: 'https://suffolkcf.org.uk/grants/suffolk-carers-fund/',
    note: 'The round closed on 21 August and the apply link is marked closed. No next round dated. Suffolk\'s year-round Central Fund route, which is written on the foundation-level row, is a different fund and does not make this one open.' },
  { id: '24a624c6-27a3-413f-baa7-742d1cb02c60', title: 'Sussex Crisis Fund — Sussex Community Foundation', why: 'index_over_programmes',
    quote: 'Find out our current grants open for applications and how to apply for funding from Sussex Community Foundation.',
    url: 'https://sussexcommunityfoundation.org/grants/',
    note: 'apply_url is the foundation\'s grants index, not the Crisis Fund. Nothing on the index names a Crisis Fund at all, so unlike the three Sussex funds that defer to the Main grants round there is no parent date to inherit. Worth a relink or a look at whether the fund still exists.' },
  { id: 'e38ac17b-5035-44b4-bfcc-faf1090d13c7', title: 'SWEF Enterprise Fund', why: 'not_stated',
    quote: 'We distribute grants to voluntary and community sector organisations across the East End.',
    url: 'https://eastendcf.org/grants/',
    note: 'apply_url points at East End Community Foundation, which does not run a SWEF Enterprise Fund — the fund belongs to Community Foundation Northern Ireland, whose two SWEF rows are written in this same batch. The word SWEF does not appear anywhere on the East End page. This is a wrong link rather than a silent funder, and it should be relinked before it is timed.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
