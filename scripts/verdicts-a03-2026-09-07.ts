// Verdicts — pile A, batch 3, rows 31-45. Three parks, four rejects, eight holds.
//
// Six of the fifteen are duplicates of live rows, and the dedup query found
// every one. The pattern is now unmistakable and worth naming: a provider with
// several products gets one row per page somebody happened to scrape, and the
// hidden copies point at whichever page was crawled that day. Key Fund has
// eleven rows in this catalogue, seven of them live; LawWorks has three, one
// live; Microsoft has four, one live. None of that is visible from a row.
//
// The three parks are the batch's real value: all three funds are alive, closed
// today, and name the day they come back. The Robertson Trust names it to the
// day — 14 September, a week away — on a fund that has been paused since May.
//
//   npx tsx --env-file=.env.local scripts/verdicts-a03-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 3

const DORSET = 'https://www.dorsetcommunityfoundation.org/funds/neighbourhood-fund/'
const PST    = 'https://www.postcodesocietytrust.org.uk/apply-for-a-grant'
const ROB    = 'https://www.therobertsontrust.org.uk/funding/types-of-funding/large-grants/'

const ROWS: Row[] = [
  { id: '9e3b71a8-1f2c-40ea-8d03-31bcb0c82e99', re: /Horsham/, pile: 'A', verdict: 'hold',
    quote: '', url: 'https://www.horsham.gov.uk/community/grants-for-community-projects/horsham-district-council-community-grant',
    for_paul: 'HTTP 403 behind a Cloudflare interstitial, so nothing could be read today. Its amount_min and amount_max are also admin-pinned, so even a good read could not tidy them.' },

  { id: '93f38ed1-ca74-4b6f-9249-51c95a134006', re: /Jobs and Skills/, pile: 'A', verdict: 'hold',
    quote: 'Although the Greater London Authority does not manage the process of becoming a subcontractor, there are organisations which have been awarded Adult Skills Fund funding and may have subcontracting opportunities.',
    url: 'https://www.london.gov.uk/programmes-strategies/jobs-and-skills/funding',
    for_paul: 'Second GLA row in this pile pointing at a funding index rather than a fund. 287KB of site navigation, no single programme, and the closest thing to a route is a note that the GLA does not manage subcontracting. Relink to a named programme or reject.' },

  { id: '6f3892eb-3e7f-4976-b60b-8d46ca476573', re: /Key Fund/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'We invest in the community and social enterprises that have traditionally been excluded; turned down by mainstream banks and building societies.',
    url: 'https://thekeyfund.co.uk/apply/',
    for_paul: 'Duplicate of the live row b818a116, Key Fund Flexible Finance. Key Fund has eleven rows in the catalogue, seven of them live and each a named product; this one points at the shared apply page. A row with this exact apply_url (d3b226dc) has already been rejected once.' },

  { id: '27f913f2-d5d1-4773-a410-35ceb8eeba18', re: /LawWorks Clinics/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Where a not-for-profit organisation needs or thinks it may need legal assistance, we can match eligible organisations with a volunteer solicitor. The advice is given for free (pro bono).',
    url: 'https://www.lawworks.org.uk/legal-advice-not-profits/free-legal-assistance',
    for_paul: 'Duplicate of the live row a5da4678, LawWorks — Free Legal Advice for Charities. Worth noting before rejecting: the live row points at lawworks.org.uk, the bare home page, while these two hidden rows point at the pages that actually describe the service and its eligibility. Relinking the live row to one of them would be an improvement.' },
  { id: 'f44a6141-5b8f-43b8-81b0-f1d5ba0930da', re: /LawWorks Not-for-Profits/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'The Not-for-Profits Programme brokers legal advice on a wide range of legal issues to small not-for-profit organisations meeting our eligibility criteria.',
    url: 'https://www.lawworks.org.uk/legal-advice-not-profits',
    for_paul: 'Second LawWorks duplicate of a5da4678, and this is the page I would relink the live row to: it names who is helped, the two things offered, and links the eligibility criteria.' },

  { id: '5fa1e39d-b4bd-4376-a339-b72b33077a2a', re: /Leathersellers/, pile: 'A', verdict: 'hold',
    quote: 'This programme closed to expressions of interest at 5pm on Thursday 30th April 2026. 516 expressions of interest were received.',
    url: 'https://leathersellers.org/grant/charity-main-grants/',
    for_paul: 'A strong fund, now in its fifth year: four-year unrestricted grants of £20,000 to £25,000 a year for UK charities and CIOs with income of £200,000 to £2 million. This year\'s cycle is fully dated through to December 2026 decisions, and the page gives no date for the next expression-of-interest window. Hold for the 2027 dates, or park it once they appear.' },

  { id: '96c68ed0-0147-4aa1-9b4f-098a80bb7523', re: /Q Lab/, pile: 'A', verdict: 'hold',
    quote: '', url: 'https://www.macmillan.org.uk/about-us/what-we-do/macmillan-funding-grants/q-lab',
    for_paul: 'The page returns 329KB in which the readable text is almost entirely analytics tracking attributes; no programme content survives a text read. Needs a browser look.' },

  { id: '56a8cc5f-a0a2-4d6b-af11-fa60b7f0e453', re: /Microsoft 365/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Please log in or Register to access these exclusive discounts.',
    url: 'https://charitydigital.org.uk/products/',
    for_paul: 'Duplicate of the live row 571f93e2, Charity Digital Exchange — Software Donations. The specific product URL now redirects to the login-walled catalogue index, so there is no longer a page for this one subscription.' },
  // Would be a reject as a duplicate of 3c2c6766, and is a hold instead because
  // its page cannot be read: the brief says a verdict without a verbatim
  // sentence from the page is a hold, and a duplicate proved from the database
  // rather than the page has no sentence to give. Same for National Grid below.
  { id: 'f6b2ac5d-3004-452c-81e6-2d2fa32ccae3', re: /Microsoft Nonprofit Software/, pile: 'A', verdict: 'hold',
    quote: '', url: 'https://www.techsoup.uk/partners/microsoft/faqs',
    for_paul: 'Reject as a duplicate of the live row 3c2c6766, Microsoft for Nonprofits, unless you disagree — recorded as a hold only because its URL returns HTTP 200 with a 205-byte empty body (the same TechSoup shell the amounts job found), so there is no sentence from the page to cite.' },

  { id: '5afd77c4-190b-4387-9be1-46a05d8bfe7d', re: /National Grid Community Grants/, pile: 'A', verdict: 'hold',
    quote: '', url: 'https://www.nationalgrid.com/community-grants',
    for_paul: 'Reject as a duplicate of the live row 057225d1, Community Grant Programme (National Grid Electricity Transmission), unless you disagree — recorded as a hold because both National Grid URLs sit behind the same Cloudflare 403 and neither could be read today.' },

  { id: '45d5140a-8536-4331-b4d3-57462e108a9f', re: /Nationwide Foundation/, pile: 'A', verdict: 'hold',
    quote: 'From local neighbourhoods to Parliament, we are making a difference by demonstrating what good housing looks like, generating compelling evidence for decision makers and putting people and home at the heart of everything we do.',
    url: 'https://nationwidefoundation.org.uk/',
    for_paul: 'apply_url is the foundation home page, which describes its housing strategy and names no programme, no route and no figure. A home page cannot carry a complete brief. Relink to a named programme if one is open, or reject.' },

  // The three parks.
  { id: 'ded31718-e5bd-4062-b1cd-2ddf5baa47dc', re: /Neighbourhood Fund/, pile: 'A', verdict: 'park',
    quote: 'The winter Round opens for applications on 23rd November and the deadline to apply is midday, 11th January.',
    url: DORSET,
    fields: { next_open_date: '23 November 2026', next_open_date_parsed: '2026-11-23', is_rolling: false },
    cits: { next_open_date: { snippet: 'The winter Round opens for applications on 23rd November and the deadline to apply is midday, 11th January.', confidence: 'high', source_url: DORSET } } },

  { id: '08a08c30-453d-469f-9ce2-65a2dafbe0d8', re: /Peter Kershaw/, pile: 'A', verdict: 'hold',
    quote: '', url: 'https://peterkershawtrust.org/ordinary-grants',
    for_paul: 'The page returns 1MB and nothing about eligibility, amounts or dates survives a text read. Needs a browser look.' },

  { id: 'ec676c7f-93b3-404c-aaf9-7bb1ec71b83b', re: /Postcode Society Trust/, pile: 'A', verdict: 'park',
    quote: 'Our funding rounds for 2026 are now closed. Funding rounds for 2027 will be published in the new year.',
    url: PST,
    fields: { next_open_date: 'Early 2027', next_open_date_parsed: '2027-01-01', is_rolling: false },
    cits: { next_open_date: { snippet: 'Our funding rounds for 2026 are now closed. Funding rounds for 2027 will be published in the new year.', confidence: 'med', source_url: PST } } },

  { id: '6e6d726e-0b1b-41bb-a282-2eb5c3853ac6', re: /Robertson Trust/, pile: 'A', verdict: 'park',
    quote: 'We are pleased to announce that we will re-open our Large Grants fund on Monday, 14th September 2026.',
    url: ROB,
    fields: { next_open_date: '14 September 2026', next_open_date_parsed: '2026-09-14', is_rolling: false },
    cits: { next_open_date: { snippet: 'We are pleased to announce that we will re-open our Large Grants fund on Monday, 14th September 2026.', confidence: 'high', source_url: ROB } } },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'A', rows: ROWS, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
