// Verdicts — pile B, batch 7, rows 151-175. No publish this batch: nine
// park, two reject, fourteen hold.
//
// Three park rows write next_open_date instead of deadline because deadline
// itself is admin-pinned (The Charity Service, The Elephant Trust, Theatres
// Trust Small Grants) — the same information, routed around the pin rather
// than attempted against it and refused.
//
// One genuinely reopened row cannot be helped at all: SSE's Social
// Investment Gateway Programme has a real round 2 with a 6 November 2026
// deadline, but eighteen of its roughly nineteen fields are admin-held, so
// there is nothing left to write. Flagged for Paul as a live opportunity a
// pin is hiding, the mirror image of the "hidden despite matching" class
// from earlier batches.
//
// Two rows read as open on first glance but the live text is stale: TiE
// Women Program 2026 carries both a "Now Accepting Applications" hero banner
// and an "Applications closed for 2026" badge on the same page — the closed
// badge is the one that agrees with the passed deadline. The Leeds Digital
// Inclusion Fund's apply_url now serves a 2022 news item describing a
// one-off £50,000 pot already paid out to five named organisations, not a
// recurring grant — not a 404, so not a clean dead_url reject, held instead.
//
//   npx tsx --env-file=.env.local scripts/verdicts-b07-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 7

const ROWS: Row[] = [
  { id: '471c6f5f-3bab-4cd1-b472-a1807f991c10', re: /Somerset Crisis and Resilience Alliance/, pile: 'B', verdict: 'hold',
    quote: 'You must submit your EOI by 5pm on Friday 4 September 2026. We may reopen for further EOIs at a later date, but only if we do not identify enough suitable partners during this window.',
    url: 'https://www.somersetcf.org.uk/grants-funding/details/somerset-crisis-and-resilience-alliance/',
    for_paul: 'EOI window closed 4 September; reopening is conditional on unmet partner numbers, not a stated date.' },

  { id: '00a0ee02-a053-4225-9283-5c13278a17e1', re: /Somerset Older People.s Fund/, pile: 'B', verdict: 'hold',
    quote: 'Closed. Expected to re-open: N/A',
    url: 'https://www.somersetcf.org.uk/grants-funding/details/somerset-older-peoples-fund/',
    for_paul: 'Closed, own page states no reopening date at all.' },

  { id: '4c5b51d6-8da6-4bba-875c-61085bbb1f0f', re: /Somerset Social Investment Programme/, pile: 'B', verdict: 'hold',
    quote: 'Apply by: Friday 21 August 2026',
    url: 'https://www.somersetcf.org.uk/grants-funding/details/somerset-social-investment-programme/',
    for_paul: 'Stated deadline has passed with no closed banner or next round named.' },

  // 154. Park. Monthly trustee cycle, nothing pinned.
  { id: 'be7faf98-fdd3-48ad-ac98-bf05fafe26c3', re: /Souter Charitable Trust/, pile: 'B', verdict: 'park',
    quote: 'Grant applications must be submitted by close of business on Wednesday 23rd September 2026 to be considered at the next Trustees\' meeting which is scheduled for Wednesday 30th September 2026.',
    url: 'https://www.soutercharitabletrust.org.uk/how-to-apply/',
    fields: { deadline: '2026-09-23', is_rolling: false },
    cits: { deadline: { snippet: 'Grant applications must be submitted by close of business on Wednesday 23rd September 2026 to be considered at the next Trustees\' meeting which is scheduled for Wednesday 30th September 2026.', confidence: 'high', source_url: 'https://www.soutercharitabletrust.org.uk/how-to-apply/' } } },

  // 155. Park. Twice-yearly fixed cycle (1 April / 1 September), nothing
  // pinned; today\'s 1 September deadline has passed so the next is 1 April
  // 2027.
  { id: 'f1fdcd6e-152a-403f-a1ac-f7838fbe9ebc', re: /sportscotland/, pile: 'B', verdict: 'park',
    quote: 'Deadlines for submission of Sport Facilities Fund applications are 5pm on the 1st April and 1st September each year.',
    url: 'https://sportscotland.org.uk/funding/sport-facilities-fund',
    fields: { deadline: '2027-04-01', is_rolling: false },
    cits: { deadline: { snippet: 'Deadlines for submission of Sport Facilities Fund applications are 5pm on the 1st April and 1st September each year.', confidence: 'high', source_url: 'https://sportscotland.org.uk/funding/sport-facilities-fund' } } },

  { id: '5b3ee9d2-efea-43ca-b4e6-94005e070a09', re: /SSE Social Investment Gateway Programme/, pile: 'B', verdict: 'hold',
    quote: 'Applications to round 1 are now closed. Please register your interest in round 2 of the programme (March 2027 – February 2028). Deadline: November 6, 2026.',
    url: 'https://www.the-sse.org/programme/social-investment-gateway-programme/',
    for_paul: 'Genuinely reopened, round 2 deadline 6 November 2026, but eighteen of the row\'s fields are admin-held, so nothing here can actually be written — a live opportunity a pin is hiding.' },

  { id: 'ba777964-c525-42f2-9a9c-4708ea748470', re: /Sterry Family Foundation/, pile: 'B', verdict: 'hold',
    quote: 'No Min - £3,000 / no deadline',
    url: 'https://youngcamdenfoundation.org.uk/funding/sterry-family-foundation',
    for_paul: 'The fund\'s own info box says "no deadline," but the page itself is marked "last updated on 1 Sept 2025" — a year-stale self-report on the same sibling-template site flagged in earlier batches, not trusted at face value here.' },

  { id: 'dc4ae90b-7c65-4671-950b-43ccfb0315f6', re: /Strathnairn Community Benefit Fund/, pile: 'B', verdict: 'hold',
    quote: 'The Board generally meets the last Thursday of each month (with the exception of July & December). Application deadlines are set two weeks before the scheduled board meetings.',
    url: 'https://strathnairncbf.com/community-group-applications/',
    for_paul: 'Genuinely rolling, monthly board cycle, but neither this page nor the Grants Strategy page states an award amount or exclusions for the General Grant specifically — not enough for the full brief a publish needs.' },

  // 159. Park. A named future season, nothing pinned.
  { id: 'bad7f78e-e3ee-4b67-8469-01572928b106', re: /Supporting Change - Carers/, pile: 'B', verdict: 'park',
    quote: 'Supporting Carers is now closed to new applications. It will re-open in early 2027 for a new round of applications.',
    url: 'https://www.tnlcommunityfund.org.uk/funding/funding-programmes/supporting-change-carers',
    fields: { next_open_date: 'early 2027', next_open_date_parsed: '2027-01-01', deadline: null, is_rolling: false },
    cits: { next_open_date: { snippet: 'Supporting Carers is now closed to new applications. It will re-open in early 2027 for a new round of applications.', confidence: 'high', source_url: 'https://www.tnlcommunityfund.org.uk/funding/funding-programmes/supporting-change-carers' } } },

  // 160. Park. Monthly £500 micro-grant, only funder_type pinned.
  { id: 'a3107c21-e079-4291-95f4-fd4c45c77108', re: /The Awesome Foundation/, pile: 'B', verdict: 'park',
    quote: 'NEXT DEADLINE: 9th September 2026',
    url: 'https://www.awesomefoundation.org/en/chapters/glasgow',
    fields: { deadline: '2026-09-09', is_rolling: false },
    cits: { deadline: { snippet: 'NEXT DEADLINE: 9th September 2026', confidence: 'high', source_url: 'https://www.awesomefoundation.org/en/chapters/glasgow' } } },

  // 161. Park via next_open_date: deadline itself is pinned, so the same
  // information is written to the field that isn\'t.
  { id: '5fcc772f-482b-44d2-9afb-ff0c147266aa', re: /The Charity Service/, pile: 'B', verdict: 'park',
    quote: '4.00pm on Friday 9th October 2026 / Friday 30th October 2026 (Grant Committee Meeting)',
    url: 'https://charityservice.org.uk/for-grant-applicants/',
    fields: { next_open_date: '9 October 2026 (deadline; committee meets 30 October 2026)', next_open_date_parsed: '2026-10-09' },
    cits: { next_open_date: { snippet: '4.00pm on Friday 9th October 2026 ... Friday 30th October 2026', confidence: 'high', source_url: 'https://charityservice.org.uk/for-grant-applicants/' } } },

  { id: 'ba0561c6-155c-4d34-b4c1-70ace3a68b68', re: /The Democratic Engagement Fund/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/the-democratic-engagement-fund-1' },

  // 163. Park via next_open_date: deadline is pinned.
  { id: '34c4a433-9149-4676-acad-7fe0585e96bf', re: /The Elephant Trust/, pile: 'B', verdict: 'park',
    quote: 'The next round opens on 18 September 2026, with a deadline of 18 October 2026.',
    url: 'https://elephanttrust.org.uk/apply/',
    fields: { next_open_date: '18 September 2026 (deadline 18 October 2026)', next_open_date_parsed: '2026-09-18' },
    cits: { next_open_date: { snippet: 'The next round opens on 18 September 2026, with a deadline of 18 October 2026.', confidence: 'high', source_url: 'https://elephanttrust.org.uk/apply/' } } },

  // 164. Park. Only eligible_structures pinned; deadline is free.
  { id: 'f47db5b5-af42-49c5-b807-ce993c3bd9fc', re: /The Homity Trust/, pile: 'B', verdict: 'park',
    quote: 'Our next funding round is the Winter one, with a strict application deadline of 10th December 2026.',
    url: 'https://www.homity.co.uk/',
    fields: { deadline: '2026-12-10', is_rolling: false },
    cits: { deadline: { snippet: 'Our next funding round is the Winter one, with a strict application deadline of 10th December 2026.', confidence: 'high', source_url: 'https://www.homity.co.uk/' } } },

  { id: 'cd0828b8-86de-4690-87f1-a866bafcb3bd', re: /The Leeds Digital Inclusion Fund/, pile: 'B', verdict: 'hold',
    quote: 'In total, £50,000 was invested through the programme in the summer of 2022. 5 Community Organisations each received £10,000 for their work.',
    url: 'https://www.leedscf.org.uk/the-leeds-digital-inclusion-fund-2022/',
    for_paul: 'The apply_url now serves a 2022 news item: a one-off pot already paid out to five named organisations, not a recurring grant. Loads fine (200), so not a clean dead_url reject — a judgement call for Paul.' },

  { id: 'a54704d3-3cb0-40b3-a351-1c07b3346355', re: /The LEGO Foundation Fellowship/, pile: 'B', verdict: 'hold',
    quote: '', url: 'https://www.ssrc.org/programs/the-lego-foundation-fellowship/application-details/',
    for_paul: 'Page returns 403 (bot-walled); deadline, amount and structure fields are admin-pinned regardless.' },

  { id: '876a5299-1b0b-4f07-9bb1-b9c7e36257e1', re: /The Mayor.s Opportunity Fund/, pile: 'B', verdict: 'hold',
    quote: 'Mayor\'s Opportunity Fund opens third round of funding to support older adults across the North East',
    url: 'https://www.communityfoundation.org.uk/grants/the-mayors-opportunity-fund/',
    for_paul: 'apply_url 404s, but the fund is real and recurring — three rounds have run this year per the funder\'s own news search — a relink candidate rather than a dead fund. Most fields are pinned regardless.' },

  // 168. Park. Twice-yearly Jan/June sessions; deadline itself is free.
  { id: '8599b462-b313-468f-b2c6-72fc0f6c144b', re: /The Maypole Fund/, pile: 'B', verdict: 'park',
    quote: 'The Maypole Fund has two funding sessions each year. The submission deadlines for each of these sessions are at the end of January and June of each year, and we accept applications in the month leading up to the submission deadline.',
    url: 'https://www.maypolefund.org/deadlines/',
    fields: { deadline: '2027-01-31', is_rolling: false },
    cits: { deadline: { snippet: 'The submission deadlines for each of these sessions are at the end of January and June of each year.', confidence: 'high', source_url: 'https://www.maypolefund.org/deadlines/' } } },

  { id: 'fb63af5d-9b6a-4830-afec-27fe74e02d77', re: /The NextGen Fund/, pile: 'B', verdict: 'hold',
    quote: 'The latest round of the NextGen Fund, in partnership with Forever Manchester, is NOW CLOSED to applications. The deadline to apply was midday on Thursday the 28th of May 2026.',
    url: 'https://forevermanchester.com/fund/the-nextgen-fund/',
    for_paul: 'Closed, no next round named.' },

  { id: '7f128498-e43b-4578-975a-f1186854bae9', re: /The Pargiter Trust Fund/, pile: 'B', verdict: 'hold',
    quote: 'Closing Date: 31/08/2026',
    url: 'https://www.communityfoundation.org.uk/grants/supporting-people-aged-over-65-to-be-independent-healthy-and-socially-included/',
    for_paul: 'Confirms the deadline the row already holds; decisions due late November, no next round stated.' },

  { id: '2b7a6194-4be6-4626-a2dd-d92b2d6b440c', re: /The Ringtons Fund/, pile: 'B', verdict: 'hold',
    quote: 'Ringtons Fund marks 30 years of supporting North East Communities',
    url: 'https://www.communityfoundation.org.uk/apply/',
    for_paul: 'apply_url is the funder\'s generic apply hub with no fund-specific detail; the fund itself is confirmed real (30 years running) via the funder\'s own search, but no current deadline could be found.' },

  // 172. Park via next_open_date: virtually every other field is admin-held.
  { id: 'cdf67967-4f45-4b42-abcf-ca25b071a257', re: /Theatres Trust Small Grants Programme/, pile: 'B', verdict: 'park',
    quote: 'Applications for Round 11 of the Small Grants Programme are now closed. Round 12 will open for applications later this year with updated guidance. The deadline for applications will be in January 2027.',
    url: 'https://www.theatrestrust.org.uk/smallgrants',
    fields: { next_open_date: 'January 2027 (Round 12 deadline; opening date not yet announced)', next_open_date_parsed: '2027-01-01' },
    cits: { next_open_date: { snippet: 'Round 12 will open for applications later this year with updated guidance. The deadline for applications will be in January 2027.', confidence: 'high', source_url: 'https://www.theatrestrust.org.uk/smallgrants' } } },

  { id: 'a1f5fc6e-08ca-4ef2-8c74-8cf5efbcc565', re: /TiE Women Program 2026/, pile: 'B', verdict: 'hold',
    quote: 'Applications closed for 2026',
    url: 'https://www.tiewomen.org/',
    for_paul: 'A stale "Now Accepting Applications" banner sits alongside this closed badge on the same page; the 30 June 2026 deadline has passed, and the closed badge is the one that agrees with it. Also a pitch competition for individual women founders, not organisations — an audience question. Everything is admin-held regardless.' },

  { id: 'a64ef55b-1003-4d53-bdd3-eaa49835a798', re: /Tobacco and Vapes Implementation Grant/, pile: 'B', verdict: 'reject', code: 'dead_url',
    quote: 'Page not found. If you typed the web address, check it is correct.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/tobacco-and-vapes-implementation-grant-1' },

  { id: '984ce6c8-50ff-4355-a40f-ce98008c35ad', re: /Together for Service/, pile: 'B', verdict: 'hold',
    quote: 'This programme is now closed – the resources below are provided for reference only.',
    url: 'https://covenantfund.org.uk/programme/together-for-service-families-place-based-grants-programme/',
    for_paul: 'Listed under the funder\'s own "Closed Programmes" heading, same shape as Reducing Veteran Homelessness in batch 6. No reopening mentioned; most fields pinned regardless.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'B', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
