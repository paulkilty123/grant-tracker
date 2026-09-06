// Timing on 187 live rows — batch 6 (rows 101-120). Eight written, twelve reported.
//
// The National Lottery Heritage Fund supplies five of this batch's twenty rows
// and is worth reading as one problem. Its model is a threshold, not a calendar:
// under £250,000 there is no deadline and decisions are monthly; over £250,000
// you submit an Expression of Interest and applications go to quarterly
// deadlines. So the four programme rows split on which side of the line they
// sit, and three of them say so only through a sentence about when DECISIONS
// are made — the same shape as Hedley and Fat Beehive in earlier batches, and
// written as rolling at med for the same reason.
//
// Two rows in this batch are closed with nowhere to point:
//   JRCT Rights & Justice   round two closed 2 September and the expression of
//                           interest stage closed 13 July. Its sibling
//                           programme says enquiries about 2027 open in
//                           December; the Rights & Justice page does not, and
//                           the sibling's sentence is not evidence about this
//                           row, so it is reported rather than borrowed.
//   Maudsley                "Key dates: Expressions of Interest: September
//                           2024, Full applications: April 2025, Decisions
//                           made: July 2025" — a round that has run its course.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-06-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 6

const ROWS: Row[] = [
  // 101. Round two's deadline (2 September) has passed and the EOI stage that
  // gates it closed on 13 July, so a new applicant cannot enter 2026 at all.
  // The stored prose is the December clause alone: the funder's sentence names
  // 2027 before it names 2026 and parseOpenDate takes the first year it sees.
  { id: '6344f1bf-cc8a-4410-a4b6-f15e200559f5', re: /Power & Accountability|Power and Accountability/,
    fields: { is_rolling: false, deadline: null, next_open_date: 'December 2026' },
    cits: { next_open_date: { snippet: 'We will be happy to take enquiries about the 2027 grant rounds from December 2026 onwards.', confidence: 'high',
      source_url: 'https://www.jrct.org.uk/power-and-accountability' } } },

  // 110. med, and the reason is worth stating: the date is printed in a "Quick
  // Look" list beside a calendar icon with no words at all — the label is an
  // <i class="far fa-calendar-alt">, not text. It is the only date on the page
  // and the page elsewhere says "within eight weeks of the closing date", so a
  // closing date is what it is, but nothing on the page says so in words.
  { id: '6d8568db-e597-476b-9075-d856e94229ff', re: /Michael Cornish/,
    fields: { deadline: '2026-10-16', is_rolling: false },
    cits: { deadline: { snippet: '16th October 2026', confidence: 'med',
      source_url: 'https://lincolnshirecf.co.uk/grants/mccgp/' } } },

  // 111. The sentence is in the page's embedded data rather than its visible
  // DOM — the "How we decide" panel only paints when you click it — but it is
  // in the HTML the checker reads.
  { id: '497400aa-4785-41b3-ae15-88e35fe38845', re: /Morrisons Foundation/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'There is no fixed deadline to apply for a Connecting Communities grant, we process applications monthly.', confidence: 'high',
      source_url: 'https://www.morrisonsfoundation.com/connecting-communities-grant-request' } } },

  // 113, 114. Strategic initiatives under National Lottery Heritage Grants. No
  // deadline is named; monthly decisions under £250,000 are all either page
  // says about time, hence med.
  { id: '2eb128b6-e14f-4f6f-a4da-8b7da56c48ca', re: /Heritage Places/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'For grants of less than £250,000, decisions are made on a monthly basis by the staff in your nation or area.', confidence: 'med',
      source_url: 'https://www.heritagefund.org.uk/funding/strategic-initiatives/heritage-places' } } },
  { id: '758d3705-6589-43c8-b87f-f01cca2e5ddc', re: /Landscape Connections/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'For this strategic initiative, for grants of less than £250,000 decisions will be made on a monthly basis by the senior investment or engagement staff of your nation or area.', confidence: 'med',
      source_url: 'https://www.heritagefund.org.uk/funding/strategic-initiatives/landscape-connections' } } },

  // 115. The one NLHF row that says it in words.
  { id: '72fc0c20-8491-49e4-bdc8-ad909b13cf50', re: /Heritage Grants £10,000/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'There is no deadline for applications.', confidence: 'high',
      source_url: 'https://www.heritagefund.org.uk/funding/national-lottery-heritage-grants-10k-250k-0' } } },

  // 116. The programme page says only "Deadlines for development and delivery
  // applications are quarterly"; the deadlines page one link on has the dates.
  // The cycle is real: 6 August and 12 November appear in both 2025 and 2026,
  // which is the repeat evidence a cycle needs, and February and May complete
  // the quarter pattern.
  { id: '4b989eab-79b0-4981-987d-f308f0843fdc', re: /Heritage Grants £250,000/,
    fields: { deadline: '2026-11-12', is_rolling: false,
      deadline_cycle: [
        { day: 26, month: 2,  label: 'Quarterly deadline, 12 noon' },
        { day: 28, month: 5,  label: 'Quarterly deadline, 12 noon' },
        { day: 6,  month: 8,  label: 'Quarterly deadline, 12 noon' },
        { day: 12, month: 11, label: 'Quarterly deadline, 12 noon' },
      ] },
    sources: [{ url: 'https://www.heritagefund.org.uk/funding/national-lottery-heritage-grants-250k-10m/deadlines', label: 'Application deadlines over £250,000, read 2026-09-06' }],
    cits: { deadline: { snippet: '12noon, 12 November 2026, to receive a decision by end of March 2027', confidence: 'high',
      source_url: 'https://www.heritagefund.org.uk/funding/national-lottery-heritage-grants-250k-10m/deadlines' } } },

  // 118. Community Foundation North East's own status label on the fund, the
  // same field that reads "Closing Date: 21/09/2026" on its dated funds. The
  // page also lists 2026 panel dates (27 Feb, 1 May, 6 Jul, 4 Sep, 6 Nov) but
  // they move year to year, so no cycle.
  { id: 'e3c90440-3ea2-4bb9-a98c-07cd5d32a2e2', re: /Newcastle Culture Investment Fund|Newcastle-based/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Rolling grant fund', confidence: 'high',
      source_url: 'https://www.communityfoundation.org.uk/grants/supporting-newcastle-based-organisations-to-engage-residents-in-culture/' } } },
]

const REPORT: Report[] = [
  { id: '8f8bc717-1cbb-44de-abc1-fe04e0efcce2', title: 'JRCT — Rights & Justice Programme', why: 'closed_no_date',
    quote: 'New applicants need to complete the expression of interest form below by Monday 13 July (10am).',
    url: 'https://www.jrct.org.uk/rights-and-justice',
    note: 'Round two closed 2 September 2026 and the EOI gating it closed 13 July. JRCT\'s shared when-to-apply page lists 2026 dates only. The sibling Power & Accountability page says enquiries about 2027 open in December; this page does not, and one programme\'s sentence is not evidence about another.' },
  { id: '0a0158ee-9fbb-44d3-b991-6a39656e90a2', title: 'Kelly Family Charitable Trust', why: 'not_stated',
    quote: 'Unsuccessful applicants must wait for 1 year before resubmitting an application.',
    url: 'https://kfct.org.uk/application-criteria/',
    note: 'A full criteria and exclusions page with no application window, no round and no meeting schedule. The reapplication wait is the only period on it.' },
  { id: '5772cd18-ed5f-4b2e-a3cc-5325ac8689bb', title: 'Kent Community Foundation Grants', why: 'index_over_programmes',
    quote: 'Explore funding opportunities for charities and community groups, learn how to apply, and see how we can support your work.',
    url: 'https://www.kentcf.org.uk/funding/',
    note: 'Funder-level page over the foundation\'s open funds, with no date at this level.' },
  { id: 'b7d19a10-753c-4294-95ad-ec43ac71595d', title: 'Kusuma Trust UK — Education, Communities & Environment', why: 'not_stated',
    quote: 'The application process will open on A-level results day, with a closing date for applications of Friday 18th September.',
    url: 'https://www.kusumatrust.org/',
    note: 'The quote is the only application window anywhere on the site and it is NOT this row: it belongs to Kusuma Trust Gibraltar\'s 2026 Excellence Prize, a separate entity and a prize for students. The UK trust\'s site is a grantee showcase with no application route at all. Left unwritten precisely because the date that is there is the wrong one.' },
  { id: '5a368644-3211-4a40-9447-d5594938a519', title: 'Lambeth Community Connections Fund', why: 'unreadable',
    quote: 'Apply now. Access the application form and get support to apply.',
    url: 'https://www.lambeth.gov.uk/community-connections-fund',
    note: 'HTTP 200, but the fund content sits in accordions that render only in a browser. The fetched HTML has the section headings ("Who can apply?", "Latest updates") and nothing under them.' },
  { id: 'a5da4678-2d9e-49ce-9c9a-599c155046ef', title: 'LawWorks — Free Legal Advice for Charities', why: 'not_stated',
    quote: 'You should browse the above Free Talks and resources before applying to our service on behalf of your not-for-profit organisation (see below).',
    url: 'https://www.lawworks.org.uk/legal-advice-not-profits',
    note: 'A referral service to pro bono solicitors rather than a round. No window stated on either the home page or the not-for-profits page.' },
  { id: '9f2bbfca-91ed-4f0e-a3d2-cf9e1486ce8d', title: 'Lush Charity Pot — Grants', why: 'not_stated',
    quote: 'Grants of up to £10,000 are available with the average grant being in the region of £2,000 to £4,000.',
    url: 'https://connectedvoice.org.uk/services/support-and-development/funding/lush-charity-pot-animal-protection-environment-and-human',
    note: 'apply_url is a Connected Voice directory listing that states no timing. It links to lush.com/uk/en/a/charity-pot-funding-guidelines, which returns HTTP 403, so the funder\'s own guidelines could not be read.' },
  { id: '83377536-631c-4d17-9554-58516596b6d4', title: 'Maudsley Charity - Building Brighter Futures', why: 'closed_no_date',
    quote: 'Key dates: Expressions of Interest: September 2024, Full applications: April 2025, Decisions made: July 2025.',
    url: 'https://maudsleycharity.org/grants/building-brighter-futures/',
    note: 'The round ran and was awarded; the page is now a record of the funded projects. No further round announced.' },
  { id: '2828f266-4dae-4933-a041-b3d1d56c17a4', title: 'National Lottery Heritage Fund — Heritage in Need: Places of Worship', why: 'not_stated',
    quote: 'For grants over £250,000 you must first submit an Expression of Interest before applying. Start your project title with #PW.',
    url: 'https://www.heritagefund.org.uk/funding/strategic-initiatives/heritage-need-places-worship',
    note: 'The only NLHF strategic initiative in this batch whose page carries no sentence about timing at all, not even the monthly-decisions line that Heritage Places and Landscape Connections use. Left unwritten rather than inheriting a sibling page\'s wording.' },
  { id: '3745ad11-a75d-4152-b604-9c95bc21915d', title: 'Network for Social Change — Grants', why: 'not_stated',
    quote: 'All project applications are reviewed and carefully assessed by members, and then a specialised sub-group checks to ensure that charitable grants comply with charitable law and applicable tax regulations.',
    url: 'https://www.thenetworkforsocialchange.org.uk/how-we-fund/',
    note: 'Three funding streams described (Fast Track, Pools, Major Projects) with no date, round or window for any of them.' },
  { id: 'fc84cf7f-1b48-4f28-86dd-71de69cd3354', title: 'NHS Charities Together — Community Grants', why: 'index_over_programmes',
    quote: 'This programme aims to unlock the power of people and communities to prevent and/or respond to crises and emergencies, and in doing so reduce pressures facing NHS services.',
    url: 'https://nhscharitiestogether.co.uk/about-us/our-programmes/',
    note: 'A page of programme descriptions; every date on it is a past award. Grants reach charities through member NHS charities rather than an open call here.' },
  { id: 'c90fec54-7a88-486a-bb7f-d711784dc498', title: 'Norfolk Community Foundation — Grants for Groups', why: 'index_over_programmes',
    quote: 'Browse the Funds currently open for applications below – you can use the filters to help identify a match for your project. Opportunities will change throughout the year – if you don\'t see a current Fund that suits your project, contact us for advice.',
    url: 'https://www.norfolkfoundation.com/funding-support/grants/groups/',
    note: 'A live list of open funds each with its own deadline (14, 21 and 23 September, 12 and 15 October among them). None belongs to this funder-level row.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
