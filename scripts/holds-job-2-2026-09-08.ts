// Holds handoff (2026-09-08) — job 2: seven review rows whose apply_url is a
// home page or an index, needing relinked to the fund's own page. fetch direct,
// then the Chrome browser — never a third-party proxy (dropped after
// grant-tracker-be's job 1 catch: a proxy-rendered page is not what a checker
// re-reading the URL sees).
//
// No publish, though one row got close. Social Investment Cymru Loan Fund read
// cleanly to the Communities Investment Fund page (£50k-£250k, direct fetch, no
// proxy) and was about to be relinked and published when the dedup query — run
// before every publish, per the brief — caught a LIVE row for exactly this
// fund, same amounts, apply_url one path segment different. Rejected as the
// duplicate instead of touching the live one. Worth carrying forward: WCVA's
// Social Investment Cymru actually runs five separately paged products today,
// not the three the 7 Sept note counted; the three not already live are listed
// as candidates.
//
// Two more rejects, both out_of_scope, both with nothing on today's page to
// apply to: Young Foundation's two named programmes are a finished funding
// round (Community Knowledge Fund phase 2, past tense) and a
// sign-up-for-updates research partnership (Community Research Networks),
// neither with an apply route; Nationwide Foundation says outright it "cannot
// accept unsolicited applications for funding" while its current strategy
// stays with existing partners.
//
// Four hold, unreadable — not the outcome the brief expected for these rows,
// but real: rocbf.co.uk, the two specific london.gov.uk fund pages, and the
// whole communityfoundation.org.uk domain are all behind a JS
// verification wall today that neither direct fetch nor the browser (fresh
// tab included, waited out repeatedly) can clear. ROCB's likely fund page and
// the GLA's own hub site were both found or checked as far as possible without
// a page to actually cite.
//
//   npx tsx --env-file=.env.local scripts/holds-job-2-2026-09-08.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runJob, type Row } from './holds-lib-2026-09-08'

const APPLY = process.argv.includes('--apply')

const CIF = 'https://wcva.cymru/communities-investment-fund/'
const SIC = 'https://wcva.cymru/social-investment-cymru/'

const ROWS: Row[] = [
  // 1. Both the old .org.uk apply_url and the live .co.uk site's product page
  // are unreadable today (Please wait while your request is being verified,
  // never clears — fetch, browser, and a fresh tab all tried).
  {
    id: 'ec46883d-f99b-4295-a61c-6b6eb06c2aa1', re: /ROCB CDFI Loans/, job: 2,
    verdict: 'hold', read_via: 'unreadable',
    quote: '',
    url: 'https://www.rocbf.co.uk/cashflow-loans-for-not-for-profits/',
    candidates: [
      { url: 'https://www.rocbf.co.uk/', note: 'Robert Owen Community Banking\'s homepage; same bot wall today. Its nav (readable on an earlier, since-disallowed proxy read) lists a "Cashflow loans for not-for-profits" product matching this row\'s notes, but nothing on the live site could be confirmed today.' },
    ],
    for_paul: 'The stored apply_url (rocbf.org.uk) is dead — the live domain is rocbf.co.uk — but rocbf.co.uk is bot-walled on every path tried today (fetch, browser, a fresh tab): "Please wait while your request is being verified..." never clears. Could not confirm or relink to the Community Cashflow Fund page today. There\'s also an archived row (0362621b, Robert Owen Community Banking — Wales Social Enterprise Lending) that already carries rocbf.co.uk with every field pinned; not touched. Whether the two merge is your call, once the site is readable again.',
  },

  // 2. Not a publish after all: dedupCandidates found a LIVE row for exactly
  // this fund (279016ce, "WCVA Social Investment Cymru — Communities
  // Investment Fund", published, £50k-£250k, apply_url one path segment
  // different from the one just read). Read cleanly via direct fetch — both
  // the SIC overview and the CIF page — no proxy involved — but the dedup
  // query is what actually decides this row: reject/duplicate.
  {
    id: '829751a6-9ad0-409a-818c-e32d62f0d1ad', re: /Social Investment Cymru Loan Fund/, job: 2,
    verdict: 'reject', code: 'duplicate', read_via: 'fetch',
    quote: '',
    url: CIF,
    dupe_of: ['279016ce-2758-436a-9387-6fa286c0c2dd'],
    candidates: [
      { url: 'https://wcva.cymru/wales-micro-loan-fund/', note: 'Wales Micro Loan Fund: £1,000 to £50,000, general-purpose micro loans for social businesses in Wales, funded via the Development Bank of Wales, up to 10 years to repay. Not carried live yet, as far as this row list shows.' },
      { url: 'https://wcva.cymru/community-asset-loan-fund/', note: 'Community Asset Loan Fund: up to £300,000, Welsh Government funded, for voluntary organisations, charities and CICs buying property for community use. Not carried live yet, as far as this row list shows.' },
      { url: 'https://wcva.cymru/clean-energy-fund/', note: 'Clean Energy Fund: 50% grant (£25k-£500k) plus 25% interest-free loan (up to £250k), but restricted to organisations based in or serving North Wales only. Not carried live yet, as far as this row list shows.' },
    ],
    for_paul: 'Was about to relink and publish this to Communities Investment Fund (£50k-£250k, read cleanly today) when the dedup query caught a LIVE duplicate: 279016ce, "WCVA Social Investment Cymru — Communities Investment Fund", published, same amounts, apply_url one path segment different (wcva.cymru/funding/social-investment-cymru/communities-investment-fund/ vs the wcva.cymru/communities-investment-fund/ just read — the site appears to serve the fund at both paths). Rejecting this row as the duplicate rather than touching the live one. Worth knowing: WCVA\'s Social Investment Cymru actually runs five separately paged products today (Bridge and Build Loans, Clean Energy Fund, Community Asset Loan Fund, Communities Investment Fund, Wales Micro Loan Fund), not the three the 7 Sept note counted — the three not already live are listed as candidates in case any is worth adding separately later.',
  },

  // 3. Both named programmes on the innovation-and-practice page are the same
  // story once read individually: no apply route, no eligibility, no dates.
  {
    id: 'efb34147-a31c-4088-bd85-f8ab17980990', re: /Young Foundation Social Innovation Support Programmes/, job: 2,
    verdict: 'reject', code: 'out_of_scope', read_via: 'fetch',
    quote: 'The Community Knowledge Fund supports community groups and organisations around the UK with grants worth between £10k and £100k. It is an open fund, supporting ideas that use the knowledge in communities to address challenges that matter locally. This programme has now closed.',
    url: 'https://youngfoundation.org/community-knowledge-fund/',
    for_paul: 'Corrected 2026-09-08: the first quote here (Phase 2 "delivers grants worth £50k to £100k") read as evidence the fund was active, when the same page states plainly it has closed — grant-tracker-be caught it. Meaning intended: out_of_scope because the Young Foundation runs no open route for a fundraiser today, not that Community Knowledge Fund is closed for good — Community Research Networks (the other named programme) is an ongoing UKRI partnership, just sign-up-only, "to stay informed... as the programme progresses," with no apply route, eligibility or dates on its own page.',
  },

  // 4. Says outright it isn't taking applications.
  {
    id: '45d5140a-8536-4331-b4d3-57462e108a9f', re: /Nationwide Foundation Grants Programme/, job: 2,
    verdict: 'reject', code: 'out_of_scope', read_via: 'fetch',
    quote: 'Unfortunately, this means that outside of the above project, we are currently unable to accept unsolicited applications for funding.',
    url: 'https://www.nationwidefoundation.org.uk/available-funding/',
    for_paul: 'The foundation says plainly it isn\'t accepting new applications right now — funding stays within existing partners while it builds evidence on housing policy. Nothing here for a fundraiser to apply to today.',
  },

  // 5. Bot-walled on every path tried; the Hub's own site (checked as the
  // notes suggest) carries no GLA fund or application page either.
  {
    id: 'f2791500-e1cb-4cd3-ae9d-5caa399df3ca', re: /Community Housing Fund/, job: 2,
    verdict: 'hold', read_via: 'unreadable',
    quote: '',
    url: 'https://www.london.gov.uk/programmes-strategies/housing-and-land/housing-and-land-funding-programmes/community-housing-fund',
    for_paul: 'The fund\'s own page (found 7 Sept, and described there as giving no dates, amounts or exclusions) is bot-walled today on every path — "Just a moment..." never clears, on fetch or the browser. Also checked the Community-Led Housing London Hub\'s own site (communityledhousing.london): it describes advisory support for community-led housing groups but carries no GLA fund or application page. Nothing better found today; apply_url stays where it is.',
  },

  // 6. Same domain, same wall. No citable sentence today, so this cannot be
  // the reject the brief expected — a verdict needs the page's own words.
  {
    id: '93f38ed1-ca74-4b6f-9249-51c95a134006', re: /Jobs and Skills Funding Opportunities/, job: 2,
    verdict: 'hold', read_via: 'unreadable',
    quote: '',
    url: 'https://www.london.gov.uk/programmes-strategies/jobs-and-skills/funding',
    for_paul: 'Same wall as the Community Housing Fund row, same domain, today: bot-walled on both fetch and the browser. 7 Sept found this a 287KB navigation page naming no single programme, which was heading toward reject/non_funder, but there\'s no citable sentence from a read today to make that call on — it stays hold rather than a reject without a quote.',
  },

  // 7. Whole domain bot-walled today: the old page, the grants listing, and a
  // site search all hit the same wall.
  {
    id: '876a5299-1b0b-4f07-9bb1-b9c7e36257e1', re: /The Mayor's Opportunity Fund/, job: 2,
    verdict: 'hold', read_via: 'unreadable',
    quote: '',
    url: 'https://www.communityfoundation.org.uk/grants/the-mayors-opportunity-fund/',
    for_paul: 'The old page still 404s. Tried the grants listing page and a site search for the current round; the whole communityfoundation.org.uk domain is behind a "please wait while your request is being verified" wall today on both fetch and the browser, so no current page could be found or confirmed. Title, deadline and amount_max stay pinned and untouched; apply_url is unpinned but there is nothing better to point it to yet.',
  },
]

async function main() {
  await runJob({ job: 2, rows: ROWS, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
