// Spend-restriction — batch 1, rows 1-20. Six written, one pinned or wrong is
// not the case here; fourteen not_stated, one unreadable.
//
// Two funding.scot listings (row 1 and, in a later batch, row 50) carry a
// structured "Type of cost" field rather than a sentence. Both trusts have no
// site of their own, so the listing is the only page there is; the field is
// read at confidence 'med' rather than 'high' because it is the directory's
// own categorisation rather than the funder's prose.
//
// Two Young Camden Foundation trusts in this batch (Adint, Ancaster) share a
// page template with several sibling trusts cross-linked in a sidebar. Adint's
// own "Eligible Expenditure" field says only "general charitable work" — a
// theme, not a spend rule — and is left not_stated; a nearby "Discretionary
// capital grants..." sentence that regex flagged turned out to belong to a
// different trust's sidebar entry (Clothworkers' Foundation) on the same page,
// exactly the "quote about a sibling" trap. Ancaster's own field, by contrast,
// reads "Costs associated with eligible projects" — restricted.
//
// Castle Studies Trust's own page says nothing; its linked Criteria PDF does:
// "Costs only specific to the carrying out the specific task can be included."
//
//   npx tsx --env-file=.env.local scripts/spend-batch-01-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row, type Report } from './spend-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 1

const SINCLAIR = 'https://funding.scot/funds/a0Rb0000003iiAXEAY/a-sinclair-henderson-trust'
const ALDI = 'https://www.aldi.co.uk/scottishsportfund'
const ANCASTER = 'https://youngcamdenfoundation.org.uk/funding/ancaster-trust'
const ARMY = 'https://armybenevolentfund.org/need-our-help/charity-grants/'
const ACWI = 'https://arts.wales/funding/international/international-opportunities-fund'
const AHP = 'https://austin-hope-pilkington.org.uk/'
const CASTLE_PDF = 'https://www.castlestudiestrust.org/docs/Castle-Studies-Trust-Grant-Giving-Criteria-2026.pdf'

const ROWS: Row[] = [
  // 1. funding.scot's own structured field, med confidence: it is the
  // directory's categorisation of the fund rather than the trust's own words,
  // and the trust has no site of its own.
  { id: '1d6af16c-0060-45b4-8f1e-051888785890', re: /Sinclair Henderson/,
    spendTypes: ['capital', 'revenue'],
    cits: { spend_types: { snippet: 'Type of cost: Capital, Revenue', confidence: 'med', source_url: SINCLAIR } } },

  // 6. "essentials like equipment" names capital; "kits, training costs" are
  // activity/revenue costs. No restriction stated either way.
  { id: '5eff1abd-978d-442e-8f7c-01d59b541f42', re: /Aldi Scottish Sport Fund/,
    spendTypes: ['capital', 'revenue'],
    cits: { spend_types: { snippet: 'This annual initiative provides grants to help registered community sports organisations with essentials like equipment, kits, training costs and more - encouraging participation for all ages and abilities.', confidence: 'high', source_url: ALDI } } },

  // 8. Ancaster's own field (not the Adint page's sidebar quote about
  // Clothworkers' Foundation).
  { id: 'f8a83056-ccaf-4b10-8b45-aa7b7b01a080', re: /Ancaster Trust/,
    restriction: 'restricted',
    cits: { spend_restriction: { snippet: 'Costs associated with eligible projects are eligible for funding.', confidence: 'high', source_url: ANCASTER } } },

  // 9. "will consider contributing to an organisation's core operating costs"
  // is unrestricted; salaries are named as part of that, so revenue too.
  { id: '2fc1c173-7762-437e-b9cd-b8cccf7b4a79', re: /Army Benevolent Fund/,
    restriction: 'unrestricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'We do not normally fund specific (i.e. named) posts and salaries, but will consider contributing to an organisation\'s core operating costs of which we recognise general salary costs will be a part of.', confidence: 'high', source_url: ARMY } } },

  // 11. "Activity that you cannot apply for" lists both capital items AND
  // "general running costs and ongoing overheads" as excluded — the fund pays
  // project costs (travel, fees, artist costs) only. Restricted, and capital is
  // not added: it is named as excluded, not as an eligible spend type.
  { id: '13837671-a3eb-4045-a5e7-2a7bf2951f4d', re: /International Opportunities Fund/,
    restriction: 'restricted',
    cits: { spend_restriction: { snippet: 'Your organisation\'s general running costs and ongoing overheads (or a percentage of these costs), for example staff salaries, rent, utilities and directors\' indemnity insurance.', confidence: 'high', source_url: ACWI } } },

  // 12. "We don't fund salaries for charity staff unless specifically employed
  // for the project concerned" — salaries are eligible only when tied to the
  // funded project, which is the restricted pattern; the dedicated exclusions
  // page separately rules out "Capital appeals, including equipment."
  { id: 'df623476-199d-402d-8782-1837fb1d4692', re: /Austin and Hope Pilkington/,
    restriction: 'restricted', spendTypes: ['revenue'],
    cits: { spend_restriction: { snippet: 'We don\'t fund salaries for charity staff unless specifically employed for the project concerned.', confidence: 'high', source_url: AHP } } },

  // 20. The apply page names only the kind of research funded, not spend
  // rules; the linked Criteria PDF is explicit.
  { id: 'fb9e0451-cae6-4bfc-92dc-962afffbae9f', re: /Castle Studies Trust/,
    restriction: 'restricted',
    cits: { spend_restriction: { snippet: 'Costs only specific to the carrying out the specific task can be included in the grant (e.g. travelling to and from site in question).', confidence: 'high', source_url: CASTLE_PDF } } },
]

const REPORT: Report[] = [
  { id: '86380b2e-1c74-4cd3-b560-663a021bc097', title: 'Adint Charitable Trust', why: 'not_stated',
    quote: 'The grants are to be used for general charitable work.', url: 'https://youngcamdenfoundation.org.uk/funding/adint-charitable-trust' },

  { id: '475e745e-25cb-49c4-b397-fcdfee970df1', title: 'AF3: Supporting Partners programme', why: 'not_stated',
    quote: 'The Supporting Partners programme aims to strengthen support for partners of serving military personnel, including reservists, by improving access to services, building on skills and experience, enabling informal support networks and promoting mental health and wellbeing.',
    url: 'https://covenantfund.org.uk/programme/af3-supporting-partners-programme/' },

  { id: 'c40dc901-c460-4358-9a86-bd5a13878966', title: 'AI For All', why: 'not_stated',
    quote: 'Each participating organisation is matched with a mentor whose expertise aligns with its goals and challenges.',
    url: 'https://www.thedifferent.foundation/ai-for-all' },

  { id: '9d9da328-3680-4c33-9da2-4e7cdcbaca8c', title: 'Albert Gubay Charitable Foundation Grants', why: 'not_stated',
    quote: 'Since 2016, the Albert Gubay Charitable Foundation has awarded over £100 million to registered charities in England, the Isle of Man, Republic of Ireland, and Wales.',
    url: 'https://www.albertgubayfoundation.org/' },

  { id: '8c168203-e428-44f5-a1f7-e1c8268a83c5', title: 'An Official Oral History of Women Veterans in the UK', why: 'not_stated',
    quote: 'An official oral history project documenting the lived experiences of women veterans in the UK.',
    url: 'https://www.find-government-grants.service.gov.uk/grants/an-official-oral-history-of-women-veterans-in-the-uk-1' },

  { id: 'b774d28f-4f07-4ebd-8702-8f3c3e0cfe5a', title: 'Arts Council of Wales — Have a Go', why: 'not_stated',
    quote: 'We recommend reading the full guidelines before submitting your application.',
    url: 'https://arts.wales/funding/creative-learning/have-a-go' },

  { id: '0f6795e2-bdd9-4746-b1d8-88a6ea469824', title: 'Barbara Ward Children\'s Foundation', why: 'not_stated',
    quote: 'Since then the Trustees have reviewed more than 7600 grant requests and authorised grants of over £12 million to more than 465 organisations (see Grant List).',
    url: 'https://www.bwcf.org.uk/' },

  { id: '2b0fb0f0-6bb6-4803-baf7-8a289b115976', title: 'Baring Foundation — Strengthening Civil Society Programme', why: 'not_stated',
    quote: 'This programme is currently closed. Future open round opportunities will be posted on this website, as well as in our e-newsletter and on our social media.',
    url: 'https://baringfoundation.org.uk/programme/strengthening-civil-society/' },

  { id: '9891bd8a-798b-4c2c-98d5-f25ba9b10faf', title: 'BE:IMPACT Prize 2026', why: 'unreadable',
    quote: 'Loading content...', url: 'https://blueearthsummit.com/impact-prize' },

  { id: 'd83e1ad9-b8d5-4367-8a26-0fed8b5698f4', title: 'Beinneun Community Fund', why: 'not_stated',
    quote: 'Foundation Scotland maintains a standard list of exclusions which cannot be funded.',
    url: 'https://foundationscotland.org.uk/beinneun-community' },

  { id: 'c51eaae1-2007-4930-a45a-4da9f7542c1c', title: 'Bernard Sunley Foundation — Social Welfare Grants', why: 'unreadable',
    quote: '(client-rendered category table; no prose survives a text read)', url: 'https://bernardsunley.org/our-grant-giving/social-welfare/' },

  { id: 'ef68a7d7-4448-4a2e-8f44-341ef2c3148b', title: 'Bolton Housing Partnership — Community Investment Grants', why: 'not_stated',
    quote: 'Find examples of projects that have previously been funded through Bolton CVS managed grants here.',
    url: 'https://www.boltoncvs.org.uk/funding/bolton-housing-partnership-grants/' },

  { id: '0346c786-fb9c-4df9-9307-205a4337acab', title: 'C B & H H Taylor 1984 Trust — Grants', why: 'not_stated',
    quote: 'The CB & HH Taylor Trust provides support to charitable organisations serving the West Midlands county (Birmingham, Coventry, Wolverhampton, Dudley, Sandwell, Solihull & Walsall).',
    url: 'http://www.cbandhhtaylortrust.com/guidelines-for-grant-programmes' },
]

async function main() {
  await runBatch({ batch: BATCH, rows: ROWS, report: REPORT, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
