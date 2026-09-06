// Timing on 187 live rows — batch 3 (rows 41-60).
//
// Seven written, thirteen reported, and this batch is where the shape of the
// remaining work becomes clear: six of the thirteen are funder-level pages
// covering several programmes on separate timetables (Comic Relief, Coalfields,
// Community Foundation Wales, Cumbria, Clore, and Devon which is invitation-only
// on top). They are marked `index_over_programmes` at the orchestrating
// session's request rather than `not_stated`, because "this page cannot have
// one date" is a different problem from "this fund does not say".
//
// The two Community Foundations that ARE written are written because the
// foundation itself makes a statement at foundation level, not because a fund
// inside them does:
//   North East  "you can do so at any time of year" — a general application
//               route that is open when no call matches.
//   Northern    one open grant for organisations, closing 17 September. The
//   Ireland     two other open grants on that page are "Ongoing - No Deadline"
//               and both are for individuals aged 18-30 with a business, so
//               neither can carry this row's rolling flag.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-03-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 3

const ROWS: Row[] = [
  // 44. Three rounds published as open/close/decision triples. The round that
  // opened 20 August closes 1 October. The dates move year to year, so no cycle.
  { id: 'c32ecdba-2fab-4131-a430-69bf1e6a1cae', re: /Community and Environment Grants/,
    fields: { deadline: '2026-10-01', is_rolling: false },
    sources: [{ url: 'https://www.veoliatrust.org/when-to-apply/', label: 'When to apply (round open and closing dates), read 2026-09-06' }],
    cits: { deadline: { snippet: '01 October 2026', confidence: 'high',
      source_url: 'https://www.veoliatrust.org/when-to-apply/' } } },

  // 45. Between rounds. The page's own status line is the reopening date; the
  // field holds the clause and the citation holds the line it came from.
  { id: '056ad3b9-2bb0-4d09-be11-672e6c6c23e5', re: /Community Capacity Fund/,
    fields: { is_rolling: false, deadline: null, next_open_date: 'Coming autumn 2026' },
    cits: { next_open_date: { snippet: 'Closing date: Coming autumn 2026', confidence: 'high',
      source_url: 'https://oxfordshire.org/ocf_grants/community-capacity-2/' } } },

  // 47. See the header note on why the two "Ongoing - No Deadline" grants on
  // this page cannot make the row rolling.
  { id: '12269ada-77e7-4e89-9db0-0d95414bb483', re: /Community Foundation for Northern Ireland/,
    fields: { deadline: '2026-09-17', is_rolling: false },
    cits: { deadline: { snippet: 'Closing Date: Sep 17, 2026 13:00', confidence: 'high',
      source_url: 'https://communityfoundationni.org/achieving-impact/available-grants/' } } },

  // 48. Individual calls come and go; the general application route does not.
  { id: 'f375d0d1-f7e5-4393-a078-8b3ab3cec3b4', re: /Community Foundation North East/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'As long as your organisation is in Tyne and Wear or Northumberland, you can do so at any time of year.', confidence: 'high',
      source_url: 'https://www.communityfoundation.org.uk/apply/' } } },

  // 51. Quarterly decisions with no cut-off — the brief's own example of the
  // rolling state. Contrast the Hampton Fund below, which also meets quarterly
  // but says submission deadlines exist and will not publish them.
  { id: 'a8a34a8e-4570-4fbd-9260-cbbcc8926637', re: /Community Grants/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Grant decisions are taken on a quarterly basis by the fifteen Trustees', confidence: 'high',
      source_url: 'https://thetrustenfield.org.uk/grants/' } } },

  // 54. Opened June 2026 and says so in the same breath as saying it is rolling.
  { id: '08bdec62-f80f-43dd-ad82-43f80787494c', re: /Corra Foundation/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'It is a rolling fund, so there is no fixed closing date.', confidence: 'high',
      source_url: 'https://www.corra.scot/grants/alcohol-and-drugs-fund-local-support-fund-micro-grants/' } } },

  // 56. apply_url is Creative Scotland's funding index, which lists a dozen
  // programmes with dates. The Open Fund's own page says it has none.
  { id: 'bfdbf2a8-09b7-4df5-a994-4361ba2fbe3a', re: /Creative Scotland/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: 'https://www.creativescotland.com/funding/funding-programmes/open-funding/national-lottery-open-fund-for-organisations', label: 'Open Fund for Organisations (open all year, no deadlines), read 2026-09-06' }],
    cits: { is_rolling: { snippet: 'The fund is open all year round', confidence: 'high',
      source_url: 'https://www.creativescotland.com/funding/funding-programmes/open-funding/national-lottery-open-fund-for-organisations' } } },
]

const REPORT: Report[] = [
  { id: 'ed047490-107e-4805-8ea2-6cd85520b3ae', title: 'Clore Social Leadership Programme', why: 'index_over_programmes',
    quote: 'Applications open', url: 'https://cloresocialleadership.org.uk/',
    note: 'Three programmes with their own states: Emerging Leader closed (runs Oct 2026 to May 2027), Experienced Leader open (Sep 2026 to Mar 2027), Leading Social Impact open (Sep 2026 to Dec 2026). Those are course run dates, not application windows, and no closing date is given for either open programme.' },
  { id: '15c7fa72-3e20-47e6-a211-a478ffc364af', title: 'Coalfields Regeneration Trust', why: 'index_over_programmes',
    quote: 'Applications for 2026/27 are currently paused due to high demand.',
    url: 'https://www.coalfields-regen.org.uk/grants',
    note: 'The row covers England, Scotland and Wales. The grants page lists Wales programmes in three different states: Breaking Barriers "Rolling programme", Game On Kit Grant paused, Surveys and Professional Fees described as rolling but with "Applications are currently paused" under How To Apply. Nothing on the page is true of the row as a whole.' },
  { id: 'aec5dee3-6c6b-43b4-abe7-92ece9c390c0', title: 'Comic Relief — International Development', why: 'index_over_programmes',
    quote: 'We have open and confidential feedback forms available for every funding call we release.',
    url: 'https://www.comicrelief.com/grants/',
    note: 'Grants go out in named funding calls under six themes, each with its own page. The grants index dates none of them and no call is shown as open.' },
  { id: 'fafa223d-1008-46c6-8019-585afd5014b7', title: 'Community Energy GO!', why: 'not_stated',
    quote: 'Launching in October 2025, we\'ll be working with eligible groups who are in the early stages of developing a low-carbon or renewable energy initiative.',
    url: 'https://www.cse.org.uk/my-community/community-energy-go/',
    note: 'Free advisory support rather than a round. The launch date is the only date on the page and it has passed.' },
  { id: 'cc5f93d2-aa9e-4873-aaa9-2a425b8868e1', title: 'Community Foundation Wales — Grants Hub', why: 'index_over_programmes',
    quote: 'Come learn about our new application form and our open funds!',
    url: 'https://communityfoundationwales.org.uk/grants-overview/',
    note: 'The grants overview is a fund-finder widget (who are you, where are you) over the foundation\'s open funds. It states no date for any of them and, unlike the North East, offers no general application route.' },
  { id: '057225d1-6b86-4341-b2df-766f3851ee62', title: 'Community Grant Programme', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.nationalgrid.com/responsibility/community/community-grant-programme',
    note: 'HTTP 403 behind a Cloudflare interstitial.' },
  { id: '3665afff-c092-41c1-83e9-fb67b8d4d563', title: 'Community Grants (Hampton Fund)', why: 'not_stated',
    quote: 'Application submission deadlines are usually 6-8 weeks before the meetings and the dates are available on request.',
    url: 'https://www.hamptonfund.co.uk/community-grants/',
    note: 'Trustees meet in March, June, September and December, so there are four deadlines a year and the fund will not publish them. "Usually 6-8 weeks before" is not a date and the meeting months are not deadlines, so neither a deadline nor a cycle can be written.' },
  { id: '49a1fffd-2412-4105-8897-8a5af286b797', title: 'Continuo Foundation Project Grants', why: 'not_stated',
    quote: 'By offering project grants on a competitive basis, twice annually, we ensure that there will be a steady flow of high calibre chamber performances across the year.',
    url: 'https://www.continuofoundation.co.uk/our-grants',
    note: 'Eleven rounds since 2021, announced each March and September, but the page dates only the announcements and never the application window.' },
  { id: '21812fb7-2496-4dba-a2a0-3fca9ba64b14', title: 'Coventry, Solihull & Warwickshire Communities Fund', why: 'not_stated',
    quote: 'Before applying for a grant, please read the Fund Factsheet .',
    url: 'https://www.heartofenglandcf.org/coventry-solihull-warwickshire-fund/',
    note: 'Second Heart of England Community Foundation row with this shape, after Alan Higgs in batch 1: the fund page carries criteria and no dates, and any timing is in the linked factsheet.' },
  { id: 'aa1e8f3f-e938-4852-9bda-3294ab4c1380', title: 'Crowdfunder — Match Funding', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.crowdfunder.co.uk/funds',
    note: 'HTTP 403 behind a Cloudflare interstitial.' },
  { id: '094397c0-1d2c-47dc-b112-c15d3d14bfd4', title: 'Cumbria Community Foundation — Community Grants', why: 'index_over_programmes',
    quote: 'Completed applications and all supporting documents must be submitted by the relevant application deadline. Please check application deadline dates carefully before starting your application.',
    url: 'https://www.cumbriafoundation.org/apply-for-a-grant/',
    note: 'Says plainly that deadlines exist and that they belong to each fund, and gives none.' },
  { id: 'c34f6859-efee-491f-98e8-aa560f2c0b35', title: 'Devon Community Foundation — Community Grants', why: 'invite_only',
    quote: 'Invitation to apply; we will invite the number of organisations we are able to fund',
    url: 'https://devoncf.com/current-funds/',
    note: 'Every current fund on the page is awarded by longlist, randomised shortlist and invitation, with the number of groups to be invited stated up front. There is a Getting to Know You form but no open application. Worth a look beyond timing: a fundraiser cannot apply here at all.' },
  { id: '4075bfa0-5ca1-4732-bac4-2b050c542015', title: 'Digital Candle — Free Digital Advice', why: 'not_stated',
    quote: 'Ask us a question, and we\'ll connect you with a volunteer expert. No question is too broad or too niche.',
    url: 'https://digitalcandle.org.uk/',
    note: 'A question form matched to volunteer experts. No round, and the page never says the form is always open.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
