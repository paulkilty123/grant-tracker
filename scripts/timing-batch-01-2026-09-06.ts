// Timing on 187 live rows — batch 1 (rows 1-20 of docs/handoffs/timing-rows-2026-09-06.json).
//
// Every page below was read today with a browser user agent. Ten rows carry a
// timing statement the page makes in its own words; those are written, each
// with the sentence it rests on. Ten state nothing usable and are reported,
// not written: a row left flagged costs a review, a row that looks timed and
// is not costs a user a missed round.
//
// Reading note for later batches: barrowcadbury.org.uk serves brotli whatever
// the request asks for, and this machine's curl has no brotli. It returned
// HTTP 200 with a zero-length body — a silent empty page that reads exactly
// like "the page says nothing about timing". The fetcher is node's fetch for
// that reason. Any page that comes back empty is re-read, never reported.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-01-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { appendBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:timing-2026-09-06'
const BATCH  = 1

const ROWS: Row[] = [
  // 1. Four rounds a year; the October 2026 round closed 13.07.26. The next
  // opens 01.12.26 and closes 01.02.27. deadline_cycle is already on the row
  // and matches the page's close dates (13/7, 1/2, 1/5), so only the next
  // date is written.
  { id: 'd2083d32-698f-4620-a3c4-5ff597a565c8', re: /7Stars Foundation/,
    fields: { deadline: '2027-02-01', is_rolling: false },
    cits: { deadline: { snippet: '01.02.27', confidence: 'high',
      source_url: 'https://the7starsfoundation.co.uk/apply-for-funding' } } },

  // 2. how-we-fund states only "meet quarterly". The apply page carries the
  // dates, so it is banked as a source.
  { id: 'a94ae453-629b-46ca-a21e-11606403bfc9', re: /A B Charitable Trust/,
    fields: { deadline: '2026-10-23', is_rolling: false },
    sources: [{ url: 'https://abcharitabletrust.org.uk/apply', label: 'Apply page (application deadlines), read 2026-09-06' }],
    cits: { deadline: { snippet: '23rd October 2026', confidence: 'high',
      source_url: 'https://abcharitabletrust.org.uk/apply' } } },

  // 5. Quarterly deadlines on fixed days, so the cycle is captured too — once
  // 15 September passes there is something structured to roll forward to.
  { id: '81c50185-6ad9-4b77-b10f-c0677d14f03a', re: /Achlachan/,
    fields: { deadline: '2026-09-15', is_rolling: false,
      deadline_cycle: [
        { day: 15, month: 3,  label: 'Quarterly panel' },
        { day: 15, month: 6,  label: 'Quarterly panel' },
        { day: 15, month: 9,  label: 'Quarterly panel' },
        { day: 15, month: 12, label: 'Quarterly panel' },
      ] },
    cits: { deadline: { snippet: '15th March, 15th June, 15th September, 15th December', confidence: 'high',
      source_url: 'https://foundationscotland.org.uk/apply-for-funding/funding-available/achlachan' } } },

  // 6. Stage two has four dated rounds a year, but stage one — the only door a
  // fundraiser can walk through unbidden — is open all year. What they can do
  // today is submit an EOI, so the row is rolling.
  { id: '32e9cb1d-4e0d-4554-a4c3-569bc4e0b9fb', re: /Active Spaces/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'You can submit an EOI at any time throughout the year.', confidence: 'high',
      source_url: 'https://www.londonmarathonfoundation.org/active-spaces-fund' } } },

  // 7. The trust has no site of its own; Young Camden Foundation's directory
  // entry is the page. It was last updated in 2022, hence med.
  { id: '86380b2e-1c74-4cd3-b560-663a021bc097', re: /Adint/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Applications are considered at the regular meetings of the trustees and grants are awarded throughout the year.', confidence: 'med',
      source_url: 'https://youngcamdenfoundation.org.uk/funding/adint-charitable-trust' } } },

  // 9. The programme page states no timing; applying-for-funding does, and is
  // banked. The October trustees' meeting is closed but applications are still
  // being taken for later rounds, so rolling is the honest reading.
  { id: 'da45f5fc-31ff-4a5d-9fd9-9821c65b46d7', re: /Allen Lane/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: 'https://allenlane.org.uk/applying-for-funding/', label: 'Applying for Funding (timing), read 2026-09-06' }],
    cits: { is_rolling: { snippet: 'we process applications all through the year, and will come back to you within a couple of weeks with our initial thoughts.', confidence: 'high',
      source_url: 'https://allenlane.org.uk/applying-for-funding/' } } },

  // 12. Round 1 closes 23 September 2026, round 2 opens 16 November. The row's
  // deadline_cycle (23/9, 20/1) already holds the pattern.
  { id: 'bcd035bf-e0e7-462d-8895-84c1aee05953', re: /Arts, Health and Wellbeing/,
    fields: { deadline: '2026-09-23', is_rolling: false },
    cits: { deadline: { snippet: 'The current funding round is now open for applications and will close at 1pm on Wednesday 23 September 2026', confidence: 'high',
      source_url: 'https://arts.wales/funding/organisations/arts-health-and-wellbeing' } } },

  // 13. Mixed: Small has no deadlines, Large has four dated rounds a year and
  // the row's deadline_cycle already carries all four. The dated reading is
  // the one that fails safe — a Small applicant loses nothing by seeing a
  // date, a Large applicant told "rolling" misses 30 September. The page
  // prints its dates as a bare list, so the snippet is the date as printed.
  { id: '033b3ddf-fd0c-4aea-b440-7cb4c12be8d7', re: /Create and Engage/,
    fields: { deadline: '2026-09-30', is_rolling: false },
    cits: { deadline: { snippet: 'Wednesday 30 September 2026', confidence: 'high',
      source_url: 'https://arts.wales/funding/individuals/create-and-engage' } } },

  // 18. Funding for All is the trust's only public page — it does not operate
  // a website of its own, which the page says.
  { id: '040888ac-bdd1-4a22-9f33-cc841f9b5cbb', re: /Backstage Trust/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Deadline: Ongoing', confidence: 'high',
      source_url: 'https://fundingforall.org.uk/funds/backstage-trust/' } } },

  // 20. Read only after switching the fetcher off curl — see the note above.
  { id: '7e2f1cd7-bc26-4028-afbd-5a42d5438322', re: /Barrow Cadbury/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'You can apply at any time. We do not have set grant-making deadlines.', confidence: 'high',
      source_url: 'https://barrowcadbury.org.uk/our-work/applying-for-funding/' } } },
]

const REPORT: Report[] = [
  { id: '5ed056e6-d5dd-4a82-b845-65c27a9a9eb5', title: 'Accelerate', why: 'not_stated',
    quote: 'If you would like to apply for support through our Accelerate programme, please fill out our simple online expression of interest form.',
    url: 'https://communityenterprise.co.uk/accelerate',
    note: 'Programme page and the get-support page both carry an always-available EOI form and no dates anywhere. An open form is not a statement that applications are accepted at any time.' },
  { id: '1694669a-605f-44ea-9775-c6a492f0362e', title: 'Achievement Award Scheme', why: 'not_stated',
    quote: 'Each year, we recognise circa 12,000 Achievement Award winners and invest £3.5m through the Achievement Award scheme.',
    url: 'https://www.jackpetcheyfoundation.org.uk/opportunities/grant-programmes/achievement-awards/',
    note: 'Organisations join the scheme rather than apply to a round. Closest the page comes to timing is the annual volume.' },
  { id: 'df926186-9453-40d9-ab0a-33bbbba6bcb1', title: 'Alan Higgs Community Grants', why: 'not_stated',
    quote: 'Please read the Fund Factsheet and our Essential Information before applying.',
    url: 'https://www.heartofenglandcf.org/alan-higgs-community-grants/',
    note: 'The fund page has no dates and no rounds. Any timing is in the linked factsheet.' },
  { id: '9d1b13f1-607d-48b1-80df-80e127cd8933', title: 'Annandale and Nithsdale Community Benefit Company', why: 'closed_no_date',
    quote: 'Application deadline: 03/09/26',
    url: 'https://foundationscotland.org.uk/ancbc',
    note: 'Three rounds listed for 2026 (05/01, 02/04, 03/09); the last passed three days ago and no 2027 date is published. The dates move year to year, so there is no cycle to roll forward.' },
  { id: '0704b87e-ea54-4ae3-87d3-7a95559d36a9', title: 'Arts Council of Northern Ireland — Lottery Grants', why: 'not_stated',
    quote: 'Our Funding Programmes are open to individuals and to organisations. Each funding programme is different, and each programme has useful guidance notes on who can apply, and what you can apply for.',
    url: 'https://artscouncil-ni.org/funding',
    note: 'apply_url is the funding index. It states no dates and does not name a single scheme this row could be, so nothing is followed.' },
  { id: 'b774d28f-4f07-4ebd-8702-8f3c3e0cfe5a', title: 'Arts Council of Wales — Have a Go', why: 'not_stated',
    quote: 'We recommend that you register at least 5 working days before you wish to start your application.',
    url: 'https://arts.wales/funding/creative-learning/have-a-go',
    note: 'Unlike its sibling funds, this page states neither a deadline nor that there is none. The registration lead time is the only timing on it.' },
  { id: 'edaed6a2-448f-4209-b763-5006d6874cf2', title: 'ASTOP — Rent-Free Property for Charities', why: 'not_stated',
    quote: 'Whether you’re a landlord with empty space or a charitable organization seeking a home, we invite you to explore how ASTOP can help you make a positive impact on your community.',
    url: 'https://astop.org.uk/',
    note: 'A matching service with a contact form, no application window stated.' },
  { id: 'e2b9494b-b4af-4e29-9843-df8a3980aa3c', title: 'Aurora Trust', why: 'invite_only',
    quote: 'The Aurora Trust does not generally accept unsolicited applications.',
    url: 'https://auroratrust.org.uk/',
    note: 'Reported rather than written: whether the row belongs live is a separate question from timing.' },
  { id: 'cb9780e6-9898-4913-9f41-aa7034908269', title: 'B&Q Foundation — Home Improvement & Home-Starter Kits Funds', why: 'not_stated',
    quote: 'Please note that due to the high volume of applications, it may take up to 12 weeks after the deadline to hear the outcome.',
    url: 'https://bqfoundation.org.uk/apply-for-a-grant/',
    note: 'The page implies a deadline without stating one. Both application links go to Neighbourly campaign pages (HomeImprovementGrants2026, BQHomeStarterKits26) which render nothing without JavaScript.' },
  { id: '614ffed1-b5c4-44d0-9ad4-34c4496f3137', title: 'Bairdwatson Charitable Trust', why: 'closed_no_date',
    quote: 'Applications close: 07/08/26',
    url: 'https://foundationscotland.org.uk/apply-for-funding/funding-available/bairdwatson-charitable-trust',
    note: 'Opened 03/07/26, closed 07/08/26, decisions end of December 2026. No next round published.' },
]

async function main() {
  const db = getAdminDb()
  console.log(`batch ${BATCH} — ${APPLY ? 'APPLY' : 'DRY RUN'} — ${ROWS.length} writes, ${REPORT.length} reported`)

  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, deadline, is_rolling, next_open_date_parsed, grant_sources').eq('id', r.id).single()
    if (!data) throw new Error(`${r.id}: no row`)
    if (!r.re.test(data.title)) throw new Error(`${r.id}: title "${data.title}" does not match ${r.re}`)

    const fields: Record<string, unknown> = { ...r.fields }
    if (r.sources?.length) {
      const existing = (data.grant_sources as { url?: string }[] | null) ?? []
      const have = new Set(existing.map(s => s.url))
      const add = r.sources.filter(s => !have.has(s.url)).map(s => ({ url: s.url, text: '', label: s.label }))
      if (add.length) fields.grant_sources = [...existing, ...add]
    }

    console.log(`  ${data.title.slice(0, 44).padEnd(44)} ${JSON.stringify(r.fields)}`)
    for (const [k, c] of Object.entries(r.cits)) console.log(`      ${k}: "${c.snippet}"`)
    if (!APPLY) continue

    const res = await mergeGrantUpdate({ id: r.id, fields, source: SOURCE, db, citations: r.cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)
    if (refused.length) throw new Error(`${data.title}: refused ${JSON.stringify(refused)} — log as pinned and rerun without this row`)
  }

  for (const r of REPORT) console.log(`  report  ${r.title.slice(0, 40).padEnd(40)} ${r.why}`)
  if (APPLY) appendBatch(BATCH, ROWS, REPORT)
}
main().catch(e => { console.error(e); process.exit(1) })
