// Timing on 187 live rows — batch 4 (rows 61-80). Nine written, eleven reported.
//
// Two patterns in this batch that will recur.
//
// A funder that decides at set meetings but names no cut-off is rolling. The
// brief lists "decisions quarterly with no cut-off" under rolling, and the
// deciding question is whether the page names a date an application must beat.
// Fat Beehive ("trustee meetings which take place in April and October") and
// The Old Enfield Charitable Trust in batch 3 have no such date and are
// rolling; the Hampton Fund in batch 3 says submission deadlines exist and will
// not publish them, and was reported. The meetings are not the deadlines.
//
// A month named without a year. Fine & Country says applications open in
// October and Fishmongers says late November, neither with a year, and
// parseOpenDate needs one. Both are anchored on their own page — Fishmongers
// heads the paragraph "July 2026 Update", and Fine & Country ran its spring
// round in March 2026 — so the year is read off the page rather than assumed,
// and the sentence without it stays in the citation.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-04-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 4

const ESMEE = 'https://esmeefairbairn.org.uk/apply-for-a-grant/submit-an-application/'
const ESMEE_SNIPPET = 'Unless specified otherwise, we accept applications on a rolling basis with no deadlines.'

const ROWS: Row[] = [
  // 61. Twice-yearly trustee meetings, no cut-off named. med rather than high:
  // the sentence says when decisions happen, not when applications must be in.
  { id: '39d92511-a517-4afe-8ff4-f3c8c5ce68b0', re: /Digital funding for small charities/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'We award grants twice a year, and will notify successful applicants shortly after our trustee meetings which take place in April and October.', confidence: 'med',
      source_url: 'https://www.fatbeehivefoundation.org.uk/' } } },

  // 62. The trust has no site; Young Camden Foundation's directory entry is the
  // page, last updated January 2025, hence med. Same shape as Adint in batch 1.
  { id: 'ca53ae09-15ca-41a3-bd09-70d97d1b068f', re: /Dixie Rose Findlay/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Applications may be submitted at any time and must be made in writing.', confidence: 'med',
      source_url: 'https://youngcamdenfoundation.org.uk/funding/dixie-rose-findlay-charitable-trust' } } },

  // 67. The date table is two columns, deadline and committee meeting, so the
  // eight dates are four pairs: 13 Apr/11 May, 6 Jul/3 Aug, 5 Oct/2 Nov,
  // 4 Jan/1 Feb. The deadlines are the first of each pair; next is 5 October.
  // The days move year to year, so there is no cycle to capture.
  { id: 'a7e93d28-fc29-48ff-91fa-b06b1f30eafe', re: /East Midlands Airport/,
    fields: { deadline: '2026-10-05', is_rolling: false },
    cits: { deadline: { snippet: '05 October 2026', confidence: 'high',
      source_url: 'https://www.eastmidlandsairport.com/community/supporting-the-local-community/' } } },

  // 73-75. Three priority rows, one foundation, one process. The guidance pages
  // carry no dates; the shared application page states the rule. "Unless
  // specified otherwise" was checked against all three guidance pages: none
  // specifies otherwise. A Fairer Future does close two of its long-term
  // outcomes to applications, but that is scope rather than timing — the
  // priority still takes EOIs.
  { id: 'af98107b-eda0-4294-9fcb-0e125e2733ff', re: /A Fairer Future/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: ESMEE, label: 'Submit an application (rolling, no deadlines), read 2026-09-06' }],
    cits: { is_rolling: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } } },
  { id: '732a41ad-8df9-405f-a74f-cd25be2b64c2', re: /Creative, Confident Communities/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: ESMEE, label: 'Submit an application (rolling, no deadlines), read 2026-09-06' }],
    cits: { is_rolling: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } } },
  { id: '6bee86de-f50a-4c01-b409-d72a6f4ed686', re: /Natural World/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: ESMEE, label: 'Submit an application (rolling, no deadlines), read 2026-09-06' }],
    cits: { is_rolling: { snippet: ESMEE_SNIPPET, confidence: 'high', source_url: ESMEE } } },

  // 77. Two rounds a year and applications are only read inside them, so
  // between rounds this is a watch date rather than a deadline. Spring opened
  // in March 2026, so the October named here is October 2026.
  { id: 'bfaa140a-ed84-4862-a455-6e48ca22e906', re: /Fine & Country/,
    fields: { is_rolling: false, deadline: null, next_open_date: 'October 2026' },
    cits: { next_open_date: { snippet: 'applications open in October, assessed in November and funds for successful applications are distributed in December', confidence: 'high',
      source_url: 'https://www.fineandcountryfoundation.com/grants/' } } },

  // 78. The paragraph is headed "July 2026 Update", which is where the year
  // comes from. "Late November/early December" rounds to 1 November.
  { id: '3b8727a4-faa4-49b7-a162-c46212af731b', re: /Fishmongers/,
    fields: { is_rolling: false, deadline: null, next_open_date: 'Late November 2026' },
    cits: { next_open_date: { snippet: 'We are closed for applications and do not anticipate re-opening for new applications until late November/early December', confidence: 'high',
      source_url: 'https://fishmongers.org.uk/grants/' } } },

  // 80. Says both halves outright: any time, and no deadlines.
  { id: '595ccabb-817c-48a1-9f3d-de394d09a458', re: /Forte Charitable Foundation/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'you can make applications at any time of the year', confidence: 'high',
      source_url: 'https://www.fortecharitablefoundation.org.uk/our-grants' } } },
]

const REPORT: Report[] = [
  { id: 'b3dac130-3d54-4bb6-8714-034016f18611', title: 'Doc Society — Documentary Film Funds', why: 'index_over_programmes',
    quote: 'BFI Doc Society Development Fund Fund CLOSED', url: 'https://docsociety.org/more/',
    note: 'apply_url /funds/ redirects to /more/, which lists five funds: Development, Made of Truth, Expanded Screen and RAD all marked CLOSED, and the Talent Development Programme marked OPEN, which is year-round activity rather than a grant. No reopening date for any of them.' },
  { id: '574fc073-bca6-4b01-95c0-a7dc8627c3e0', title: 'Dulverton Trust Grants', why: 'not_stated',
    quote: 'To apply, complete our eligibility quiz (button below). If eligible, you will be provided with a link to our online Expression of Interest form.',
    url: 'https://www.dulverton.org/',
    note: 'An always-available eligibility quiz and EOI form, no window stated. The board meets (a February meeting is mentioned in a news item) but the page never ties an application date to it. One funding category is invitation only.' },
  { id: 'a7b1e535-b639-471c-9231-1d87cff07489', title: 'DWF Foundation', why: 'not_stated',
    quote: 'The Foundation team have compiled a list of FAQs to assist the application process. We would encourage you to take a look at these before you apply online.',
    url: 'https://dwfgroup.com/en/about-us/dwf-foundation',
    note: 'Neither the foundation page nor its Grant Giving page carries a date, a round or a meeting schedule. Every date on both is a past award.' },
  { id: '0d90187a-15da-4625-8739-34ae7134aecd', title: 'East End Community Foundation — Grants', why: 'index_over_programmes',
    quote: 'All funds are administered through our grant programmes, and we also manage and administer grants programmes on behalf of our corporate and statutory partners, and individuals.',
    url: 'https://eastendcf.org/grants/',
    note: 'Funder-level page over the foundation\'s own funds and the programmes it runs for partners. No date for any of them, and the only next step offered is the newsletter.' },
  { id: 'dab46d8f-9841-408e-a862-489dd45493d4', title: 'Edgbaston & Northfield NNS Fund for Older Adults (50+)', why: 'not_stated',
    quote: 'Please read the Fund Factsheet for Edgbaston before applying.',
    url: 'https://www.heartofenglandcf.org/nns/',
    note: 'Third and fourth Heart of England Community Foundation rows with this shape, after Alan Higgs and Coventry Solihull & Warwickshire: criteria on the page, dates only in the linked factsheet. Worth handling as one job rather than row by row.' },
  { id: '8cdb1c33-750e-4c9c-8bb4-77c997ceeefd', title: 'Edgbaston & Northfield NNS Fund for Younger Adults', why: 'not_stated',
    quote: 'Please read the Fund Factsheet for Edgbaston before applying.',
    url: 'https://www.heartofenglandcf.org/nns-younger-adults/',
    note: 'Same page shape and same factsheet pattern as the 50+ row above.' },
  { id: 'c67c1e54-64e2-4b82-b651-952aecfa434d', title: 'Employer Partnership (sports coaching apprenticeships)', why: 'not_stated',
    quote: 'Get in touch to let us know if you are thinking about becoming an employer, or would like some information, advice or guidance about apprenticeships.',
    url: 'https://coachcore.org.uk/become-an-employer/',
    note: 'A register-interest form for employers, with no cohort or intake date on the page.' },
  { id: '8f5a1cfb-e408-4dfb-a0da-ad4d632a0d4c', title: 'Energy Industry Voluntary Redress Scheme', why: 'not_stated',
    quote: 'The amount of funding available through the scheme varies throughout the year and will be reviewed on a quarterly basis in January, April, July and October.',
    url: 'https://energyredress.org.uk/apply-funding',
    note: 'Rounds exist and are referred to throughout ("the forthcoming funding window", "two weeks prior to the application deadline") but none is dated. Applicants register once and are notified when funds become available, so the page cannot tell a newcomer whether they can apply today.' },
  { id: '21f84400-4330-4267-9a62-4540617a573d', title: 'Eranda Rothschild Foundation', why: 'not_stated',
    quote: 'We consider applications from universities and other charities to support young professionals in fields including medicine, science and business.',
    url: 'https://erandarothschild.org/',
    note: 'A four-page site with no how-to-apply section and no date of any kind.' },
  { id: '7e5b73df-1210-42a9-9c24-fafeb8357cef', title: 'Family Fund — Grants for Families with Disabled Children', why: 'not_stated',
    quote: 'To decide if your family is eligible for a grant, Family Fund looks at your income and the impact of disability on your child and young person.',
    url: 'https://www.familyfund.org.uk/grants/',
    note: 'There is a "Check when I can next apply" tool, but it answers a per-family cooldown rather than a round, and the grants page states no window.' },
  { id: '2172377c-724f-4261-ae35-389af8de6867', title: 'Forces in Mind Trust — Veterans Mental Health Programme', why: 'not_stated',
    quote: 'If, having read the eligibility criteria for applicants, you would like to apply for a grant, the first stage is to submit an initial application, which enables you to share an overview of your project with us.',
    url: 'https://www.fim-trust.org/apply/how-to-apply/',
    note: 'A two-stage process described in full across four pages, none of which names a deadline or says applications are open continuously.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
