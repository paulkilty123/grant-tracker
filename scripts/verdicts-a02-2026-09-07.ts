// Verdicts — pile A, batch 2, rows 16-30.
//
// One publish, six rejects, eight holds.
//
// Two rows in this batch are the reason a job like this exists, and neither was
// visible from the catalogue.
//
//   Foundation East  the CDFI's domain has been taken over. foundationeast.org
//                    now serves a gambling affiliate site — "EE Pay By Mobile
//                    Casino UK: 2026's Premier Guide | Foundation East", with
//                    casino bonus tables where the loan products used to be,
//                    and a fabricated staff bio under the charity's name. The
//                    row is hidden so no fundraiser has seen it, but the row
//                    still points there.
//   FSI              thefsi.org now serves a bare Apache directory index.
//
// Four rows point at a Charity Commission register entry rather than a funder's
// page. That is a regulator record, not an application route: it can carry who
// may apply and sometimes a ceiling, and it can never carry how to apply. They
// are held rather than rejected because the trusts are real and giving — Harford
// £39,600 a year, Djanogly £330,942 — and whether to carry a funder a fundraiser
// cannot actually approach is Paul's call, not a reading of the page.
//
//   npx tsx --env-file=.env.local scripts/verdicts-a02-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 2

const ERF = 'https://www.sibgroup.org.uk/funds/energy-resilience-fund/'
const HS  = 'https://henrysmith.foundation/grants/'
const REG = 'a Charity Commission register entry rather than a funder page: it can say who may apply and never how to apply, so the row cannot carry a complete brief.'

const ROWS: Row[] = [
  // 16. Third wholesaler row in two batches, and the £25k-£250k on the page is
  // what CDFIs lend on to small businesses, not what CIEF gives anyone.
  { id: '085f3c7e-9021-41cb-a66b-1342830ed886', re: /Community Investment Enterprise Facility/, pile: 'A', verdict: 'reject', code: 'out_of_scope',
    quote: 'We established the Community Investment Enterprise Facility (CIEF) in 2015 (in partnership with Social Investment Scotland) to provide CDFIs with the capital they need to meet demand',
    url: 'https://bettersocietycapital.com/information/community-development-finance-institutions/',
    for_paul: 'CIEF puts capital into CDFIs, which then lend to small businesses. The £25,000 to £250,000 on the row is what a CDFI lends on, not what this facility offers an applicant. Third Better Society Capital row in this pile with the same shape.' },

  // 17. The programme URL now redirects to a workspace business.
  { id: 'cbe84427-1a04-4fbc-8f8c-b09f7af4385d', re: /CPCA Social Impact Investment Fund/, pile: 'A', verdict: 'reject', code: 'dead_url',
    quote: 'Social impact workspace, next to Peterborough United FC stadium.',
    url: 'https://alliaworkspace.co.uk/',
    for_paul: 'futurebusinesscentre.co.uk now redirects to alliaworkspace.co.uk, which sells flexible offices and meeting rooms. No trace of the CPCA fund anywhere on it.' },

  // 18. See the header note on register entries.
  { id: '043634a3-19fa-4636-9a0f-d5449163948c', re: /DCR Allen/, pile: 'A', verdict: 'hold',
    quote: 'Total expenditure: £163,658',
    url: 'https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/277293/charity-overview',
    for_paul: `apply_url is ${REG} The trust is real and spending £163,658 a year, and it has no website. Carry it as a funder a fundraiser can only write to, or reject it as unapproachable?` },

  // 19. Money flowing the wrong way: a desk you rent.
  { id: '0a9e6108-c367-4a93-8df5-d5268d03b7b2', re: /Desk Space/, pile: 'A', verdict: 'reject', code: 'out_of_scope',
    quote: 'Looking for desk space on an ad hoc basis with no ongoing commitment? Then we can offer you a hot desk for as little as £30 per day.',
    url: 'https://www.thinknpc.org/about-npc/desk-space-and-meeting-room-hire/',
    for_paul: 'Priced workspace hire, not an in-kind offer: £120 a month for a fixed desk, £30 a day for a hot desk. The row carried it as in-kind with a £200 ceiling, which is a price rather than an award.' },

  // 20. Closed permanently and says so.
  { id: '9de97466-69b9-4c0e-a182-83c821b109b8', re: /Edward Gostling/, pile: 'A', verdict: 'reject', code: 'closed_for_good',
    quote: 'We have closed all our grant application programmes and instead have invited carefully chosen charities to work with us going forward as Legacy Partners.',
    url: 'https://edwardgostlingfoundation.org.uk/',
    for_paul: 'All application programmes closed; the foundation now works only with invited Legacy Partners while it spends out.' },

  // 21. Corporate-facing page, and apply_url is pinned so it cannot be relinked here.
  { id: '97be169d-2e01-4157-a057-4e974fdfcb8d', re: /Skilled Volunteering/, pile: 'A', verdict: 'hold',
    quote: 'Coaches and individuals meet virtually for up to six sessions over the course of several weeks.',
    url: 'https://www.bitc.org.uk/social-impact-and-employee-volunteering/',
    for_paul: 'The page is written for corporate members wanting to deploy their staff, and states no route for a charity to request support. Its apply_url is admin-pinned, so it cannot be relinked in this job. Probably a reject as a membership body, but the pin makes it yours.' },

  // 22. Researched as the batch's publish, then caught by the dedup query in
  // rule 7 — which is the whole reason that rule exists. The catalogue already
  // carries this fund live as 6e6e8050, "Energy Resilience Fund — Social
  // Investment Business", and that row's £25,000 to £250,000 matches the page
  // exactly. The seven-field brief researched for this row is not written, but
  // the reading behind it is in the verdict for whoever compares the two rows.
  { id: 'ba76fee4-7d8e-48e5-acac-f9df576c320c', re: /Energy Resilience Fund/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Currently open? yes',
    url: ERF,
    for_paul: 'Duplicate of the live row 6e6e8050, Energy Resilience Fund — Social Investment Business, whose £25,000 to £250,000 already matches the fund page. This hidden row points at goodfinance.org.uk, a third-party directory, and carries £60,000 to £15,000,000, which describes SIB\'s lending in general rather than this fund. Two smaller things while you are there: the live row\'s apply_url uses /fund/ where the page I read today is /funds/, and there is a second live SIB row (583f0378, Social Investment Business — Resilience Fund) pointing at the funding index.' },

  // 23. Host did not answer.
  { id: '985b3216-a7bb-43ca-b086-3e81c1e69126', re: /EY Foundation/, pile: 'A', verdict: 'hold',
    quote: '',
    url: 'https://ey.foundation/',
    for_paul: 'ey.foundation did not answer on repeated attempts, so nothing could be read today. Needs a re-read before any verdict.' },

  // 24. See the header note. This is the one to look at first.
  { id: '29d000d3-e3fa-439e-89f8-e03109af0f44', re: /Foundation East/, pile: 'A', verdict: 'reject', code: 'dead_url',
    quote: 'EE Pay By Mobile Casino UK: 2026\'s Premier Guide | Foundation East',
    url: 'https://www.foundationeast.org/',
    for_paul: 'The CDFI\'s domain has been taken over and now serves a gambling affiliate site under the charity\'s name, complete with casino bonus tables and an invented staff bio. Reject the row, and it may be worth checking whether anything else in the catalogue points at foundationeast.org.' },

  // 25. Dead host, serving a directory listing.
  { id: 'e31c28ad-10a0-4d7c-9076-33c8f8cf91e9', re: /FSI Small Charity/, pile: 'A', verdict: 'reject', code: 'dead_url',
    quote: 'Index of / Name Last Modified Size cgi-bin Proudly Served by LiteSpeed Web Server at thefsi.org Port 443',
    url: 'https://thefsi.org/',
    for_paul: 'thefsi.org serves a bare Apache directory index with one cgi-bin folder last modified in 2023. The Foundation for Social Improvement\'s site is gone.' },

  // 26. Real and open, renamed, and pinned shut against tidying.
  { id: '0b03c55e-32d9-4054-b1cb-353260f01a96', re: /Gatwick Foundation Fund/, pile: 'A', verdict: 'hold',
    quote: 'The maximum grant available is £10,000 for exceptional projects, although many successful applications will be for less than this amount.',
    url: 'https://sussexcommunityfoundation.org/grants/how-to-apply/main-grants/london-gatwick-community-fund/',
    for_paul: 'The fund is real, open and has been renamed the London Gatwick Community Fund; apply_url redirects to the new page. Seven of its fields are admin-pinned, including apply_url and a deadline of 5 June that has passed, so nothing can be tidied here. Sussex Main grants close on 11 September. Unpin and it is a publish.' },

  // 27, 28. Two more register entries. Harford's carries real criteria and a
  // ceiling and still cannot say how to apply.
  { id: '65961bc8-8648-4c82-9b5e-4a4fd0d2ff68', re: /General Grants/, pile: 'A', verdict: 'hold',
    quote: 'Grants are made to registered charities.',
    url: 'https://register-of-charities.charitycommission.gov.uk/en/about-the-register-of-charities/-/charity-details/280500',
    for_paul: `apply_url is ${REG} The Djanogly Foundation spends £330,942 a year and has no site of its own.` },
  { id: '2506cc66-7ba4-4da7-80fb-070b5961783d', re: /Harford/, pile: 'A', verdict: 'hold',
    quote: 'We are a small Family Trust making grants (maximum £2,000) to registered charities (not individuals).',
    url: 'https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/299945/charity-overview',
    for_paul: `The best of the four register rows: the entry states who may apply, a £2,000 ceiling and that individuals are excluded, which is three of the seven brief fields. It still cannot say how to apply, because ${REG}` },

  // 29, 30. Two Henry Smith programmes, one page, and the statuses do not survive
  // a text read.
  { id: '1cf9567c-46b3-494d-823f-b906dead142a', re: /Career Ready/, pile: 'A', verdict: 'hold',
    quote: 'You can see which programmes are currently open below. If your work aligns with our priorities but funding isn\'t open right now, sign up to our mailing list to hear when programmes open.',
    url: HS,
    for_paul: 'Career Ready and Maternity Equity are both cards on this one page, and the page carries exactly one "Coming Soon" badge and one "Closed" badge. Which belongs to which does not survive a text read, and guessing would put a wrong status on one of them. Needs a browser look; the two rows should be decided together.' },
  { id: 'cf29bfb0-3223-4a7d-a279-c6345b495681', re: /Maternity Equity/, pile: 'A', verdict: 'hold',
    quote: 'You can see which programmes are currently open below. If your work aligns with our priorities but funding isn\'t open right now, sign up to our mailing list to hear when programmes open.',
    url: HS,
    for_paul: 'Paired with the Career Ready row above and blocked the same way. This row already records "Listed as Coming Soon; no opening date published", which is a park only if a date appears; today the page still gives none.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'A', rows: ROWS, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
