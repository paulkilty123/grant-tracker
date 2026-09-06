// Amounts on 176 live rows — batch 8 (rows 141-160). Nothing written, twenty reported.
//
// The first empty batch of either job, and it is an honest empty rather than a
// thin read. This stretch is three Sainsbury Family trusts that publish no
// figures and take no unsolicited applications, six in-kind services that give
// no money at all, two Young Camden directory listings, and a run of small
// trusts whose entire web presence is a page or two.
//
// The Bothwell Charitable Trust is why the batch matters. Its directory page
// prints "Apply for : No Min - £10,000" and "Grants up to £10,000 are available
// to registered charities who make a positive difference to local communities
// in England, Scotland or Wales" — a sentence that fits Bothwell exactly, on
// Bothwell's own apply_url. Both sit at line 98, under a heading at line 84
// that reads "Other grants to consider". Bothwell's own entry ends at line 80
// and contains no per-grant figure at all. Without the Hollick find in batch 5
// this would have been written, and it would have been wrong.
//
// That is now twice from the same directory. Every Young Camden row in this
// catalogue should be assumed to have a neighbour's number below it until
// someone has looked at where the entry ends.
//
//   npx tsx --env-file=.env.local scripts/amounts-batch-08-2026-09-06.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const BATCH = 8

const ROWS: Row[] = []

const REPORT: Report[] = [
  { id: '59b7e30c-4018-4d22-9e7a-074a5f19ae24', title: 'Steel Charitable Trust', why: 'not_stated',
    quote: 'Suite 2, Hart House Business Centre, Kimpton Road, Luton, Bedfordshire, LU2 0LA',
    url: 'https://steelcharitabletrust.org.uk/',
    note: 'A 167KB site whose rendered text carries no pound sign, and whose /apply/ path returns 404. The quote is the contact block because there is no money sentence to quote.' },
  { id: 'aafb0cc7-0698-4659-97ee-659579042ec1', title: 'Stobart Sustainability Fund', why: 'not_stated',
    quote: 'Our newly created Stobart Sustainability Fund has been set up to support community groups, educational facilities and small businesses with their projects and initiatives to create a green, more sustainable world.',
    url: 'https://eddiestobart.com/corporate-social-responsibility/',
    note: 'apply_url redirects to the company\'s CSR page. The fund gets one paragraph and no figure; the percentages on the page are haulage efficiency statistics.' },
  { id: '32949533-a7ae-4c48-a7a6-57368e083dee', title: 'Strategic Legal Fund for Vulnerable Young Migrants', why: 'not_stated',
    quote: 'A minimum of three Expert Panel members will consider the applications and meet to agree on recommendations for funding.',
    url: 'https://strategiclegalfund.org.uk/how-to-apply/',
    note: 'A detailed how-to-apply page covering eligibility, closing dates and assessment, with no figure. The only "minimum" on it counts panel members.' },
  { id: '895556e0-623d-4661-b245-ad0870a7869a', title: 'Superhighways Digital Support for London VCSEs', why: 'not_stated',
    quote: 'training, tech tips, resources and opportunities for small charities and community groups in London',
    url: 'https://superhighways.org.uk/training-advice-and-technical/',
    note: 'Training and technical advice rather than money.' },
  { id: 'b1b1990e-368f-4080-bcd2-e65033a9b65e', title: 'Sussex Community Foundation — The Chagossian Fund', why: 'pot_only',
    quote: 'The Chagossian Community Fund at Sussex Community Foundation has now given out over £680,000 in grants to 17 organisations.',
    url: 'https://sussexcommunityfoundation.org/grants/how-to-apply/additional-grants/the-chagossian-fund/',
    note: 'A cumulative total across 17 organisations. The fund\'s own page states no per-applicant figure.' },
  { id: '24a624c6-27a3-413f-baa7-742d1cb02c60', title: 'Sussex Crisis Fund — Sussex Community Foundation', why: 'index_over_programmes',
    quote: 'ESTEEM supports over 200 young adults across Sussex each year, aged 14–26, who are facing an average of three to four interconnected challenges.',
    url: 'https://sussexcommunityfoundation.org/grants/',
    note: 'apply_url is the foundation\'s grants index rather than the Crisis Fund, and nothing on the index names a Crisis Fund — the same finding as the timing job, where it was flagged for a relink. The quote is a grantee case study, which is the closest the page comes to a number.' },
  { id: '5cbdb2dd-d274-4619-b468-8dd5bfe54154', title: 'Taproot Foundation Pro Bono Consulting', why: 'not_stated',
    quote: 'We\'re looking for a pro bono consultant with report or brochure design expertise to help us create a polished annual impact report, up to twelve pages.',
    url: 'https://taprootfoundation.org/',
    note: 'Skilled volunteer matching. The only "up to" on the page counts pages of a brochure.' },
  { id: '0ce8470d-9557-40a3-a8d2-ef01daba3f09', title: 'Tech for Good Programme', why: 'not_stated',
    quote: 'We invest in ambitious early-stage tech for good founders. Applications for our next programme will re-open in May 2026.',
    url: 'https://bethnalgreenventures.com/',
    note: 'An investment row with no ticket size on the site; /programme returns 404. The £4.5M on the page is what one portfolio company later raised from other investors.' },
  { id: 'b98c7493-ff5c-42f4-ab1d-b205940e550c', title: 'TechSoup UK Donated & Discounted Technology', why: 'unreadable',
    quote: '', url: 'https://www.techsoup.uk/product-catalog',
    note: 'HTTP 200 with a 205-byte body — an empty shell that renders its catalogue in JavaScript. Read as unread rather than as silent, per the standing rule from the brotli finding.' },
  { id: '1a99b534-f6f5-4792-937d-361f6a0ba067', title: 'The Access Foundation', why: 'not_stated',
    quote: 'Home | About | Contact | Nominate a Charity | News | Annual Reports',
    url: 'https://theaccessgroupfoundation.com/',
    note: 'No pound sign in the rendered text and the nominate-a-charity path returns 404. Grants appear to reach charities by employee nomination rather than open application.' },
  { id: '05d6dbdf-d370-4d34-9a5b-80540e3b06fa', title: 'The Alan and Babette Sainsbury Charitable Fund', why: 'invite_only',
    quote: 'WE DO NOT ACCEPT UNSOLICITED APPLICATIONS',
    url: 'https://abscharitablefund.org.uk/',
    note: 'The page carries fourteen figures from £3,000 to £50,000 and every one of them is a line in a past grants list, not a stated range. With no application accepted there is nothing for a fundraiser to size, so the list is not turned into a range.' },
  { id: '8797b0c0-e49a-4b33-b82c-1dc0657254a3', title: 'The Bothwell Charitable Trust', why: 'pot_only',
    quote: 'The Trust provides around £350,000 each year in grants. The total amount fluctuates depending on their investments.',
    url: 'https://youngcamdenfoundation.org.uk/funding/the-bothwell-charitable-trust',
    note: 'See the header note. The £10,000 on this page belongs to a different funder under "Other grants to consider", and the sentence carrying it describes charities "in England, Scotland or Wales", which fits Bothwell well enough to be convincing. Bothwell\'s own entry states only the annual total and that the trust has no website.' },
  { id: '111ced72-612a-47c1-8043-c9b75455fc0b', title: 'The Dodgson Foundation', why: 'not_stated',
    quote: 'Our funding takes two main forms, being, Annual Grants, and Individual Donations.',
    url: 'https://dodgson.org.uk/applying-for-a-grant/',
    note: 'Two named forms of funding and no figure against either. The grant-making policy is a download the page links to.' },
  { id: 'd1a4d7c2-dc0a-4f97-a910-52ab5d64d355', title: 'The Headley Trust', why: 'not_stated',
    quote: 'The Headley Trust – The Sainsbury Family Charitable Trusts',
    url: 'https://www.sfct.org.uk/the-headley-trust/',
    note: 'First of three Sainsbury Family Charitable Trusts rows in this batch. No pound sign on the page.' },
  { id: '88a1a617-b9b6-4ccd-9f4b-08a30e622cee', title: 'The Health Lottery Foundation', why: 'not_stated',
    quote: 'Grant information - The Health Lottery Foundation',
    url: 'https://thehealthlotteryfoundation.org.uk/grants/grant-information/',
    note: 'A page titled Grant information that contains no figure. This is the row whose reopening date the orchestrating session repaired during the timing job.' },
  { id: '47ffb17f-f14e-4955-b512-7344ddf294f1', title: 'The Hygiene Bank — Products for Organisations', why: 'not_stated',
    quote: 'Sign up to our newsletter',
    url: 'https://thehygienebank.com/',
    note: 'Donated hygiene products distributed through partner organisations. No pound sign in the rendered text.' },
  { id: '1dcfec77-f432-4bc6-8cf4-bf553ea73e4e', title: 'The Indigo Trust', why: 'invite_only',
    quote: 'Submission of proposals is by invitation only.',
    url: 'https://www.sfct.org.uk/indigo-trust/',
    note: 'Second Sainsbury Family trust. No figure, and no unsolicited route to size one against.' },
  { id: '50203489-dcd2-44ec-9a3e-7035b825b4fb', title: 'The Percy Bilton Charity', why: 'not_stated',
    quote: 'Charities assisting disadvantaged youth, people with disabilities, people with mental health problems and older people may apply for grants towards furnishings and equipment (excluding office items).',
    url: 'https://www.percy-bilton-charity.org/',
    note: 'The whole site is 3.5KB and reads as a holding page: two sentences of criteria, a trustee obituary, and no figure. Worth a look beyond amounts — this may not be the charity\'s live site.' },
  { id: '5bb5658f-c526-4fc2-8dbc-a8162056574d', title: 'The Tedworth Charitable Trust', why: 'invite_only',
    quote: 'Unsolicited applications are unlikely to be successful, even if they fall within an area in which the Trustees are interested.',
    url: 'https://www.sfct.org.uk/the-tedworth-charitable-trust/',
    note: 'Third Sainsbury Family trust. No figure on the page.' },
  { id: '036a2937-bb8f-4f9e-9840-33a4bd450b33', title: 'Tim Parry Johnathan Ball Foundation Grants', why: 'not_stated',
    quote: 'they successfully commissioned a £3.3m building, which was named the "Tim Parry Johnathan Ball Peace Centre".',
    url: 'https://timparryjohnathanballfoundation.org.uk/',
    note: 'The only figure on the site is the cost of a building the foundation put up in 2000 and has since sold. It became a grant-maker in March 2025 and its site is still its history, as the timing job also found.' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
