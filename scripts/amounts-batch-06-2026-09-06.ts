// Amounts on 176 live rows — batch 6 (rows 101-120). Three column writes, seventeen reported.
//
// All three writes are the same figure on three sibling trusts. People's
// Postcode Trust, Postcode Neighbourhood Trust and Postcode Places Trust run
// identical funding guides — the overview pages are byte-for-byte the same
// sentences — and all three state "You can apply for up to £50,000 in total
// over the three years". Their apply-for-a-grant pages, which are what
// apply_url points at on all three rows, are 20KB and carry no figure at all.
// One hop, three rows, and it is the fourth time in this job that the number
// was a link away from the page the row points at.
//
// The three carry a second condition that is NOT written: "Your request must
// be no more than 75% of your annual income". A charity with £30,000 income can
// ask for £22,500, not £50,000. That is a percentage of the applicant's income,
// which the brief excludes from the columns for the same reason as Mohn
// Westlake, so the ceiling goes in the column and the cap goes in prose.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-06-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 6

const SNIP = 'You can apply for up to £50,000 in total over the three years, depending on your organisation\'s income'
const PROSE = 'Up to £50,000 in total over three years, with no more than 50% taken in any one year. Two further limits apply: the request may be no more than 75% of the organisation\'s annual income, and applicants need an annual income between £10,000 and £1 million.'
const guide = (host: string) => `https://www.${host}/funding-guide/overview`

const ROWS: Row[] = [
  { id: '348351e9-432d-45f4-a51a-9763ef4bfd6d', re: /People's Postcode Trust/,
    fields: { amount_max: 50000 },
    sources: [{ url: guide('postcodetrust.org.uk'), label: 'Funding guide overview (grant ceiling), read 2026-09-06' }],
    cits: { amount_max: { snippet: SNIP, confidence: 'high', source_url: guide('postcodetrust.org.uk') } },
    typical_award: PROSE,
    typical_award_cit: { snippet: SNIP, confidence: 'high', source_url: guide('postcodetrust.org.uk') } },
  { id: '7f9dfb2d-b9f0-4e5f-8d6b-2fd30a1a2984', re: /Postcode Neighbourhood Trust/,
    fields: { amount_max: 50000 },
    sources: [{ url: guide('postcodeneighbourhoodtrust.org.uk'), label: 'Funding guide overview (grant ceiling), read 2026-09-06' }],
    cits: { amount_max: { snippet: SNIP, confidence: 'high', source_url: guide('postcodeneighbourhoodtrust.org.uk') } },
    typical_award: PROSE,
    typical_award_cit: { snippet: SNIP, confidence: 'high', source_url: guide('postcodeneighbourhoodtrust.org.uk') } },
  { id: '0c6e62c9-7eab-4494-8cb4-f3801a36c8e7', re: /Postcode Places Trust/,
    fields: { amount_max: 50000 },
    sources: [{ url: guide('postcodeplacestrust.org.uk'), label: 'Funding guide overview (grant ceiling), read 2026-09-06' }],
    cits: { amount_max: { snippet: SNIP, confidence: 'high', source_url: guide('postcodeplacestrust.org.uk') } },
    typical_award: PROSE,
    typical_award_cit: { snippet: SNIP, confidence: 'high', source_url: guide('postcodeplacestrust.org.uk') } },
]

const REPORT: Report[] = [
  { id: 'af62f99d-c5c0-44bf-a653-27bdc8a69081', title: 'Music Venue Trust Liveline Fund', why: 'not_stated',
    quote: 'Supports individual shows or a tour by covering up to 80% of losses.',
    url: 'https://livelinefund.uk/funding-overview',
    note: 'The fund underwrites a percentage of a show\'s losses, so what an applicant receives depends entirely on what they lose. A percentage of cost, which the brief excludes, and no cap stated alongside it.' },
  { id: '469b52bf-f8b9-4b4a-b8cd-54789928562e', title: 'National Digital Inclusion Network membership', why: 'not_stated',
    quote: 'The National Digital Inclusion Network is designed for organisations.',
    url: 'https://www.goodthingsfoundation.org/network',
    note: 'Free membership giving access to devices, data and training. No figure and no money passing to the member.' },
  { id: '0ebb775d-0ff1-44cd-880b-5853f73b060f', title: 'NCVO Learning & Development Programmes', why: 'unreadable',
    quote: '', url: 'https://www.ncvo.org.uk/training-events/',
    note: 'The host did not answer on repeated attempts, the same shape as the Weavers\' Company in the timing job. Nothing came back at all, so this is unread rather than silent.' },
  { id: 'd5da3c99-fdf2-4a8d-9778-ff5935fb747c', title: 'Neighbourly — Surplus Food, Product Donations and Corporate Grant Funds', why: 'unreadable',
    quote: 'A new version of Neighbourly was detected, we need to refresh the page before you can continue.',
    url: 'https://www.neighbourly.com/goodcause/new',
    note: 'A JavaScript application that renders nothing without a browser. The timing job hit the same wall on Neighbourly pages linked from the B&Q Foundation row.' },
  { id: 'f7e51198-d22b-484a-bec3-aadbe08fb748', title: 'Network Membership (StreetGames)', why: 'pot_only',
    quote: 'Direct Investment: In 2024/25, £9.84 million was passed through StreetGames to 515 community partners.',
    url: 'https://www.streetgames.org/partner-with-us/join-the-network/',
    note: 'Membership is free and money reaches partners through StreetGames\' own programmes rather than as an award applied for here. The £9.84 million is the whole flow across 515 partners. Amount columns admin-pinned; the funder_brief already carries this sentence from the 5 September pass.' },
  { id: 'b9529231-32c7-4260-a38a-f498fb13596f', title: 'NFU Mutual Charitable Trust — December 2026 Funding Round', why: 'not_stated',
    quote: 'Applications for Funding | Charitable Trust | NFU Mutual',
    url: 'https://www.nfumutual.co.uk/about-us/charitable-trust/applications-for-funding/',
    note: 'A 153KB insurer page whose applications section carries no pound sign anywhere in the rendered text.' },
  { id: 'fc84cf7f-1b48-4f28-86dd-71de69cd3354', title: 'NHS Charities Together — Community Grants', why: 'pot_only',
    quote: 'In 2024 we awarded £426,000 to projects led by ambulance charities with a focus on community responses to out-of-hospital cardiac arrest.',
    url: 'https://nhscharitiestogether.co.uk/about-us/our-programmes/',
    note: 'Two programme totals on the page, £2.7 million distributed through the Greener Communities Fund and £426,000 across ambulance charity projects, and no per-applicant figure. Grants reach charities through member NHS charities rather than an open call here.' },
  { id: '6e334966-0173-4437-9a44-19955c2a2ba6', title: 'Oglesby Charitable Trust', why: 'not_stated',
    quote: 'Our Approach - The Oglesby Charitable Trust',
    url: 'https://oglesbycharitabletrust.org.uk/our-approach/',
    note: 'A 50KB approach page with no pound sign in the rendered text.' },
  { id: '57c520fd-c715-478b-8a6e-7c9907044d2a', title: 'Older People and Housing Programme', why: 'pot_only',
    quote: 'In 2024-2025 the Older People & Housing programme awarded £2.6 million over 28 grants to 28 not-for-profit, community-led organisations in Greater London and Norfolk.',
    url: 'https://www.mercers.co.uk/philanthropy/older-people-and-housing',
    note: 'Second Mercers programme in this job with the same shape as Church and Communities in batch 2: a yearly total and a grant count, and no stated per-applicant figure. It divides to about £93,000, which is not written.' },
  { id: '93e4b316-cb4b-45fb-b8a8-b74f5fb6b831', title: 'Open Society Foundations — Europe & UK Programmes', why: 'not_stated',
    quote: 'Open Society Foundations | Voices | Who We Are | How We Work | What We Do',
    url: 'https://www.opensocietyfoundations.org/',
    note: 'No pound sign on the home page. The grants index the timing job read is an index of separate calls, each with its own terms.' },
  { id: '2b5e34e5-ad7a-4b18-9182-e05a33abf795', title: 'People and Research', why: 'not_stated',
    quote: 'The research funding from this scheme helps us to know what our historic environment comprises, which aspects of it are the most signficant, how people value and interact with it.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/people-and-research-1',
    note: 'A Find a grant listing with no value field filled in, the same as the Commissioned Rehabilitative Services listing in batch 2. Worth knowing that this service does not require a figure.' },
  { id: '3fe7c722-1434-4bdb-8d66-48749104b5e3', title: 'People\'s Health Trust — Health Justice Fund', why: 'not_stated',
    quote: 'Homes for Health is a pilot programme delivered through collaboration between the Trust and experts from housing, community, and racial justice civil society organisations.',
    url: 'https://www.peopleshealthtrust.org.uk/funding/health-justice-fund',
    note: 'Describes the fund and the programmes inside it with no figure, as the timing job also found for its dates.' },
  { id: 'facf81cb-733c-439c-a73a-d98ed6361d8e', title: 'Pilgrim Trust — Preservation & Scholarship', why: 'not_stated',
    quote: 'Explore the type of projects and work we\'ve funded. Our featured projects will give you an in-depth look at a selection of successful grant applications and projects.',
    url: 'https://www.thepilgrimtrust.org.uk/grants-awarded/',
    note: 'apply_url redirects to grants-awarded, a showcase of past projects. The trust lists named programmes (preservation and conservation, historic buildings, places of worship, archives) without a figure against any of them, and the apply-for-funding path returns 404.' },
  { id: 'c1a86516-b4be-4535-90cc-4a672750d652', title: 'Pilotlight — Pro Bono Support Matching', why: 'not_stated',
    quote: 'Charities who participate in our Pilotlight 360 programme increase their income by an average of 48% (two years after working with us).',
    url: 'https://www.pilotlight.org.uk/',
    note: 'An outcome statistic about the charity\'s own income, not an award. Pilotlight matches business volunteers rather than giving money.' },
  { id: '38f3cae0-7d56-422a-aa1f-8691c2540fc9', title: 'Pro Bono Economics Advisory', why: 'not_stated',
    quote: 'This type of project might allow the charity to say: "For every £1 spent, we generate £X of benefits to society."',
    url: 'https://pbe.co.uk/our-services/',
    note: 'The only pound signs on the page are inside an example sentence a charity might one day write about itself. Volunteer economist time rather than money.' },
  { id: '8687dd37-8bc0-4c35-9830-aa31f9b6eeb3', title: 'Rayne Foundation', why: 'not_stated',
    quote: 'Sign up to our mailing list for updates',
    url: 'https://www.raynefoundation.org.uk/',
    note: 'No figure and, as the timing job found, no working application route: the how-to-apply and apply-for-a-grant paths both return 404 and the foundation is moving to targeted calls.' },
  { id: '25466243-4af6-453a-9ea4-5f471919fa30', title: 'Resolution Foundation Workertech Partnership', why: 'not_stated',
    quote: 'Our Ventures activity spans social investment, creating communities and networks of ventures and stakeholders in the areas we care about, and pioneering action-oriented research.',
    url: 'https://www.resolutionfoundation.org/ventures/',
    note: 'An investment row whose page states no ticket size, no range and no total.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
