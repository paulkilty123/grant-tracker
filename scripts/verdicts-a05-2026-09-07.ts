// Verdicts — pile A, batch 5, rows 61-67. The last seven, and the end of pile A.
//
// One publish, one park, three rejects, two holds.
//
// The park needed nothing written: Trading for Good already holds "Spring 2027"
// and 2027-03-01, and the page says applications open again in Spring 2027.
//
// Two of the three rejects are duplicates whose own pages cannot be read —
// Triodos' apply_url 404s and the Zoom row points at a 205-byte TechSoup shell
// — so both carry dupe_of rather than a page sentence, under the ruling
// grant-tracker-be made on 7 Sept. Batch 3's two holds of the same kind have
// been restated as rejects in the same commit.
//
// Ufi is the index-over-programmes case with an admin pin on top: the row holds
// £30,000 to £150,000 and the page's four calls are £10k, £30k-£60k,
// £200k-£250k and one that is invitation only. No single figure fits.
//
//   npx tsx --env-file=.env.local scripts/verdicts-a05-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 5

const VMO2 = 'https://news.virginmediao2.co.uk/apprenticeship-talent-fund/'

const ROWS: Row[] = [
  // 61. A clean park with nothing to write: next_open_date is already
  // "Spring 2027" and next_open_date_parsed 2027-03-01, which is what the page
  // says. Almost every field on this row is admin-held, including the amounts;
  // the page's £800 opening instalment sits under the pinned amount_min of
  // £1,000, which is worth knowing but is not a reason to move a pin.
  { id: '8b5c4025-318d-4354-a766-228b361ffba3', re: /Trading for Good/, pile: 'A', verdict: 'park',
    quote: 'Applications will open again in Spring 2027',
    url: 'https://www.the-sse.org/programme/trading-for-good-community-business/' },

  // 62. Duplicate, and the row's own page is gone: /business-banking 404s while
  // the live row sits on /business-lending. The sentence is from the bank's
  // /business page, which is where the 404 leads a reader next.
  { id: 'ec70ac6e-bd4e-4891-b54a-f4cff376b797', re: /Triodos/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'We provide specialist, sustainable lending, finance and savings accounts for businesses and organisations working to tackle the biggest challenges of our time.',
    url: 'https://www.triodos.co.uk/business',
    dupe_of: ['6c5b16b7'],
    for_paul: 'Duplicate of the live row 6c5b16b7, Triodos Business Loans, at triodos.co.uk/business-lending. This row\'s apply_url, /business-banking, now returns 404. Batch 1 rejected a third Triodos row on the same grounds.' },

  // 63. Rule 5 and index-over-programmes at once. The four calls on the page are
  // on four different timetables and none of them is £30,000 to £150,000.
  { id: '37a8f875-7834-495f-8e14-a0fade147ebf', re: /Ufi VocTech Trust/, pile: 'A', verdict: 'hold',
    quote: 'Grant funding for vocational technology from £10k to £250k. Help your ideas thrive with funding and expert support from Ufi.',
    url: 'https://ufi.co.uk/grant-funding/',
    for_paul: 'A funder-level index over four calls, and the admin-pinned £30,000 to £150,000 matches none of them: VocTech Together is up to £10,000, VocTech Activate £30,000 to £60,000, VocTech Challenge £200,000 to £250,000, and VocTech Ignite is invitation only. Today Challenge is closed and Activate says applications open in early 2027 with a stage one deadline of 2 February 2027. Splitting this into one row per call, starting with Activate, is the fix; a single date or figure is not.' },

  // 64. Invitation only, and only to organisations that have already applied
  // unsuccessfully. Test 2 of the programmes brief, without ambiguity.
  { id: '6ce1fac3-9818-4f0c-bfde-7186f74320ae', re: /VocTech Ignite/, pile: 'A', verdict: 'reject', code: 'out_of_scope',
    quote: 'Grant status: By invitation only to projects who have previously submitted an unsuccessful application to a Ufi grant funding round.',
    url: 'https://ufi.co.uk/grant-funding/voctech-ignite/',
    for_paul: 'Invitation only, and closed even to that: the invitation goes only to projects that have already applied to a Ufi round and been turned down. Nothing here a fundraiser can apply to.' },

  // 65. Publish. Open to charities and social enterprises by name, with the
  // route written out, and the £1m is explicitly the pot rather than an award,
  // so it stays out of the columns and goes in typical_award. amount_min,
  // amount_max, location_tag and eligible_structures are all admin-pinned and
  // none of them is contradicted, so nothing needed moving.
  //
  // Worth saying plainly: the fund launched in August 2025 and the page carries
  // no closing date and no closed notice. It reads as open and the page is
  // current, but a levy pot can empty quietly.
  { id: '7b924e63-a2a6-42f2-9968-4786de21cb47', re: /Apprenticeship Talent Fund/, pile: 'A', verdict: 'publish',
    quote: 'If you\'re a small business, charity, social enterprise or local authority that doesn\'t already pay into the levy, this talent fund is for you.',
    url: VMO2,
    fields: { is_rolling: true },
    cits: {
      is_rolling: { snippet: 'If you\'re interested in accessing funding, the first step is to register an account or sign into the Government portal . Once you\'re registered and signed up you can request funds from Virgin Media\'s pot.', confidence: 'high', source_url: VMO2 },
    },
    brief: {
      who_can_apply: 'Small businesses, charities, social enterprises and local authorities that do not already pay the apprenticeship levy, which means an annual wage bill under £3 million. You can apply when hiring a woman, or a person from a global majority background, into a STEM apprenticeship. You do not need to have an apprentice already.',
      what_they_fund: 'The cost of training an apprentice, paid as a transfer from Virgin Media O2\'s apprenticeship levy pot. The focus is on getting more women into STEM roles and supporting people from global majority backgrounds into the industry.',
      how_to_apply: 'Apply through the Government\'s apprenticeship levy website rather than to Virgin Media O2. Set up a GOV.UK One Login with a work email address, create an apprenticeship service account, then visit the portal and request funds from Virgin Media\'s pot. Training funds are released once the request is approved.',
      exclusions: 'The funding does not cover an apprentice\'s salary, only their training, and the employer still has to pay the salary. Organisations that already pay into the apprenticeship levy, which means a wage bill over £3 million, are not the audience for this fund.',
      decision_timeline: 'The page states no decision timeline. It says training funds become available once the request through the Government portal is approved.',
      typical_award: 'The page states no per-applicant figure. £1 million is the fund\'s total across every recipient, and what an employer receives is the cost of the apprenticeship training it is hiring for, drawn from Virgin Media O2\'s levy pot.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'If you\'re a small business, charity, social enterprise or local authority that doesn\'t already pay into the levy, this talent fund is for you. Organisations can apply for funding when hiring a woman or person from the global majority undertaking a STEM based apprenticeship.', confidence: 'high', source_url: VMO2 },
      what_they_fund: { snippet: 'The funds are available to cover the cost of training an apprentice and can be drawn down from Virgin Media\'s pot.', confidence: 'high', source_url: VMO2 },
      how_to_apply: { snippet: 'Before setting up your apprenticeship service account you\'ll need a GOV.UK One Login account linked to an email address you use for work.', confidence: 'high', source_url: VMO2 },
      exclusions: { snippet: 'Funds to cover training will be available once approved. Please note, organisations applying are still required to cover the cost of the salary.', confidence: 'high', source_url: VMO2 },
      decision_timeline: { snippet: 'Funds to cover training will be available once approved.', confidence: 'high', source_url: VMO2 },
      typical_award: { snippet: 'Virgin Media O2 is unlocking up to £1 million in funding to help small businesses, charities, social enterprises, and local authorities recruit and train the next wave of apprentices — creating real career opportunities that power long-term growth.', confidence: 'high', source_url: VMO2 },
      open_status: { snippet: 'If you\'re interested in accessing funding, the first step is to register an account or sign into the Government portal .', confidence: 'high', source_url: VMO2 },
    } },

  // 66. Same shape as the Nationwide Foundation hold in batch 3: apply_url is a
  // home page, and the page one level in lists programmes without saying which
  // of them is open or who may apply.
  { id: 'efb34147-a31c-4088-bd85-f8ab17980990', re: /Young Foundation/, pile: 'A', verdict: 'hold',
    quote: 'Part of our work, as a community-led intermediary funder, supports funders and grant-making bodies with the design and delivery of grant programmes',
    url: 'https://www.youngfoundation.org/innovation-and-practice/',
    for_paul: 'apply_url is the foundation\'s home page, which names no programme, no route and no figure. Its innovation and practice page does list funding programmes, including the Community Knowledge Fund and Community Research Networks, but mixes current and finished ones with no dates and no eligibility, so nothing there can carry a brief either. Relink to a named programme if one is open, or reject it as an intermediary that funds funders rather than applicants.' },

  // 67. Duplicate, proved from the database because the page gives nothing: the
  // row points at techsoup.uk/partners, which returns 200 with a 205-byte empty
  // body — the same TechSoup shell behind the Microsoft row in batch 3.
  { id: 'cfdaf194-6b06-4aab-81fd-2310d31197ba', re: /Zoom for Nonprofits/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: '', url: 'https://www.techsoup.uk/partners',
    dupe_of: ['b7f40968'],
    for_paul: 'Duplicate of the live row b7f40968, Zoom for Nonprofits, which points at Zoom\'s own page. This row points at techsoup.uk/partners, which returns an empty 205-byte body, so the verdict rests on the database rather than the page. The TechSoup catalogue itself is already carried as the live row b98c7493.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'A', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
