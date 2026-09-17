// Amounts on 176 live rows — batch 4 (rows 61-80). Two column writes, one prose, seventeen reported.
//
// Two rows here show the same trap from opposite sides, and both turn on rule 5.
//
//   Fredericks  its own product is "funding between £20,000 – £50,000". Two
//               paragraphs later the same page offers the Community Builders
//               Fund at £100k to £1.5m — a Social Investment Business fund that
//               Fredericks merely delivers. Writing £1.5m here would be a
//               verbatim quote from the row's own page and still wrong.
//   Gannochy    the only figure on the page is "grants of up to £10,000" for
//               the Youth Panel Fund, one strand inside Perth and Kinross. The
//               main programme states nothing, so the £10,000 goes to prose
//               with the strand named rather than becoming the row's ceiling.
//
// Mohn Westlake is worth reading for a different reason: it explains its own
// silence. "Grant sizes vary but usually don't exceed more than 20% of an
// organisation's annual income" is a real policy and a percentage, which the
// brief excludes, so the row stays empty for a stated reason rather than an
// absence.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-04-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 4

const ROWS: Row[] = [
  // 65. See the header note on the Community Builders Fund.
  { id: 'd33aa458-0eb8-473a-8b28-547cd8557a71', re: /Fredericks Foundation/,
    fields: { amount_min: 20000, amount_max: 50000 },
    sources: [{ url: 'https://www.fredericksfoundation.org/looking-for-funding/', label: 'Looking for funding (revenue share range), read 2026-09-06' }],
    cits: {
      amount_min: { snippet: 'We offer funding between £20,000 – £50,000 through a flexible revenue share model', confidence: 'high',
        source_url: 'https://www.fredericksfoundation.org/looking-for-funding/' },
      amount_max: { snippet: 'We offer funding between £20,000 – £50,000 through a flexible revenue share model', confidence: 'high',
        source_url: 'https://www.fredericksfoundation.org/looking-for-funding/' },
    },
    typical_award: 'Fredericks lends £20,000 to £50,000 on a revenue share model, with repayments linked to income. It is also a delivery partner for the Community Builders Fund, which lends £100,000 to £1.5 million but belongs to Social Investment Business and is applied for on their site.',
    typical_award_cit: { snippet: 'We offer funding between £20,000 – £50,000 through a flexible revenue share model', confidence: 'high',
      source_url: 'https://www.fredericksfoundation.org/looking-for-funding/' } },

  // 79. Three funds, all with ranges, all on one page. The row is the trust, so
  // the floor is the lowest stated and the ceiling the highest, and prose names
  // which fund is which because they differ by geography and by subject.
  { id: 'e60c8be4-21ae-4645-8d24-c54a865cf9dd', re: /HDH Wills/,
    fields: { amount_min: 1000, amount_max: 20000 },
    cits: {
      amount_min: { snippet: 'The General Fund provides grants of £1,000 – £5,000 to small charities based primarily in Oxfordshire and Suffolk', confidence: 'high',
        source_url: 'https://hdhwills.org/grants/' },
      amount_max: { snippet: 'The Martin Wills Fund provides grants of £5,000–£20,000 to small and medium-sized charities working in the UK and Ireland', confidence: 'high',
        source_url: 'https://hdhwills.org/grants/' },
    },
    typical_award: 'Three funds. General Fund £1,000 to £5,000, for Oxfordshire and Suffolk. Martin Wills Fund £5,000 to £20,000, UK and Ireland wildlife and habitats. Martin Wills Wildlife Maintenance Trust £1,000 to £3,000.',
    typical_award_cit: { snippet: 'The Martin Wills Wildlife Maintenance Trust provides grants of £1,000 to £3,000 to small wildlife charities working in the UK and Ireland', confidence: 'high',
      source_url: 'https://hdhwills.org/grants/' } },

  // 66. Prose only. The £10,000 is real and belongs to one strand.
  { id: '85f9af1e-b1cb-4796-8a7c-163aabec2037', re: /Gannochy/,
    fields: {},
    cits: {},
    typical_award: 'The main Perth and Kinross programme states no figure. Within it, the Gannochy Trust Youth Panel Fund provides grants of up to £10,000 for youth health, youth voice, and youth mental health and wellbeing. The trust\'s annual giving is around five million pounds in total.',
    typical_award_cit: { snippet: 'will provide grants of up to £10,000 for youth health, youth voice, and youth mental health and wellbeing in Perth and Kinross', confidence: 'high',
      source_url: 'https://www.gannochytrust.org.uk/our-grants/applying-for-grant-funding/' } },
]

const REPORT: Report[] = [
  { id: 'c1ca1f42-98fa-471c-ad65-b078bf97c20c', title: 'Ffilm Cymru Wales — Film Funding', why: 'pot_only',
    quote: 'Ffilm Cymru Wales has awarded over £77,000 to 13 independent cinemas, film festivals and community pop-up screenings across Wales.',
    url: 'https://ffilmcymruwales.com/funding-and-training/cinemas-film-festivals-pop-ups',
    note: 'A funding round\'s total across 13 recipients. The row\'s amounts were already nulled on 5 September by the live-and-wrong pass for the same reason; this confirms it against the page rather than changing it.' },
  { id: 'e0c1a655-d377-481b-b806-0c171095f7be', title: 'Financial Futures Fund', why: 'pot_only',
    quote: 'The Financial Futures Fund opens for applications twice a year, with up to £3 million in grants awarded annually.',
    url: 'https://www.avivafoundation.org.uk/financial-futures-fund/',
    note: 'The £3 million is the annual pot across the whole fund, which is exactly what the 5 September pass concluded. The £1 million on the page is an income floor for applicants.' },
  { id: 'f14ca7b1-4e12-48b0-b59c-31b64e602b61', title: 'Forever Manchester — Community Grants', why: 'index_over_programmes',
    quote: 'We manage and administer a number of funds. For support and guidance on the best fund to apply to, please call us before making an application.',
    url: 'https://forevermanchester.com/funding/',
    note: 'Funder-level page over named funds (Zuto Make A Difference, Together Fund, NHS Charities Together partnership grants and others), none of them costed at this level.' },
  { id: '09b093ef-17a6-415d-bc6f-659c614d0f78', title: 'Forsters for Good – Pro Bono Legal Support', why: 'not_stated',
    quote: 'Forsters is proud to have supported St Andrew\'s Youth Club, providing fun and educational activities for young people from the ages of five to adulthood, from 2019 – 2023.',
    url: 'https://www.forsters.co.uk/forsters-for-good/communities',
    note: 'A law firm\'s community pages. Pro bono time and volunteering rather than money, and the only figures are dates and headcounts.' },
  { id: '3b836a87-fd0e-4d5c-bfdc-b44f7c793eb1', title: 'Gatsby Charitable Foundation', why: 'pot_only',
    quote: 'Since 1967, we have committed over £1.7 billion in philanthropic giving.',
    url: 'https://www.gatsby.org.uk/',
    note: 'Nearly sixty years of cumulative giving. The foundation commissions rather than receives applications, which the timing job also found, so there is no award to size. Amount columns admin-pinned.' },
  { id: '5dca172c-1c80-4f3e-9f89-0ba7f574e9a1', title: 'General Grantmaking Programme', why: 'not_stated',
    quote: 'We will send an email to notify you of the Trustees\' decision but timescales will vary depending on when you submit your application and when Trustees are next due to meet.',
    url: 'https://29may1961charity.org.uk/how-to-apply',
    note: 'A full how-to-apply page with no pound sign. Past grants are published as lists rather than as a range.' },
  { id: 'ca27a805-4ee8-437d-9ae6-a90cc9e66739', title: 'Glasspool — Flexible Frontline Fund', why: 'pot_only',
    quote: '£2.2m distributed across the UK',
    url: 'https://www.glasspool.org.uk/',
    note: 'A distribution total. The fund reaches individuals through frontline partner organisations, and partner recruitment is closed until at least 2027, so there is no per-applicant award to state.' },
  { id: 'a4ee2034-0ec1-40d4-9a8b-a4b745916b5b', title: 'GLL Social Enterprise Accelerator', why: 'not_stated',
    quote: '£20M worth of business with social enterprise supply partners in 2025',
    url: 'https://www.gll.org/services-and-impact/business-support/social-enterprise-accelerator',
    note: 'Both figures on the page are corporate impact statistics — procurement spend and social value generated — not awards. The accelerator is support rather than cash.' },
  { id: '0d4ec360-0e88-4ac8-aa6f-524339515e4b', title: 'Google.org — Nonprofit Tech Grants & Ad Credits', why: 'not_stated',
    quote: 'Google for Nonprofits: no-cost and discounted AI tools',
    url: 'https://www.google.com/nonprofits/',
    note: 'The landing page states no figure. Ad Grants are usually quoted as a monthly ad-credit allowance, which is a spending cap on a Google product rather than money received, and it is not on this page in any case.' },
  { id: '3d6656f0-6f74-4635-8c87-0406ded69be2', title: 'Gordon Fraser Charitable Trust', why: 'not_stated',
    quote: 'Home | History | Trustees | Login | Contact',
    url: 'https://www.gfct.org.uk/',
    note: 'A 15KB site of four pages, none of which carries a figure. The quote is the navigation because there is no prose to quote.' },
  { id: '6668064b-bbdd-4e6e-87b6-34a6e7e3257a', title: 'Grant Funding (The Mohn Westlake Foundation)', why: 'not_stated',
    quote: 'Grant sizes vary but usually don\'t exceed more than 20% of an organisation\'s annual income.',
    url: 'https://www.themohnwestlakefoundation.co.uk/our-grant-making-approach/',
    note: 'The best-explained silence in the batch: the foundation has a real policy and it is a percentage of the applicant\'s income, which the brief excludes from the columns. A charity with £500,000 income reads this as up to £100,000, and one with £50,000 reads it as up to £10,000, so no single figure is right. Amount columns admin-pinned.' },
  { id: '7873fc4e-1763-4f49-9121-40cbfdb2916c', title: 'Grants for Disability and Vulnerable People', why: 'not_stated',
    quote: 'We award grants for revenue costs (running costs), projects or capital projects.',
    url: 'https://www.eveson.org.uk/',
    note: 'The Eveson Trust states what it will pay for and never how much.' },
  { id: '2f92be71-fc16-4992-b73e-84c2a7e023bd', title: 'Grants for Organisations (Gateway, Project & Core)', why: 'not_stated',
    quote: 'Application - Richmond Foundation',
    url: 'https://www.richmondfoundation.org.uk/our-funding/apply/',
    note: 'Three named grant types in the row title (Gateway, Project and Core) and no figure against any of them on the application page. Amount columns admin-pinned.' },
  { id: 'e0dddc2b-3275-41cd-9daf-982aed9798b8', title: 'Hampstead Wells and Camden Trust', why: 'not_stated',
    quote: 'Provides smaller grants for community-led activities and local projects that benefit residents within our Area of Benefit. This fund is currently closed to new applications.',
    url: 'https://hwct.org.uk/grants-for-organisations/',
    note: 'Two organisational programmes, both currently closed, and "smaller grants" is as close as the page comes to a figure.' },
  { id: 'd51e7f33-1464-4181-a535-8265fd923587', title: 'Hargreaves Foundation', why: 'not_stated',
    quote: 'The Hargreaves Foundation | Transforming Young Lives Through Sport and Education',
    url: 'https://www.thehargreavesfoundation.org/',
    note: 'A 12KB site with an application process page and no figure on it.' },
  { id: 'acbff6c1-4f2f-47a7-8f98-58d0f2072410', title: 'Hatch Enterprise Business Support Programme', why: 'index_over_programmes',
    quote: 'Suitable for founders with a business that has an annual turnover of at least £5k.',
    url: 'https://hatchenterprise.org/our-programmes/',
    note: 'Five programmes with their own intakes, reported the same way in the timing job. The only figure on the index is a turnover floor for applicants, not an award.' },
  { id: '8f57f2a0-685d-489f-9267-ac9f79b073a7', title: 'Herefordshire Community Foundation — Community Grants (Community Chest)', why: 'index_over_programmes',
    quote: 'The main form below is used for all funding applications, with the exception of the Small Sparks Fund and HCF Emergency Relief Fund which have their own application forms.',
    url: 'https://www.herefordshirecf.org/apply-for-a-grant/',
    note: 'A shared application form across many named funds, with no figure at this level and none against the Community Chest the row names.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
