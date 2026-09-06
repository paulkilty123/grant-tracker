// Amounts on 176 live rows — batch 1 (rows 1-20 of docs/handoffs/amount-rows-2026-09-06.json).
//
// One column write, three prose-only writes, sixteen reported. That ratio is
// the first thing to say about this job: most of what a funder's page prints in
// pounds is not the number a fundraiser can ask for. In these twenty rows the
// pounds on the page were, in order of frequency: lifetime and annual totals
// (Albert Gubay's £100 million awarded since 2016, Barbara Ward's £12 million
// to 465 organisations, Cadent's £3 million a year, CAF's £65 million lent
// since 2002), organisation income caps (BCG's £500k turnover floor, BOOST's
// £100,000 and £500,000 ceilings), the size of PROJECT rather than of grant
// (Bernard Sunley's £10,000 to £5 million), and one figure belonging to a
// different fund entirely.
//
// Backstage Trust is the row the brief names, and it behaves exactly as
// described. Funding for All prints "Up to: £500000" at the top of the page and
// the trust's own words further down are "There is no specified minimum or
// maximum amount you can apply for." The listing's number is the one that would
// have been scraped; it is reported, not written.
//
// Both Bernard Sunley rows are reported for a reason worth recording. The
// foundation DOES publish three grant bands — large £25,000 and above, medium
// up to £20,000, small £5,000 and under — but only inside a JavaScript data
// attribute (table="[{...}]"), never as text on the page. A citation the
// checker cannot match against the page text fails, and a figure that fails its
// check is reverted, so the bands go in the report's note where a human can see
// them rather than into a citation that cannot hold.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-01-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 1

const ROWS: Row[] = [
  // 13. The one clean per-applicant ceiling in the batch. The £500,000 a year
  // on the same page is the wind farm's annual payment into the fund.
  { id: 'd83e1ad9-b8d5-4367-8a26-0fed8b5698f4', re: /Beinneun/,
    fields: { amount_max: 150000 },
    cits: { amount_max: { snippet: 'Grants of up to £150,000 are now available from the Beinneun Community Benefit Fund to support projects that benefit residents in Fort Augustus, and Glenmoriston and Glengarry.', confidence: 'high',
      source_url: 'https://foundationscotland.org.uk/beinneun-community' } },
    typical_award: 'Grants of up to £150,000. The Flexible Fund runs a Single Year strand split at £5,000 and a Multi Year strand. The £500,000 a year quoted on the page is the wind farm\'s annual payment into the fund, not an award.',
    typical_award_cit: { snippet: 'Grants of up to £150,000 are now available from the Beinneun Community Benefit Fund', confidence: 'high',
      source_url: 'https://foundationscotland.org.uk/beinneun-community' } },

  // 6. An average, so prose only. Also worth a second look beyond amounts: the
  // grants go to young people rather than to organisations.
  { id: 'e6379d1a-0437-4ea5-9bca-06385dfd7c08', re: /Andy Fanshawe/,
    fields: {},
    cits: {},
    sources: [{ url: 'https://www.andyfanshawe.org/information_for_applicants.php', label: 'Information for applicants (average grant), read 2026-09-06' }],
    typical_award: 'Eight to twelve grants a year, averaging £400 each. No minimum or maximum is stated.',
    typical_award_cit: { snippet: 'Each year we give eight to twelve grants averaging £400 each.', confidence: 'high',
      source_url: 'https://www.andyfanshawe.org/information_for_applicants.php' } },

  // 7. £100,000 is real but it is England's ceiling, named in a parenthetical
  // example inside an FAQ about repeat applications, and this row is UK-wide.
  // Scotland, Wales and Northern Ireland run their own programmes. A UK row
  // given England's number would be wrong for three of the four countries, so
  // the figure goes in prose with the country attached to it.
  { id: '62a1da4a-2c8c-4a2e-be7d-da543578d3d1', re: /Architectural Heritage Fund/,
    fields: {},
    cits: {},
    typical_award: 'Ceilings differ by country. In England the overall maximum for a Project Development Grant is £100,000; Scotland, Wales and Northern Ireland run their own programmes with their own limits. The £25,000 to £150,000 on the same page belongs to the Heritage Revival Fund, which is 75% loan.',
    typical_award_cit: { snippet: 'up to the overall maximum amount for that grant type in the country the project is based in (e.g. £100,000 for Project Development Grants in England)', confidence: 'high',
      source_url: 'https://ahfund.org.uk/what-we-do/fund/' } },

  // 18. Two schemes. Small has a stated ceiling of £1,000; large has none, only
  // a typical range, which is prose by the brief's own table. So the row gets no
  // column even though a number is on the page. The amount columns are also
  // pinned here by admin:amount_misparse_fix_2026-06-15, which would have
  // refused them anyway — but they are left empty by the reading, not by the pin.
  { id: '61220eaf-37b3-4662-891d-121633deabd4', re: /BOOST|Overlooked Sporting Talent/,
    fields: {},
    cits: {},
    typical_award: 'Two schemes. Small awards up to £1,000, for organisations with income under £100,000. Large awards have no stated ceiling; most are in the range of £2,000 to £7,000, for organisations with income under £500,000.',
    typical_award_cit: { snippet: 'Most large awards are in the range of £2,000 to £7,000.', confidence: 'high',
      source_url: 'https://boostct.org/applications/' } },
]

const REPORT: Report[] = [
  { id: '1d6af16c-0060-45b4-8f1e-051888785890', title: 'A Sinclair Henderson Trust', why: 'listing_only',
    quote: 'Fund award sizes. Average: Premium information. Annually awarded: Premium information. Notes on award amounts: Premium information.',
    url: 'https://funding.scot/funds/a0Rb0000003iiAXEAY/a-sinclair-henderson-trust',
    note: 'The trust has no site of its own — applications go to Thorntons solicitors by email — so funding.scot is the only page there is. It has an award-sizes section and every figure in it is behind SCVO membership. A listing with the number paywalled is the one case where following the brief\'s listing rule leaves nothing at all.' },
  { id: '5ed056e6-d5dd-4a82-b845-65c27a9a9eb5', title: 'Accelerate', why: 'not_stated',
    quote: 'The programme offers up to 6 days of flexible 1:1 support, tailored to each organisation\'s needs.',
    url: 'https://communityenterprise.co.uk/accelerate',
    note: 'Free consultancy days rather than money. The only "up to" on the page counts days.' },
  { id: '6621aeb1-5ca6-414f-92a9-355b86dac4a7', title: 'Accelerated Growth Programme — Business Wales', why: 'not_stated',
    quote: 'Accelerating success: How the Accelerated Growth Programme helped tech recruitment specialist Accelero break through £1m and scale strategically',
    url: 'https://businesswales.gov.wales/topics-and-guidance/accelerated-growth-programme/accelerated-growth-programme',
    note: 'Advisory support, not a grant. Every pound on the page is a case-study outcome — a company reaching £1m turnover, another raising £700,000 — and none is anything a participant receives.' },
  { id: '9d9da328-3680-4c33-9da2-4e7cdcbaca8c', title: 'Albert Gubay Charitable Foundation Grants', why: 'pot_only',
    quote: 'Since 2016, the Albert Gubay Charitable Foundation has awarded over £100 million to registered charities in England, the Isle of Man, Republic of Ireland, and Wales.',
    url: 'https://www.albertgubayfoundation.org/',
    note: 'Cumulative giving since 2016, alongside a "£90 Million Given In Grants" banner and the £700 million Albert Gubay\'s businesses were worth. No per-grant figure anywhere.' },
  { id: 'aac5e1fe-dbd1-4428-8eab-efcc9cff30dd', title: 'Albert Hunt Trust', why: 'not_stated',
    quote: 'We are committed to providing unrestricted core funding to help with your general running costs for example towards your bills or rent and towards your overall salary bill.',
    url: 'https://www.alberthunttrust.org.uk/faq/',
    note: 'A full FAQ covering eligibility, timing, reapplication and the trust\'s spend-down to 2029, with no figure of any kind. The quote is the closest it comes to describing what a grant covers.' },
  { id: '5b7a141a-5ee2-4f80-80d6-fa6937cff37b', title: 'Arnold Clark Community Fund', why: 'not_stated',
    quote: 'The Arnold Clark Community Fund welcomes applications from registered charities and community groups located within 50 miles of an Arnold Clark branch.',
    url: 'https://www.arnoldclark.com/community-fund',
    note: 'The fund page carries no pound sign at all — the quote is eligibility rather than money, because there is no money sentence to quote. Three funding categories are named without amounts.' },
  { id: '040888ac-bdd1-4a22-9f33-cc841f9b5cbb', title: 'Backstage Trust performing arts grants', why: 'listing_only',
    quote: 'There is no specified minimum or maximum amount you can apply for.',
    url: 'https://fundingforall.org.uk/funds/backstage-trust/',
    note: 'The row the brief names. Funding for All prints "Up to: £500000" in its own header field and the trust\'s own words on the same page are the quote above. The trust does not operate a website, so there is no funder page to go to. Nothing written.' },
  { id: '0f6795e2-bdd9-4746-b1d8-88a6ea469824', title: 'Barbara Ward Children\'s Foundation', why: 'pot_only',
    quote: 'Since then the Trustees have reviewed more than 7600 grant requests and authorised grants of over £12 million to more than 465 organisations.',
    url: 'https://www.bwcf.org.uk/',
    note: 'Cumulative since 2001. £12 million over 465 organisations averages around £26,000, but an average of a lifetime total is not a figure the foundation states and is not written.' },
  { id: '7e2f1cd7-bc26-4028-afbd-5a42d5438322', title: 'Barrow Cadbury Trust Grants', why: 'not_stated',
    quote: 'If, following submission of your enquiry form, you are invited to make a full application, the assessment and decision process at the application form stage may take up to four months.',
    url: 'https://barrowcadbury.org.uk/our-work/applying-for-funding/',
    note: 'The applying-for-funding page has no figure. The only "up to" on it counts months.' },
  { id: '7430666a-27b7-4f34-884a-f293d438c5a7', title: 'BCG UK Social Enterprise Award', why: 'not_stated',
    quote: 'Every organisation that makes it to the semi-final will receive coaching from BCG employees in the lead-up to our pitching events.',
    url: 'https://www.bcg.com/united-kingdom/bcg-uk-social-enterprise-award',
    note: 'The award is a consulting engagement rather than cash. The £500k on the page is a turnover floor for applicants, which belongs in min_org_income and not here.' },
  { id: '201613fa-1907-41cf-b7d6-d555f1f9ca56', title: 'Bernard Sunley Foundation — Capital Grants', why: 'not_stated',
    quote: 'Project costs between £10,000 and £5 million.',
    url: 'https://bernardsunley.org/our-grant-giving/',
    note: 'See the header note. The quote is the size of PROJECT the foundation considers, not the size of grant, and is deliberately not written to the columns. The three grant bands (large £25,000 and above, medium up to £20,000, small £5,000 and under) exist only inside a JavaScript data attribute and never as page text, so they cannot carry a citation the checker could match. Worth someone reading the site in a browser and setting these by hand.' },
  { id: 'c51eaae1-2007-4930-a45a-4da9f7542c1c', title: 'Bernard Sunley Foundation — Social Welfare Grants', why: 'not_stated',
    quote: 'Project costs between £10,000 and £5 million.',
    url: 'https://bernardsunley.org/our-grant-giving/',
    note: 'Second row on the same foundation and the same problem. apply_url here is the social-welfare page, which renders its grant table in JavaScript and reads as a list of categories with nothing under them.' },
  { id: 'be4d0b34-6e72-4e52-9301-cffdf0d1098f', title: 'BlueSpark Foundation', why: 'not_stated',
    quote: 'We are a registered charity providing grants for educational, cultural, sporting and other projects.',
    url: 'https://www.bluesparkfoundation.org.uk/',
    note: 'A 178KB site describing the kinds of project it funds, with no pound sign anywhere on the home page and no separate how-much page.' },
  { id: '3ca96f8d-8d53-4be5-99d8-f3a637d1fc5e', title: 'British Record Industry Trust (Brit Trust)', why: 'not_stated',
    quote: 'The BRIT Trust Grant application window for 2026 is now closed. Applications for 2027 will open towards the end of this year.',
    url: 'https://brittrust.co.uk/brit-trust-grants/',
    note: 'An 11KB page that says when the round runs and nothing about how much.' },
  { id: '31feb54d-ca5e-4291-b1c6-e08b59dee810', title: 'Cadent Foundation — Community Grants', why: 'pot_only',
    quote: 'This is made possible each year by Cadent who help to fund the Cadent Foundation by committing £3 million annually of post-tax profits.',
    url: 'https://cadentgas.com/foundation',
    note: 'Two pots on one page, £3 million a year into the foundation and a £1m Warm Fund inside it, and no per-grant figure. Grants are administered by Charities Trust, which may hold the figure.' },
  { id: '1df738d5-d952-425c-bfa6-a4c2b4057f61', title: 'CAF Venturesome Impact Fund', why: 'pot_only',
    quote: 'Since 2002 we have lent more than £65 million to over 500 charities, social enterprises and community groups.',
    url: 'https://www.cafonline.org/services-for-charities/funding-for-charities/social-investment',
    note: 'Cumulative lending since 2002. An investment row, so a ticket range would be the figure to hold, and the page states none.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
