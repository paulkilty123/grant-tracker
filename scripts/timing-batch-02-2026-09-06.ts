// Timing on 187 live rows — batch 2 (rows 21-40).
//
// Seven written, thirteen reported. The thin yield is honest: this stretch of
// the alphabet is heavy with funder-level index pages (Bedfordshire & Luton,
// Gulbenkian, Cash for Kids) and with in-kind services that have no round at
// all (Charity Digital, CITA, ASTOP's neighbours). None of them states timing,
// and an index page that lists eight funds cannot be given one date.
//
// Two rows were nearly reported and are written because a second page on the
// same site said the thing plainly:
//   Bernard Sunley  the social-welfare page renders its grant table in
//                   JavaScript and reads as empty. /our-grant-giving/ says
//                   "We accept grant applications all year round."
//   Charles Hayward the home page says CURRENTLY CLOSED, but that belongs to
//                   the Heritage & Conservation category. Social & Criminal
//                   Justice and Overseas have a deadline of 18 September.
// The lesson from batch 1 keeps paying: read one page further before writing
// "the page says nothing".
//
// Also here: a follow-up on Active Spaces Fund from batch 1. It is rolling at
// stage one and dated at stage two; the checker read the stage-two list and
// contradicted the rolling flag. Both are true, so the four dated rounds go
// into deadline_cycle alongside the rolling flag. No count change.
//
//   npx tsx --env-file=.env.local scripts/timing-batch-02-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 2

const ROWS: Row[] = [
  // 23. Three rounds in 2026 (25 May, 24 Aug, 9 Nov), each followed by a panel
  // meeting; the panel dates are the ones that look like deadlines in a naive
  // read of the key-dates block and are not. Next deadline is 9 November.
  { id: 'd83e1ad9-b8d5-4367-8a26-0fed8b5698f4', re: /Beinneun/,
    fields: { deadline: '2026-11-09', is_rolling: false },
    cits: { deadline: { snippet: '9th Nov 2026', confidence: 'high',
      source_url: 'https://foundationscotland.org.uk/beinneun-community' } } },

  // 24. Written off the foundation's grants overview, not the social-welfare
  // page in apply_url, which is a client-rendered table and reads as blank.
  { id: 'c51eaae1-2007-4930-a45a-4da9f7542c1c', re: /Bernard Sunley/,
    fields: { is_rolling: true, deadline: null },
    sources: [{ url: 'https://bernardsunley.org/our-grant-giving/', label: 'Grants overview (applications all year round), read 2026-09-06' }],
    cits: { is_rolling: { snippet: 'We accept grant applications all year round.', confidence: 'high',
      source_url: 'https://bernardsunley.org/our-grant-giving/' } } },

  // 26. The 2025-27 round has been awarded; the row is the 2027-29 fund, which
  // is not open yet. Season rather than month, so next_open_date_parsed comes
  // from parseOpenDate — autumn 2026 rounds down to 1 September.
  //
  // next_open_date holds the reopening clause alone, not the funder's whole
  // sentence: the sentence names 2027 and 2029 before it names 2026, and
  // parseOpenDate takes the first year it sees, so the full sentence parsed to
  // 2027-09-01 — a year late, silently. The whole sentence is in the citation.
  { id: 'a9364402-f2a3-45b0-bf80-d33d9e5efdf5', re: /Community Catalyst Fund/,
    fields: { is_rolling: false, deadline: null,
      next_open_date: 'Expected to be open to application in the autumn of 2026' },
    cits: { next_open_date: { snippet: 'The Community Catalyst Fund 2027 to 2029 is expected to be open to application in the autumn of 2026.', confidence: 'high',
      source_url: 'https://www.brighton-hove.gov.uk/people-and-communities/community-support-and-grants/community-catalyst-fund' } } },

  // 28. The guidelines page in apply_url carries no dates; the round page does.
  { id: '0346c786-fb9c-4df9-9307-205a4337acab', re: /Taylor 1984 Trust/,
    fields: { deadline: '2026-09-16', is_rolling: false },
    sources: [{ url: 'http://www.cbandhhtaylortrust.com/applications-for-autumn-2026', label: 'Autumn 2026 round (deadline), read 2026-09-06' }],
    cits: { deadline: { snippet: 'Please submit your application before 12pm (midday) on Wednesday 16th September 2026 for consideration in this grant round.', confidence: 'high',
      source_url: 'http://www.cbandhhtaylortrust.com/applications-for-autumn-2026' } } },

  // 33. Three trustee meetings a year; meeting 3's deadline is 23 October. The
  // dates are Fridays and move year to year, so there is no cycle to capture.
  { id: 'ff1e6699-e169-4f34-89f6-3742137b2394', re: /Charitable Grants|Turner/,
    fields: { deadline: '2026-10-23', is_rolling: false },
    sources: [{ url: 'https://www.turnertrust.co.uk/grant-deadlines/', label: 'Grant deadlines (2026 meeting dates), read 2026-09-06' }],
    cits: { deadline: { snippet: 'Friday 23rd October 2026', confidence: 'high',
      source_url: 'https://www.turnertrust.co.uk/grant-deadlines/' } } },

  // 37. Four categories on different timetables. Older People and Heritage &
  // Conservation are closed; Social & Criminal Justice and Overseas take
  // applications to fixed deadlines, the next being 18 September.
  { id: '94b70915-331b-48ef-8d4e-094881d3812a', re: /Charles Hayward/,
    fields: { deadline: '2026-09-18', is_rolling: false },
    sources: [{ url: 'https://charleshaywardfoundation.org.uk/our-process-when-to-apply/', label: 'Our process and when to apply (deadlines per category), read 2026-09-06' }],
    cits: { deadline: { snippet: '18 September 2026', confidence: 'high',
      source_url: 'https://charleshaywardfoundation.org.uk/our-process-when-to-apply/' } } },

  // 39. Four programmes on different timetables. The one open to grant
  // applications today is Climate & Environmental Justice Round One, closing
  // 8 September. The page's "Rolling — apply at any time" belongs to the
  // Social Investment Fund, a different product, and is not used here: the row
  // is a grant row and that sentence would be a quote that does not say the
  // thing about it.
  { id: 'd29103be-5800-4beb-920f-205b48a78e78', re: /City Bridge Foundation/,
    fields: { deadline: '2026-09-08', is_rolling: false },
    cits: { deadline: { snippet: '12 noon on Tuesday, 8 September 2026', confidence: 'high',
      source_url: 'https://www.citybridgefoundation.org.uk/funding' } } },

  // Batch 1 follow-up, no count change: rolling at stage one, four dated
  // rounds at stage two.
  { id: '32e9cb1d-4e0d-4554-a4c3-569bc4e0b9fb', re: /Active Spaces/,
    fields: { is_rolling: true,
      deadline_cycle: [
        { day: 23, month: 9, label: 'Stage two round (full application)' },
        { day: 6,  month: 1, label: 'Stage two round (full application)' },
        { day: 24, month: 3, label: 'Stage two round (full application)' },
        { day: 7,  month: 7, label: 'Stage two round (full application)' },
      ] },
    cits: { is_rolling: { snippet: 'You can submit an EOI at any time throughout the year.', confidence: 'high',
      source_url: 'https://www.londonmarathonfoundation.org/active-spaces-fund' } } },
]

const REPORT: Report[] = [
  { id: '9891bd8a-798b-4c2c-98d5-f25ba9b10faf', title: 'BE:IMPACT Prize 2026', why: 'unreadable',
    quote: 'Loading content...', url: 'https://blueearthsummit.com/impact-prize',
    note: '300KB of JavaScript and two "Loading content..." placeholders. Nothing about the prize renders without a browser.' },
  { id: '5373485f-109c-4ef7-9af1-c59312bbc63f', title: 'Bedfordshire & Luton Community Foundation — Community Grants', why: 'index_over_programmes',
    quote: 'You can find all our funds in the grants section on our website. Each has its own criteria document and application form.',
    url: 'https://blcf.org.uk/apply-for-a-grant/',
    note: 'Funder-level row over roughly a dozen named funds on separate timetables. The apply page states no date for any of them.' },
  { id: '9e714a60-a849-409f-8f52-0394b8c2fbb4', title: 'Black Founders Programme', why: 'not_stated',
    quote: 'If you are interested in updates and news about the Black Founders Programme, fill out the short form below.',
    url: 'https://www.digicatapult.org.uk/programmes/programme/black-founders-programme/',
    note: 'An accelerator that runs in cohorts; the page describes the 2025 cohort and offers a mailing list, and names no application window.' },
  { id: '87805cc2-c24b-4562-9a2b-129559fcdf9f', title: 'Buttle UK — Chances for Children Grants', why: 'not_stated',
    quote: 'Make sure to submit your application only when you have time to speak with us.',
    url: 'https://buttleuk.org/grants/faqs/',
    note: 'Criteria page, grants page and FAQs all say when in a child\'s circumstances to apply and never when in the year.' },
  { id: 'b12c394d-346d-4246-a254-06ca5bbadd08', title: 'Calouste Gulbenkian Foundation UK Branch — Grants', why: 'not_stated',
    quote: 'The UK Branch aims to strengthen arts and civil society ecosystems by supporting transnational exchange, reciprocal capacity development and knowledge sharing between Portugal and the UK.',
    url: 'https://gulbenkian.pt/uk-branch/our-work/our-grant-making/',
    note: 'The page carries no sentence about timing at all, so the quote is the closest thing to one: what the branch funds, with no word on when. Last updated 18 December 2025.' },
  { id: '856cbdaf-7e60-4c78-8ad2-e7c0b6fddbd8', title: 'Camden Climate Fund', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.camden.gov.uk/camden-climate-fund',
    note: 'HTTP 403 behind a Cloudflare interstitial.' },
  { id: '88259250-6936-41d6-b60d-83aa880917ba', title: 'Camden Council - Family-Friendly and Inclusive Evenings Grant Scheme', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.camden.gov.uk/family-friendly-evenings',
    note: 'HTTP 403 behind a Cloudflare interstitial. Same host as the Camden Climate Fund row; both need a browser.' },
  { id: '91737208-0bd3-45c4-8866-ec6256e85a58', title: 'Cash for Kids - Cost of Living Grants', why: 'index_over_programmes',
    quote: 'As our ability to grant depends on the donations we receive, application forms will close when we reach capacity – so may not be available for all areas at all times.',
    url: 'https://cashforkids.org.uk/grants/',
    note: 'Neither dated nor rolling: forms open and shut by area as money allows, and the page will not say when for any of them.' },
  { id: '571f93e2-d0b5-41d7-adf1-d36b3a039ec6', title: 'Charity Digital Exchange — Software Donations', why: 'not_stated',
    quote: 'Please log in or Register to access these exclusive discounts.',
    url: 'https://charitydigital.org.uk/products',
    note: 'A login-walled catalogue of donated software rather than a round. No window stated on the public side.' },
  { id: '99a71fd2-fccc-4947-a4fd-4fdd81b58bd0', title: 'Charity Digital Skills Programme', why: 'not_stated',
    quote: 'Your destination for trusted technology, exclusive discounts and great deals. Keep up with our latest offers by signing up here.',
    url: 'https://charitydigital.org.uk/',
    note: 'apply_url is the site home page. It carries webinar and event dates, none of which is an application window for this row.' },
  { id: '75990799-a1a4-490e-a651-90f3147ec669', title: 'Charity IT Association (CITA) — Tech Volunteers', why: 'not_stated',
    quote: 'CITA provides charities with access to affordable, trustworthy, and independent technology professionals to enable their strategic mission through technology.',
    url: 'https://www.cita.org.uk/',
    note: 'A volunteer-matching service with no round and no stated window.' },
  { id: 'c6800212-145e-47f7-9879-42f8a891f057', title: 'City & Guilds Foundation — Local Community Skills Fund', why: 'closed_no_date',
    quote: 'Expressions of Interest are currently closed. Sign up to our newsletter to hear about future rounds.',
    url: 'https://cityandguildsfoundation.org/what-we-offer/funding/local-community-skills-fund/',
    note: 'The page also says "We aim to open our community grants programme at regular intervals throughout the year", which is an intention rather than a date, so nothing is written.' },
  { id: '014ccbcd-cd35-4447-8467-d25fb34db0d2', title: 'Civitates — Pooled Fund for European Democracy', why: 'not_stated',
    quote: 'Sign up for news, updates from our grantee partners and calls for proposals.',
    url: 'https://civitates-eu.org/',
    note: 'Grants go out in calls for proposals; no call is open on the site and no next one is dated.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
