// Amounts on 176 live rows — batch 9, the last (rows 161-176). One prose write, fifteen reported.
//
// No column write in the final sixteen, and the reason is the same as batch 8:
// pro bono legal and consulting programmes, corporate donation schemes, and
// trusts whose sites carry no figure at all. The Wolfson Foundation is the
// clearest of these — a funder giving capital grants for buildings and
// equipment, with a full apply-for-funding section running to 453 lines of
// guidance, application questions and review process, and not one pound sign
// anywhere in it.
//
// The one write is the tree planting rate, which is the brief's per-unit case:
// 10p per tree per year for two years is a real figure that no pair of columns
// can hold, because what an applicant receives depends entirely on how many
// trees they plant.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-09-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 9

const ROWS: Row[] = [
  // 164. Per-unit. The amount columns are admin-pinned on this row in any case,
  // and were deliberately nulled on 5 September for this reason.
  { id: '31f56c84-447a-478b-a15a-fcb19469c1aa', re: /Tree Planting/,
    fields: {},
    cits: {},
    typical_award: 'No per-application figure is stated. Maintenance grants are paid at a rate of 10p per tree per year for the first two years after planting, so what an applicant receives depends on how many trees they plant. The per-project planting figure is in the guidelines the page links to rather than on the page.',
    typical_award_cit: { snippet: 'This is set at 10p per tree for each year, and is provided to encourage essential activities, such as watering, mulching and weeding.', confidence: 'high',
      source_url: 'https://www.internationaltreefoundation.org/uk-grants' } },
]

const REPORT: Report[] = [
  { id: '3f9c1fc3-6a19-4cde-affe-6e7f83077c99', title: 'Travers Smith Pro Bono Programme', why: 'not_stated',
    quote: 'Pro Bono | Travers Smith',
    url: 'https://www.traverssmith.com/all-services/pro-bono/',
    note: 'A law firm\'s pro bono page. No pound sign in the rendered text and no money passing to a charity.' },
  { id: '60206220-abaa-45e2-9534-bc6d41e94940', title: 'Trust for London — Poverty & Inequality Grants', why: 'not_stated',
    quote: 'Sign up to our newsletters',
    url: 'https://trustforlondon.org.uk/funding/',
    note: 'A full funding section covering aims, eligibility, priorities and guidance, with no figure. The timing job found the same page states no deadline either.' },
  { id: '0e506d16-9e5c-47e0-aae9-7f3444b3646c', title: 'TrustLaw — Pro Bono Legal Programme', why: 'not_stated',
    quote: 'Sign up to our newsletter',
    url: 'https://www.trust.org/trustlaw/',
    note: 'A membership network connecting organisations with pro bono lawyers. Free at the point of use and no figure on the page.' },
  { id: 'f4cc6956-affd-496c-9954-09c189ddea02', title: 'Ulverscroft Foundation', why: 'not_stated',
    quote: 'Ulverscroft Foundation | Serving the Needs of Visually Impaired People | Grants',
    url: 'https://www.ulverscroft-foundation.org.uk/grants/',
    note: 'The grants page sets out how to apply in full and never how much, which is what the timing job found about its dates.' },
  { id: '60e2144a-4955-43fe-893c-1956785946f1', title: 'Utilita Football Rebooted Grassroots Fund', why: 'not_stated',
    quote: '£ 0.00',
    url: 'https://www.teamgrassroots.co.uk/fund/',
    note: 'The only pound sign on a 318KB page is an empty basket total. Worth knowing for any amount sweep: a shopping cart renders as a money figure.' },
  { id: '7b37ff2e-13f0-4b71-87bf-24b0b6fdcd80', title: 'Virgin Money Foundation', why: 'not_stated',
    quote: 'Make £5 Grow',
    url: 'https://www.virginmoneyfoundation.org.uk/',
    note: 'The only pound sign is the name of a separate Virgin Money scheme in the site footer. No application route or figure on the foundation site, as the timing job also found.' },
  { id: 'fd7d2b8b-4946-43a8-be8b-1ef9b63ce244', title: 'Wakeham Trust', why: 'not_stated',
    quote: 'The Wakeham Trust | Supporting Small Scale Change',
    url: 'https://thewakehamtrust.org/2020/05/05/how-to-apply/',
    note: 'A how-to-apply post from 2020 with no figure. "Small scale change" is the strapline rather than a stated size.' },
  { id: '05aa2cda-e64d-4f21-8b89-0727637d5515', title: 'Waterloo Foundation Grant Programmes', why: 'index_over_programmes',
    quote: 'About Us | Investments | Reports and Publications',
    url: 'https://waterloofoundation.org.uk/',
    note: 'Each programme keeps its own Active Calls and Deadlines page, as the timing job found. The home page carries no figure for any of them.' },
  { id: '3f5d135b-c001-4cc3-8ae3-049a9b85baef', title: 'Whirlwind Charitable Trust', why: 'not_stated',
    quote: 'GUIDELINES - Whirlwind25',
    url: 'https://www.whirlwind.org.uk/guidelines/',
    note: 'A guidelines page with no pound sign in the rendered text.' },
  { id: '166aa0c7-b17a-4f45-897d-ef7b9e768a48', title: 'Wickes Community Programme — Materials Donations', why: 'not_stated',
    quote: 'Donations are typically limited to products only. If installation services are included in a donation, this is a rare exception and will be explicitly confirmed by Wickes.',
    url: 'https://www.wickes.co.uk/community-programme',
    note: 'Donated materials rather than money. The per-square-metre prices on the page ("£15 to £20 per m2") are retail flooring prices from the surrounding shop, not the programme.' },
  { id: '229988e1-2796-4b0c-9df6-68c741df674b', title: 'Wolfson Foundation — Capital Grants', why: 'not_stated',
    quote: 'Our main grants programme provides support for places. These grants are for capital initiatives, i.e. buildings (new build or refurbishment) and equipment.',
    url: 'https://www.wolfson.org.uk/funding/funding-for-places/',
    note: 'The clearest silence in the batch. A capital funder with a 453-line apply-for-funding section covering guidance, stage one questions and the review process, containing zero pound signs; the funding-for-places page is the same. Checked by counting £ in the fetched text, not by eye.' },
  { id: '70c2c973-e718-4d50-9394-8ff7d1092da6', title: 'Wooden Spoon Charity', why: 'pot_only',
    quote: 'Since 1983, we have committed in excess of £32 million to 1,626 projects.',
    url: 'https://woodenspoon.org.uk/apply-for-a-grant/',
    note: 'Forty years of cumulative giving on the apply page, and no per-project figure.' },
  { id: '4c6acc32-d648-451c-931b-17da273ab598', title: 'Worthing Community Chest — Seed Grants', why: 'not_stated',
    quote: 'PLAY OUR LOTTERY £25K jackpot!',
    url: 'https://worthingcommunitychest.org/grants/seed-grants/',
    note: 'Every figure on the seed grants page belongs to the charity\'s own fundraising lottery — a £25,000 jackpot and £1 or £5 monthly donations. Money flowing the wrong way, as with Clore and Charity Digital in batch 2, and on a page about grants.' },
  { id: 'f0dd61fe-c828-4ff4-9c25-d738e33032db', title: 'Youth Endowment Fund', why: 'pot_only',
    quote: 'The Youth Endowment Fund was established in March 2019 by children\'s charity Impetus, with a £200m endowment and ten year mandate from the Home Office.',
    url: 'https://youthendowmentfund.org.uk/funding/',
    note: 'Three pots on the site and no award: a £200m endowment, £5 to 10 million allocated over three years to black, Asian and minority-ethnic led charities, and £3m to one CBT programme reported as news.' },
  { id: '581fab6f-e73b-4584-82fd-d0ab9f355aed', title: 'Zochonis Charitable Trust — Grants', why: 'not_stated',
    quote: 'The Zochonis Charitable Trust is only able to consider applications from charities registered with the Charity Comission of England and Wales, or Scotland\'s equivalent.',
    url: 'https://www.zochonischaritabletrust.com/how-to-apply/',
    note: 'A how-to-apply page of thirty lines whose only periods are the funding year and the reapplication wait, as the timing job also found.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
