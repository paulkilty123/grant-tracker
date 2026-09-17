// Timing on 187 live rows — batch 10, the last (rows 181-187). Two written, five reported.
//
// The W F Southall Trust is the row that best earns the floor rule, so it is
// worth recording why it is reported rather than written. Two pages give two
// descriptions of the same schedule and neither gives a date. A news post says
// the Trust opens "Mid-March for up to eight weeks", "Mid-July for up to eight
// weeks" and "Mid-November for up to eight weeks", and adds that it will close
// a window early if applications exceed the budget — which it did in April. The
// FAQ says the deadlines are "Late April/Early May", "Late August/Early
// September" and "Late December/Early January". Both are consistent with each
// other and neither answers today's question: mid-July plus eight weeks lands
// within days of now, so the Trust may be open this minute or may have closed
// early again. A reopening date of mid-November would be wrong if it is open;
// a deadline would be a guess. Nothing is written.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-10-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 10

const ROWS: Row[] = [
  // 183. Closed, with the reopening given to the day and even to the window:
  // applications are emailed between 30 November and 4 December.
  { id: 'b99ad2bd-ae8f-41a5-8316-70e51052aa75', re: /W\.?G\.? Edwards/,
    fields: { is_rolling: false, deadline: null, next_open_date: '30 November 2026' },
    sources: [{ url: 'https://wgedwardscharitablefoundation.org.uk/when-to-apply/', label: 'When to apply (reopening window), read 2026-09-06' }],
    cits: { next_open_date: { snippet: 'Applications are now closed until December 2026. If you wish to apply to this foundation, please email your application between November 30–December 4, 2026.', confidence: 'high',
      source_url: 'https://wgedwardscharitablefoundation.org.uk/when-to-apply/' } } },

  // 186. Two tiers on one page: small grants considered monthly with no cut-off,
  // large grants at trustee meetings in May and November whose deadline the
  // page says will be announced later. Rolling is what the page can support,
  // and there is no cycle because the large-grant dates are not given.
  { id: '61989785-35af-40d7-9961-011cf4711f44', re: /William A Cadbury/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Applications for small grants (all postal applications and requests for amounts under £5000) are considered on a monthly basis.', confidence: 'high',
      source_url: 'https://wa-cadbury.org.uk/grants-policy/' } } },
]

const REPORT: Report[] = [
  { id: '7b37ff2e-13f0-4b71-87bf-24b0b6fdcd80', title: 'Virgin Money Foundation', why: 'not_stated',
    quote: 'Following the acquisition of Virgin Money by Nationwide Building Society in October 2024 and the full legal transfer in April 2026, Virgin Money is proud to be part of Nationwide Group.',
    url: 'https://www.virginmoneyfoundation.org.uk/',
    note: 'The site is about the foundation and its 360Giving publishing. No application route, criteria page or date anywhere on it. The ownership change may be worth a look beyond timing.' },
  { id: 'e84785f4-a275-4f0b-9bf5-0c2924003319', title: 'W F Southall Trust — Grants', why: 'not_stated',
    quote: 'The Trust will be open to applications during the following periods: Mid-March for up to eight weeks. Mid-July for up to eight weeks. Mid-November for up to eight weeks.',
    url: 'https://southalltrust.org/news/new-application-deadlines/',
    note: 'See the header note. The FAQ gives the same schedule as rough deadlines ("Late April/Early May", "Late August/Early September", "Late December/Early January") and the Trust closed its spring window early in April when demand exceeded budget. Mid-July plus eight weeks lands within days of today, so whether it is open right now cannot be told from either page.' },
  { id: '05aa2cda-e64d-4f21-8b89-0727637d5515', title: 'Waterloo Foundation Grant Programmes', why: 'index_over_programmes',
    quote: 'Active Calls and Deadlines',
    url: 'https://waterloofoundation.org.uk/',
    note: 'Each programme has its own "Active Calls and Deadlines" page (child development research, and others). The home page carries the label and none of the dates.' },
  { id: '20fe8bd9-20ad-4536-bfc6-cac264c653c5', title: 'Wellcome Trust — Public Engagement & Society and Ethics Grants', why: 'index_over_programmes',
    quote: 'We\'re spending £16 billion in the decade to 2032 on a range of activities to enable discoveries and advance solutions for urgent health challenges.',
    url: 'https://wellcome.org/research-funding',
    note: 'apply_url /grant-funding redirects to /research-funding, an index over dozens of schemes each with its own deadline. Nothing at this level can carry a date, and the row names two specific programmes that the index does not resolve to.' },
  { id: '581fab6f-e73b-4584-82fd-d0ab9f355aed', title: 'Zochonis Charitable Trust — Grants', why: 'not_stated',
    quote: 'ZCT will consider funding for their current financial year only. We do not accept applications for multi-year funding. You may submit one application in any 12 month period.',
    url: 'https://www.zochonischaritabletrust.com/how-to-apply/',
    note: 'The how-to-apply page runs to thirty lines and the only periods on it are the funding year and the reapplication wait.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
