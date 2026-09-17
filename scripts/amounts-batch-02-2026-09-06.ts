// Amounts on 176 live rows — batch 2 (rows 21-40). One column write, nineteen reported.
//
// The Clore Social Leadership row is the sharpest near miss of the job so far
// and belongs in the same family as the timing job's Islington and Kusuma. Its
// page prints three prices — £1,995, £2,395 and £3,550 Early Bird — in exactly
// the place an amount scraper would look. They are what a participant PAYS.
// Money on a funder page can flow either way and only one direction is an award.
//
// This batch is also where the in-kind rows start arriving in numbers: Canva,
// CAST, Charterpath, Charity Digital. None of them has an amount because none
// of them gives money, and the pounds they do print are course fees (£20 for an
// AI session) or licence counts (50 free Adobe Express licences). Reported as
// not_stated rather than left to look like an oversight.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-02-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 2

const ROWS: Row[] = [
  // 35. Four schemes on the criteria page. The Community Grant Scheme is the
  // open, UK-wide one and is what this row is; Whitemoss is restricted to ten
  // miles of one landfill site, and the habitat and land-purchase schemes are
  // narrower still. Highest ceiling across all of them is the same £75,000, so
  // the max is safe either way; the floor is the Community Grant Scheme's,
  // which is the sentence cited, and the other floors are named in prose.
  { id: 'c32ecdba-2fab-4131-a430-69bf1e6a1cae', re: /Community and Environment Grants/,
    fields: { amount_min: 10000, amount_max: 75000 },
    sources: [{ url: 'https://www.veoliatrust.org/funding-criteria/', label: 'Funding criteria (grant ranges by scheme), read 2026-09-06' }],
    cits: {
      amount_min: { snippet: 'Grants of between £10,000 and £75,000 are available to create or improve buildings or outside spaces', confidence: 'high',
        source_url: 'https://www.veoliatrust.org/funding-criteria/' },
      amount_max: { snippet: 'Grants of between £10,000 and £75,000 are available to create or improve buildings or outside spaces', confidence: 'high',
        source_url: 'https://www.veoliatrust.org/funding-criteria/' },
    },
    typical_award: 'Community Grant Scheme: £10,000 to £75,000. Whitemoss Community Grant Scheme, for organisations within ten miles of the Veolia Whitemoss landfill site: £5,000 to £75,000. Separate habitat and biodiversity and land purchase schemes have their own ranges.',
    typical_award_cit: { snippet: 'Grants of between £10,000 and £75,000 are available to create or improve buildings or outside spaces', confidence: 'high',
      source_url: 'https://www.veoliatrust.org/funding-criteria/' } },
]

const REPORT: Report[] = [
  { id: 'b12c394d-346d-4246-a254-06ca5bbadd08', title: 'Calouste Gulbenkian Foundation UK Branch — Grants', why: 'not_stated',
    quote: 'The UK Branch aims to strengthen arts and civil society ecosystems by supporting transnational exchange, reciprocal capacity development and knowledge sharing between Portugal and the UK.',
    url: 'https://gulbenkian.pt/uk-branch/our-work/our-grant-making/',
    note: 'No pound sign on the page. Same row reported as not_stated in the timing job for the same reason: the grant-making page describes what the branch funds and nothing about how much or when.' },
  { id: '856cbdaf-7e60-4c78-8ad2-e7c0b6fddbd8', title: 'Camden Climate Fund', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.camden.gov.uk/camden-climate-fund',
    note: 'HTTP 403 behind a Cloudflare interstitial, as in the timing job.' },
  { id: 'e53c6f5a-bd7a-4ae1-8d37-e3e2333c569e', title: 'Canva for Nonprofits', why: 'unreadable',
    quote: 'Client Challenge. A required part of this site couldn\'t load.',
    url: 'https://www.canva.com/nonprofits/',
    note: 'A bot wall that returns HTTP 200 with a 3KB challenge page. Distinct from a 403 and easy to mistake for a thin page.' },
  { id: '91737208-0bd3-45c4-8866-ec6256e85a58', title: 'Cash for Kids - Cost of Living Grants', why: 'index_over_programmes',
    quote: 'Please check the specific Eligibility Criteria for the grant you are applying for.',
    url: 'https://cashforkids.org.uk/grants/',
    note: 'Grants are run by Local Executive Boards area by area, each with its own criteria and its own money, and the national page states no figure for any of them.' },
  { id: '6a57acbc-0c38-45f4-ad35-17a79c059f5b', title: 'Cash for Kids - General Grant', why: 'index_over_programmes',
    quote: 'Please check the specific Eligibility Criteria for the grant you are applying for.',
    url: 'https://cashforkids.org.uk/grants/',
    note: 'Second Cash for Kids row pointing at the identical URL as the Cost of Living row above. Worth checking whether these are two funds or one row duplicated.' },
  { id: '86a561b4-8487-44e8-8a20-33f772a5055c', title: 'CAST — Free Digital and AI Support for Charities', why: 'not_stated',
    quote: 'What you talk about will be entirely up to you and your match: it could be a challenge you need help with, advice you\'d like to share, or just a general chat about digital, data or design.',
    url: 'https://www.wearecast.org.uk/our-work/programmes-and-initiatives/',
    note: 'Peer matching and programmes rather than money.' },
  { id: 'ff8d9d64-f661-44bf-b07f-42b4bb66deab', title: 'Chalk Cliff Trust — Grants for East Sussex', why: 'not_stated',
    quote: 'The Chalk Cliff Trust is a foundation set up to provide grants and donations to charities, action groups and benevolent organisations predominantly in the East Sussex area.',
    url: 'https://www.chalkclifftrust.org/home',
    note: 'A 141KB site with a single sentence about what it does and no figure anywhere.' },
  { id: 'ba33eb0c-e6d9-453c-b57e-21f23e925738', title: 'Champions for Children — Match Fundraising Programme', why: 'not_stated',
    quote: 'We use the Big Give\'s pledge model of funding for our two match-funding programmes. Our model enhances donations made by the public on the Big Give platform, helping charities to raise even more funds.',
    url: 'https://childhoodtrust.org.uk/grants/grant-making-programmes/',
    note: 'Match funding, which the brief excludes from the columns by name: what a charity receives depends on what it raises. The £5.8 million on the page is the 2024 campaign total across almost 170,000 children, and the £500,000 is an income ceiling for the entry-level strand. The amount columns are also admin-pinned here, so nothing would have been written in any case.' },
  { id: '99a71fd2-fccc-4947-a4fd-4fdd81b58bd0', title: 'Charity Digital Skills Programme', why: 'not_stated',
    quote: 'Join us for a one-hour session to master AI prompts. For just £20, you\'ll supercharge your productivity.',
    url: 'https://charitydigital.org.uk/',
    note: 'The only pounds on the page are a course fee the charity pays, and the only "up to" counts free Adobe Express licences. Money flowing the wrong way, like Clore below.' },
  { id: '5067b65b-6595-4a7b-b764-2f821a4584fa', title: 'Charterpath Pro Bono Accountancy for Charities', why: 'not_stated',
    quote: 'For non-profits',
    url: 'https://www.charterpath.org.uk/for-non-profits',
    note: 'A 998KB Wix page whose readable text is navigation. Pro bono accountancy rather than money, and no pound sign in what renders.' },
  { id: '4db45a85-2ff4-4cac-bca6-51a44bd56fe1', title: 'Church and Communities Programme', why: 'pot_only',
    quote: 'In 2024-25 our Church & Communities programme awarded £3.4 million over 70 grants to 57* organisations in Greater London, Lincolnshire, Norfolk and the North East of England.',
    url: 'https://www.mercers.co.uk/philanthropy/church-and-communities',
    note: 'A programme total. It divides to roughly £49,000 a grant, which is exactly the sort of arithmetic the brief rules out: the foundation states no per-applicant figure and a derived average would be a number nobody published.' },
  { id: '014ccbcd-cd35-4447-8467-d25fb34db0d2', title: 'Civitates — Pooled Fund for European Democracy', why: 'pot_only',
    quote: 'Since then, our pooled fund has supported more than 90 organisations to defend the key pillars of democracy in 20+ European countries with a total of €20 million, and growing.',
    url: 'https://civitates-eu.org/',
    note: 'A cumulative total, and in euros. Nothing per applicant.' },
  { id: 'ed047490-107e-4805-8ea2-6cd85520b3ae', title: 'Clore Social Leadership Programme', why: 'not_stated',
    quote: '£1,995 Early Bird',
    url: 'https://cloresocialleadership.org.uk/',
    note: 'See the header note. The three figures on this page (£1,995, £2,395 and £3,550 Early Bird) are course fees the participant pays, sitting in exactly the place an amount scraper would look for an award. Nothing is given.' },
  { id: '16bfa48f-f9e6-4f32-a431-23e2b732c3e7', title: 'Commissioned Rehabilitative Services General Grant Scheme', why: 'not_stated',
    quote: 'Each of these regions has access to a budget per financial year that can be used to commission rehabilitative services.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/commissioned-rehabilitative-services-general-grant-scheme-1',
    note: 'A Find a grant listing with Summary, Eligibility, Objectives, Dates and How to apply sections and no value field filled in. The budget referred to is a probation region\'s, not an award.' },
  { id: 'fafa223d-1008-46c6-8019-585afd5014b7', title: 'Community Energy GO!', why: 'not_stated',
    quote: 'We\'re a key player in this £5m initiative, working with communities to speed up Bristol and the West of England\'s transition to net zero.',
    url: 'https://www.cse.org.uk/my-community/',
    note: 'The £5m belongs to a different CSE initiative on the same page, not to Community Energy GO, which is free advisory support with no grant attached.' },
  { id: 'a8a34a8e-4570-4fbd-9260-cbbcc8926637', title: 'Community Grants (The Old Enfield Charitable Trust)', why: 'pot_only',
    quote: 'In a typical year The Old Enfield Charitable Trust administers around £250K in discretionary grants to families, individuals and community groups.',
    url: 'https://thetrustenfield.org.uk/grants/',
    note: 'An annual total spread across three kinds of recipient, so it will not even divide meaningfully. Amount columns are admin-pinned on this row.' },
  { id: '3665afff-c092-41c1-83e9-fb67b8d4d563', title: 'Community Grants (Hampton Fund)', why: 'not_stated',
    quote: 'Our Trustees meet four times a year – in March, June, September and December - to assess applications and approve grants.',
    url: 'https://www.hamptonfund.co.uk/community-grants/',
    note: 'No pound sign on the page. The same row was reported in the timing job because its deadlines are "available on request"; the amounts are not published either. Amount columns admin-pinned.' },
  { id: '49a1fffd-2412-4105-8897-8a5af286b797', title: 'Continuo Foundation Project Grants', why: 'pot_only',
    quote: 'From the outset, Continuo Foundation has been offering a minimum of £200,000 per year in project grants across two rounds.',
    url: 'https://www.continuofoundation.co.uk/our-grants',
    note: 'A floor on the fund\'s annual giving, not a floor on an award. The nearest trap in the batch: "a minimum of £200,000" reads like amount_min and is the opposite of one.' },
  { id: '523da313-e449-46a1-8647-c5a51e58b304', title: 'Cornwall Community Foundation — Community Grants', why: 'index_over_programmes',
    quote: 'Grant value: Organisations may apply for up to £3,000',
    url: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/',
    note: 'A rich index: at least seven named funds each printing its own "Grant value" line, ranging from £250 to £5,000, plus one offering mentoring with a grant of up to £1,000. Every figure on the page belongs to a specific fund and none to this funder-level row.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
