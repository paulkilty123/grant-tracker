// Timing on 187 live rows — batch 5 (rows 81-100). Eleven written, nine reported.
//
// The best batch so far, and for a reason worth naming: this stretch is
// trusts with their own single fund rather than foundations with a shelf of
// them. A trust that runs one programme tends to say plainly when you can
// apply; a foundation running twelve says "see each fund's page".
//
// Three mixed pages are written as rolling WITH the dated rounds captured, the
// shape the orchestrating session asked for after Active Spaces:
//   STEM North East   "remain rolling", deadlines the last day of Sep, Dec,
//                     Mar and Jun
//   Matthew Good      "You can apply all year round", four windows ending
//                     15 Mar, 15 Jun, 15 Sep, 15 Dec
//   Help the Homeless not rolling — fixed quarterly deadlines on the 20th, so
//                     it is dated plus a cycle
// All three cycles are genuine: same day and month every year, which is the
// test cf-fund-extract sets. Contrast the many rounds elsewhere in this job
// that fall on a Friday or a first Monday and move, and get no cycle.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-05-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 5

const ROWS: Row[] = [
  // 82. Rolling with quarterly donor consideration. The deadlines are the last
  // day of each quarter month, which is a real repeating cycle.
  { id: '58982bd3-de15-4000-9c4b-a4f7a767a64d', re: /STEM activities in the North East/,
    fields: { is_rolling: true, deadline: null,
      deadline_cycle: [
        { day: 31, month: 3,  label: 'Quarterly donor consideration' },
        { day: 30, month: 6,  label: 'Quarterly donor consideration' },
        { day: 30, month: 9,  label: 'Quarterly donor consideration' },
        { day: 31, month: 12, label: 'Quarterly donor consideration' },
      ] },
    cits: { is_rolling: { snippet: 'The funding call will remain rolling until an as-yet unspecified future date.', confidence: 'high',
      source_url: 'https://www.communityfoundation.org.uk/grants/funding-for-stem-activities-in-the-north-east/' } } },

  // 84. Says it three ways in one sentence: any time, no deadlines, rolling.
  { id: '5dca172c-1c80-4f3e-9f89-0ba7f574e9a1', re: /General Grantmaking Programme/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'You can submit an application at any time, there are no deadlines.', confidence: 'high',
      source_url: 'https://29may1961charity.org.uk/how-to-apply' } } },

  // 85. Closed, and the only thing said about reopening is a floor rather than
  // a date. The prose keeps "not before" so nobody reads 1 January as a
  // promise; the parsed date is what a watcher should wake on.
  { id: 'ca27a805-4ee8-437d-9ae6-a90cc9e66739', re: /Glasspool/,
    fields: { is_rolling: false, deadline: null, next_open_date: 'Not before 2027' },
    cits: { next_open_date: { snippet: 'We do not anticipate entering into a new recruitment round before 2027.', confidence: 'high',
      source_url: 'https://www.glasspool.org.uk/' } } },

  // 86. The four windows are printed as ranges (16 Dec to 15 Mar and so on);
  // the cycle holds the window ENDS, which are the dates an application has to
  // beat to reach the next round.
  { id: 'c80591fa-fdf6-4e2d-97a5-c14020cff1bb', re: /Grants for Good/,
    fields: { is_rolling: true, deadline: null,
      deadline_cycle: [
        { day: 15, month: 3,  label: 'Application window closes' },
        { day: 15, month: 6,  label: 'Application window closes' },
        { day: 15, month: 9,  label: 'Application window closes' },
        { day: 15, month: 12, label: 'Application window closes' },
      ] },
    cits: { is_rolling: { snippet: 'You can apply all year round. Your application will be considered in the next available funding round.', confidence: 'high',
      source_url: 'https://www.matthewgoodfoundation.org/amplify-fund-grants-for-good/' } } },

  // 88. Under a heading that reads "When to apply", the whole answer is that
  // trustees meet regularly. No cut-off, so rolling — med, because the sentence
  // is about when decisions happen rather than when applications are taken.
  { id: '0266d366-dec6-4bd1-8a2f-76386846dfba', re: /Hedley Foundation/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'The Trustees meet regularly to discuss applications and to make decisions on grants.', confidence: 'med',
      source_url: 'https://www.hedleyfoundation.org.uk/apply-now' } } },

  // 89. Fixed quarterly deadlines on the 20th. Next is 20 September.
  { id: 'ce059535-b345-4642-b6d7-59fe37581025', re: /Help the Homeless/,
    fields: { deadline: '2026-09-20', is_rolling: false,
      deadline_cycle: [
        { day: 20, month: 3,  label: 'Quarterly deadline, 5pm' },
        { day: 20, month: 6,  label: 'Quarterly deadline, 5pm' },
        { day: 20, month: 9,  label: 'Quarterly deadline, 5pm' },
        { day: 20, month: 12, label: 'Quarterly deadline, 5pm' },
      ] },
    cits: { deadline: { snippet: 'The quarterly deadlines for applications for funding each year are: 5pm on 20th March/20th June/20th September/20th December.', confidence: 'high',
      source_url: 'https://www.help-the-homeless.org.uk/applying-for-funding' } } },

  // 91. Enquiry first, then an invited application form — but anyone may
  // enquire, and no cut-off is named, so this is rolling rather than invite
  // only. The board meeting three times a year is the decision point.
  { id: '356e9de1-76ae-43bd-999c-134b1567841c', re: /Heritage of London/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: 'https://www.heritageoflondon.org/grant-scheme', label: 'Grant scheme (process and board meetings), read 2026-09-06' }],
    cits: { is_rolling: { snippet: 'Grant applications are assessed and need to be approved by the Board which meets three times a year.', confidence: 'med',
      source_url: 'https://www.heritageoflondon.org/grant-scheme' } } },

  // 96. The EOI card says it outright.
  { id: 'bec586cc-4172-4d15-bb05-5fd5f24c7bb9', re: /Innovation Loans/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'There is no submission deadline', confidence: 'high',
      source_url: 'https://iuk-business-connect.org.uk/programme/innovation-loans/' } } },

  // 97. apply_url is Islington Giving's programme index, where the only dated
  // line belongs to Make it Happen — a different fund, and the kind of quote
  // that would have looked right and been wrong. The Disability Fund's own
  // page answers it.
  { id: '4f67eb88-7752-44bf-9c74-047046a80ed9', re: /Disability Fund/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: 'https://islingtongiving.org.uk/disability-fund/', label: 'Disability Fund page (no deadline, 21-day decision), read 2026-09-06' }],
    cits: { is_rolling: { snippet: 'There is no deadline, and all applications will be considered and notified of a decision within 21 days of receipt.', confidence: 'high',
      source_url: 'https://islingtongiving.org.uk/disability-fund/' } } },

  // 98. Monthly Q&A sessions, but they are optional and are not a window.
  { id: '328baf9b-67e8-4241-a641-d01263a582ad', re: /John Ellerman/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'we are open to applications year round, and you are very welcome to simply apply via our online portal at any point', confidence: 'high',
      source_url: 'https://ellerman.org.uk/apply-for-funding' } } },

  // 100. Large grants go to quarterly rounds whose dates the page does not
  // give; small grants have no window at all. Rolling is what a fundraiser can
  // act on today, and there is no cycle because no dates are published.
  { id: 'af3eed37-f766-4e08-8880-541c4c36f28b', re: /Joseph Rowntree Reform Trust/,
    fields: { is_rolling: true, deadline: null },
    cits: { is_rolling: { snippet: 'Small grants, of up to £10,000, can be applied for at any time.', confidence: 'high',
      source_url: 'https://www.jrrt.org.uk/apply-for-a-grant/' } } },
]

const REPORT: Report[] = [
  { id: 'c3718c76-0cb3-405b-901d-6c8ae11e93eb', title: 'Foundation Scotland — Community Fund', why: 'index_over_programmes',
    quote: 'Also, every fund lists a deadline for applications, and there may be more than one deadline a year.',
    url: 'https://www.foundationscotland.org.uk/apply-for-funding',
    note: 'The foundation-level row. It says in terms that the dates belong to the individual funds, several of which are separate rows in this same job (Achlachan, Beinneun, Bairdwatson, ANCBC) and have been dated from their own pages.' },
  { id: '3b836a87-fd0e-4d5c-bfdc-b44f7c793eb1', title: 'Gatsby Charitable Foundation', why: 'not_stated',
    quote: 'We identify areas of need across our six focus areas. Typically, we commission research and design interventions in partnership with sector experts.',
    url: 'https://www.gatsby.org.uk/',
    note: 'No application route of any kind on the site, let alone a date. The quote suggests the foundation commissions rather than receives applications, which if so is a scope question rather than a timing one and is left alone here.' },
  { id: 'acbff6c1-4f2f-47a7-8f98-58d0f2072410', title: 'Hatch Enterprise Business Support Programme', why: 'index_over_programmes',
    quote: 'We offer support for businesses at all levels throughout the year. If there aren\'t any programmes available that support your needs, join our waiting list to be the first to hear when our programmes launch.',
    url: 'https://hatchenterprise.org/our-programmes/',
    note: 'Launchpad, Incubator, Accelerator, Greener Southwark Accelerator and the Southwark Pioneers Fund, each with its own intake. "Applications are now open!" appears on the index without saying which programme it belongs to.' },
  { id: '71a96f39-3506-493f-8e48-b56206b175f8', title: 'Heritage and Nature Grants', why: 'invite_only',
    quote: 'The programme is not open to unsolicited applications.',
    url: 'https://www.wscf.org.uk/grants-and-support/groups/heritage-and-nature-grants/',
    note: 'An expressions-of-interest process is open now for grants to be awarded in 2026/27, but applications themselves are by invitation. Reported rather than written: the EOI is not an application and the row would read as open.' },
  { id: 'fc678f81-2c43-46f9-83e8-fe962c65b730', title: 'Historic England — Grants for Heritage', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://historicengland.org.uk/services-skills/grants/',
    note: 'HTTP 403 behind a Cloudflare interstitial.' },
  { id: 'af59412f-f54b-4909-a113-7cc5ae92657f', title: 'Horizon Europe — Cluster 2: Culture, Creativity and Inclusive Society', why: 'index_over_programmes',
    quote: 'All funding information and details on how to apply are on the Funding and Tenders portal',
    url: 'https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe/cluster-2-culture-creativity-and-inclusive-society_en',
    note: 'A cluster is a work programme covering dozens of calls, each with its own deadline on a different site. The only dates on this page are the publication dates of the work programme PDFs.' },
  { id: '550e7273-d37c-4307-8afe-dcf45b2ec5ba', title: 'Horizon Europe — Cluster 3: Civil Security for Society', why: 'index_over_programmes',
    quote: 'All funding information and details on how to apply are on the Funding and Tenders portal',
    url: 'https://research-and-innovation.ec.europa.eu/funding/funding-opportunities/funding-programmes-and-open-calls/horizon-europe/cluster-3-civil-security-society_en',
    note: 'Same page shape and same problem as Cluster 2 above.' },
  { id: 'a7540da6-3414-4feb-8a45-c0c6cbcbd0c8', title: 'Hyde Foundation Community Investment', why: 'not_stated',
    quote: 'HCT\'s annual report 2024-25 and charitable objective',
    url: 'https://www.hyde-housing.co.uk/the-hyde-group/our-social-purpose/hyde-foundation/hyde-charitable-trust/',
    note: 'Neither the foundation page nor the Hyde Charitable Trust page beneath it carries an application route or a date. Every date on both is a report or a strategy period.' },
  { id: '843e2992-bed2-4525-b29f-b48d98be2364', title: 'John Lyon\'s Charity Grants', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.jlc.london/grants/',
    note: 'HTTP 403 behind a Cloudflare interstitial.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
