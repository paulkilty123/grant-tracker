// Spend-restriction — batch 4, rows 61-80. Four written, sixteen reported.
//
// A near-miss caught before it was written: the Oake Sunshine Fund page
// (Somerset Community Foundation) has a "project costs, like staff time...
// or capital costs, like equipment or buildings" sentence, but it belongs to
// a sibling fund further down the same page (the Gooch Charitable Fund and
// the Waste Not Somerset Fund each carry their own, near-identical wording).
// Oake's own section says nothing about spend type — the same shape as the
// Adint/Fitton trap in batches 1-2, on a different community foundation's
// site. Reported not_stated.
//
// Six Cloudflare/host interstitials this batch (three Arts Council England
// pages, Groundwork, Historic England, and — via a bare 406 rather than a
// 403 — Shoosmiths): all unreadable, not silence. NFU Mutual's page loads
// (200) but is pure insurance-site navigation; whatever "applications for
// funding" content exists is client-rendered and never reaches the text,
// so it is unreadable too rather than not_stated.
//
// Sea-Changers is the batch's one restricted call: its "What don't we fund?"
// list names "Applications solely to fund administrative or core operating
// costs" — an explicit exclusion, the pattern DCMS's gaming pilot fund set
// in batch 2, not the softer "costs associated with eligible projects" the
// Young Camden trusts use.
//
//   npx tsx --env-file=.env.local scripts/spend-batch-04-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './spend-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 4

const SCF = 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/'
const CFTW = 'https://www.communityfoundation.org.uk/grants/passionate-about-realising-potential-in-environmental-green-careers/'
const PILKINGTON = 'https://cfmerseyside.org.uk/grants/pilkington-charities-fund'
const SEACHANGERS = 'https://www.sea-changers.org.uk/how-to-apply'

const ROWS: Row[] = [
  // 63. Same Sussex Community Foundation Main Grants page as row 59 (Lewes
  // Fund) in batch 3, and the same "how it works" section applies.
  { id: 'aff4f25d-a988-4c58-9b46-1512024a4caa', re: /Acting on Climate/,
    restriction: 'unrestricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'Funding provides support for organisations for up to one year, including both core operational costs and project expenses.', confidence: 'high', source_url: SCF } } },

  // 74. A bursary-shaped fund (individuals apply via an organisation), but
  // the page still names two concrete cost categories: work-related
  // equipment for the one-off grants, and training-course delivery for the
  // larger ones. No overall core-costs statement, so restriction is left
  // unstated.
  { id: 'd347a083-1c7b-45e6-8e48-537f53c9ce12', re: /Passionate About Realising Potential/,
    spendTypes: ['capital', 'revenue'],
    cits: { spend_types: { snippet: 'One-off grants of £1,000 which help remove barriers to employment e.g. travel costs or work-related equipment.', confidence: 'high', source_url: CFTW } } },

  // 75. As explicit as this job gets: the foundation states outright that it
  // offers both project and core costs funding, then separately lists salary
  // costs and running-cost contributions among what it funds.
  { id: 'a2c9cddb-26a2-466e-a1ae-6811368e9813', re: /Pilkington Charities/,
    restriction: 'unrestricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'The Community Foundation for Merseyside recognises the funding challenges faced by many charities and is therefore pleased to confirm that this fund is able to offer both project and core costs funding.', confidence: 'high', source_url: PILKINGTON } } },

  // 79. "What don't we fund? ... Applications solely to fund administrative
  // or core operating costs" — an explicit exclusion, so restricted.
  { id: 'e958aa03-860e-4af4-b445-19fbc9507883', re: /Sea-Changers/,
    restriction: 'restricted',
    cits: { spend_restriction: { snippet: 'Applications solely to fund administrative or core operating costs', confidence: 'high', source_url: SEACHANGERS } } },
]

const REPORT: Report[] = [
  { id: '9f2bbfca-91ed-4f0e-a3d2-cf9e1486ce8d', title: 'Lush Charity Pot — Grants', why: 'not_stated',
    quote: 'LUSH Charity Pot grants award funding to \'non-violent direct action\' groups for projects that aim to create long-term change, and are unpopular and often overlooked by other funders.',
    url: 'https://connectedvoice.org.uk/services/support-and-development/funding/lush-charity-pot-animal-protection-environment-and-human',
    note: 'The directory page is readable and silent; Lush\'s own linked guidelines page (lush.com/uk/en/a/charity-pot-funding-guidelines) is behind a 403.' },

  { id: '8ef744d0-2157-4be3-aa94-b276c7b83bb6', title: 'Magdalen Hospital Trust — Vulnerable Children & Young Adults Grants', why: 'not_stated',
    quote: 'The Trust aims to work with small charities and will rarely support capital projects.',
    url: 'https://www.magdalentrust.org.uk/' },

  { id: 'c8c96218-4a00-411c-b015-c2caf632f837', title: 'Make a Difference Locally (MADL)', why: 'not_stated',
    quote: 'The registered charity or good cause must be transparent and accountable – this means that it must be able to confirm what any donation would be used for on request.',
    url: 'https://www.nisalocally.co.uk/community/' },

  { id: '29a300bd-3f90-4ea8-b5b4-80dbc2c21563', title: 'Moondance Foundation — General Funding', why: 'not_stated',
    quote: 'Our Trustees are experienced grant-makers and will use their judgement as to what amount of funding they feel is appropriate and are able to grant to a charity.',
    url: 'https://moondancefoundation.org.uk/funding-faqs' },

  { id: '120e1d2a-d2ef-4663-8934-c0e091138818', title: 'Movement for Good — £1,000 Draws', why: 'not_stated',
    quote: 'Enter your favourite charities for the chance to win £1,000.', url: 'https://movementforgood.com/' },

  { id: 'd4f9cf52-1ec4-490b-aef8-8f5b803708fd', title: 'Museum Transformation Programme', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.artscouncil.org.uk/museum-transformation-programme' },

  { id: '79b3cc06-49f8-4e14-b930-0504bfdcf575', title: 'National Lottery Project Grants', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.artscouncil.org.uk/ProjectGrants' },

  { id: 'b7b435e3-33de-40cf-973e-e43b9f2a95fd', title: 'National Portfolio Investment Programme 2028-33', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://www.artscouncil.org.uk/national-portfolio-investment-programme-2028-33' },

  { id: 'b9529231-32c7-4260-a38a-f498fb13596f', title: 'NFU Mutual Charitable Trust — December 2026 Funding Round', why: 'unreadable',
    quote: '(the page loads but is entirely insurance-site navigation; the charitable trust content is client-rendered)',
    url: 'https://www.nfumutual.co.uk/about-us/charitable-trust/applications-for-funding/' },

  { id: '2dd171df-c033-4b4f-972f-5e1860581b2c', title: 'Oake Sunshine Fund', why: 'not_stated',
    quote: 'The Fund is deliberately broad in scope, and will consider requests for most activities benefitting local residents.',
    url: 'https://www.somersetcf.org.uk/grants-funding/details/oake-sunshine-fund/',
    note: 'A "project costs... or capital costs" sentence on this page belongs to sibling funds (Gooch Charitable Fund, Waste Not Somerset Fund) listed further down, not to Oake Sunshine.' },

  { id: 'b57b4b82-8fc5-4a5c-8aa9-9563293c8823', title: 'One Stop Community Partnership Programme', why: 'unreadable',
    quote: 'Just a moment... Checking your browser...', url: 'https://www.groundwork.org.uk/one-stop-community-partnership/' },

  { id: '93e4b316-cb4b-45fb-b8a8-b74f5fb6b831', title: 'Open Society Foundations — Europe & UK Programmes', why: 'homepage_only',
    quote: 'Every year, the Open Society Foundations give grants to a diverse array of groups and individuals who promote our values—through a unique network that is guided by local voices and global expertise.',
    url: 'https://www.opensocietyfoundations.org/' },

  { id: '322ac2dc-ab9c-4d23-9016-75d98919dfc9', title: 'Places of Worship Renewal Fund', why: 'unreadable',
    quote: 'Just a moment...', url: 'https://historicengland.org.uk/advice/grants/what-we-fund/places-of-worship-renewal-fund/' },

  { id: '07aaea97-8dc4-4650-915a-652c38f9fead', title: 'Reveal and Respond programme', why: 'not_stated',
    quote: 'This project supports partners of serving personnel in raising their aspirations, building their confidence, and developing the skills necessary to secure fulfilling employment.',
    url: 'https://covenantfund.org.uk/programme/reveal-and-respond-programme/' },

  { id: 'e9d845c7-8138-43f3-b4bf-88e3adad003a', title: 'Salford CVS — Grants Programmes', why: 'not_stated',
    quote: 'Over the last 10 years Salford CVS\' grants programme has evolved and grown significantly into one of the largest VCSE focussed grants programme led by a local infrastructure organisation in Greater Manchester.',
    url: 'https://www.salfordcvs.co.uk/funding' },

  { id: 'f635ceba-ed4a-4d76-8260-fe10bf6adf0e', title: 'Shoosmiths Foundation', why: 'unreadable',
    quote: '406 Not Acceptable', url: 'https://www.shoosmiths.com/impact/responsible-business/shoosmiths-foundation' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
