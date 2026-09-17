// Verdicts — pile A (never live, in review), batch 1, rows 1-15.
//
// One publish, one park, six rejects, seven holds.
//
// The publish bar arrived mid-setup: a row may only be recommended for publish
// when its funder_brief is complete to depth, all seven fields written from the
// page with a verbatim citation each. briefGaps() in the lib enforces it and
// throws, so a thin brief cannot slip through as a publish.
//
// That rule cost a row in this batch and I think correctly. Charity Bank's
// Green Loans page supports six of the seven: who can apply, what it funds, how
// to apply, the £150,000 to £7.5m range, no exclusions stated, open. It says
// nothing at all about how long a decision takes. Under the old bar it was a
// clean publish; under this one it is a hold, and Paul also has a live Charity
// Bank lending row it might fold into.
//
// Four of the six rejects are structural rather than editorial, and three of
// those four are the same mistake: a row pointing at a lender's or a
// wholesaler's general page when the catalogue already carries that lender.
// The dedup query in the lib found each one; none was visible from the row.
//
//   npx tsx --env-file=.env.local scripts/verdicts-a01-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 1

const CB   = 'https://www.charitybank.org/loans/green-loans/'
const COOP = 'https://www.co-operativebank.co.uk/business/products/lending/Charity-and-Co-operative-lending-fund/'

const ROWS: Row[] = [
  // 1. Fourth year of an annual event; the 2026 round closed and the event is
  // on 9 September. No 2027 date anywhere. Not a park (no stated date), not a
  // reject (it plainly returns each year), so it is Paul's call.
  { id: 'cbad88ec-2eed-40b8-a1f2-1c05cb023dbc', re: /Angels' Den/, pile: 'A', verdict: 'hold',
    quote: 'If you would like information on how to apply for Angels\' Den 2026, please email rsvp@theclarefoundation.org.',
    url: 'https://theclarefoundation.org/angels-den-2026',
    for_paul: 'An annual event in its fourth year; the 2026 round has closed, the event is on 9 September, and the page names no 2027 date. Keep the row waiting for next year\'s page, or reject it as historic and re-add a fresh one?' },

  // 2. Fails the audience test in the funder's own words.
  { id: '83f700c0-0081-4609-bb1f-cb35b5346fa1', re: /Fund Manager Route/, pile: 'A', verdict: 'reject', code: 'out_of_scope',
    quote: 'We invest in fund managers who provide finance or other support to social enterprises and charities, we do not invest directly the organisations themselves.',
    url: 'https://bettersocietycapital.com/our-approach/making-investments/apply-investment/',
    for_paul: 'Better Society Capital lends to fund managers, not to charities. Nothing here for a fundraiser to apply to.' },

  // 3. Page blocked, so the verdict cannot rest on it. The row's own brief says
  // fellows are nominated rather than applying, which if true is a reject — but
  // that sentence is a model\'s, not the page\'s.
  { id: '324d3776-917a-4498-9537-27888f142f2d', re: /Ashoka/, pile: 'A', verdict: 'hold',
    quote: '',
    url: 'https://www.ashoka.org/en-gb',
    for_paul: 'HTTP 403 behind a Cloudflare interstitial, so the page could not be read today. The row\'s stored brief says fellows are identified and nominated rather than applying directly; if that holds it is a reject, but it needs a browser read to confirm.' },

  // 4. Dedup found the live row; the hidden one points at B&Q\'s retail site.
  { id: '1e50dd77-8cd0-46dc-9c53-04065ff01f2a', re: /B&Q Foundation Community Grants/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Find out more about our charity partnerships and how we support our local communities.',
    url: 'https://www.diy.com/responsible-business/community',
    for_paul: 'Duplicate of the live row cb9780e6, B&Q Foundation Home Improvement & Home-Starter Kits Funds, which points at bqfoundation.org.uk. This row points at the diy.com retail site, where the foundation gets one line and no application route.' },

  // 5. A 2020 COVID response, and the only page for it is a listing site\'s 404.
  { id: 'a71a1786-dc06-4e11-b04d-def0b9538f96', re: /Barclays 100x100/, pile: 'A', verdict: 'reject', code: 'historical_deadline',
    quote: 'Page not found - GrantFinder',
    url: 'https://grantfinder.co.uk/barclays-100x100-uk-covid-19-community-relief-programme-opens-for-applications/',
    for_paul: 'A COVID-19 relief programme from 2020. apply_url was never Barclays\' own page but an Idox GrantFinder listing, which now returns 404, so there is nothing to relink to either.' },

  // 6. Invitation only, said plainly and permanently ("always").
  { id: '5d883343-70fd-4f10-b28b-5b21324cbca5', re: /Baring Foundation/, pile: 'A', verdict: 'reject', code: 'out_of_scope',
    quote: 'Please note that applications to the International Development Programme are always by invitation only.',
    url: 'https://baringfoundation.org.uk/our-grant-making/current-funding-opportunities/',
    for_paul: 'Invitation only, in the foundation\'s own words and without qualification. The Baring Foundation\'s other programmes may be worth carrying separately; this one has no route in.' },

  // 7. Same wholesaler as row 2, one level up.
  { id: '324b95d5-650f-4350-88d0-45f517d15692', re: /Big Society Capital/, pile: 'A', verdict: 'reject', code: 'out_of_scope',
    quote: 'We invest in fund managers who provide finance or other support to social enterprises and charities, we do not invest directly the organisations themselves.',
    url: 'https://bettersocietycapital.com/our-approach/making-investments/apply-investment/',
    for_paul: 'The same wholesaler as row 2 and the same reason: it invests in fund managers, not in charities. apply_url here is the homepage, so the sentence is quoted from the apply-for-investment page on the same site. Also a near-duplicate of row 2, though neither is live.' },

  // 8. Year-stamped council round, closed, no next date on the page.
  { id: 'ea0677ca-1bd9-4499-a56b-b05e18e90468', re: /Fairness Fund/, pile: 'A', verdict: 'hold',
    quote: 'The Fairness Fund is now closed to applications.',
    url: 'https://www.brighton-hove.gov.uk/people-and-communities/community-support-and-grants/fairness-fund-2025-2026',
    for_paul: 'The 2025/26 round has closed and the page gives no 2026/27 date. The council runs it annually and the row is year-stamped in its title, so the choice is between holding this row for next year\'s page and rejecting it in favour of a fresh row when the next round opens.' },

  // 9. Dedup: the catalogue already carries Triodos.
  { id: 'f57c3373-26f6-4f44-a766-761aec387dcd', re: /Charities and Social Enterprises Lending/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Charities, social enterprises and community projects make up a large share of our customer base',
    url: 'https://www.triodos.co.uk/business-lending/large-loans/charities-and-social-enterprises',
    for_paul: 'Duplicate of the live row 6c5b16b7, Triodos Bank UK Business Loans, at triodos.co.uk/business-lending. Worth knowing before rejecting: this hidden row\'s URL is the more specific charities and social enterprises page, so relinking the live row to it and rejecting this one may be the better trade.' },

  // 10. The one publish. Everything the seven fields need is on one page, and
  // the tidy is a real correction: amount_max held £30m, which is the total the
  // bank committed to lend across the whole fund in 2024, not what one borrower
  // can have. The amounts job met this exact confusion a dozen times.
  // Held as a hold through two applies while the source question was open, then
  // promoted once rule 2 was rewritten. Its amount_max held £30,000,000, which
  // is the total the bank committed to lend across the whole fund in 2024 and
  // not what one borrower can have; corrected to the stated £10 million ceiling.
  { id: 'e1ae0341-15ae-4c05-98b5-18fed2989a88', re: /Charity and Co-operative Lending Fund/, pile: 'A', verdict: 'publish',
    quote: 'For registered charities, co-operatives, credit unions and community-interest companies only.',
    url: COOP,
    fields: { amount_max: 10000000 },
    cits: { amount_max: { snippet: 'The maximum funding limit is £10m.', confidence: 'high', source_url: COOP } },
    brief: {
      who_can_apply: 'Registered charities, co-operatives, credit unions and community interest companies. You need a Co-operative Bank business bank account before you can apply for lending, and all lending is subject to a credit assessment of the organisation and of its directors and trustees.',
      what_they_fund: 'Secured and unsecured business lending for charities, co-operatives and social enterprises to grow and invest. Fixed and variable rate terms; the bank will fund up to 70% of a property\'s market value, or 80% where the property is vacant.',
      how_to_apply: 'For loans under £250,000, gather your account details, six months of bank statements and supporting documents and email them as PDFs. For £250,000 or more, contact a Relationship Manager, who will tell you what to send.',
      exclusions: 'The fund is for business use only. Fixed rate terms are not available below £250,000, and break costs may apply if a fixed rate loan is repaid early.',
      decision_timeline: 'The bank aims to make contact within two business days of receiving your information, and to give a decision within ten business days of a full application.',
      typical_award: 'From £25,020, with a maximum funding limit of £10 million. The £30 million on the page is the total the bank committed to lend across the whole fund, not a figure for one borrower.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'For registered charities, co-operatives, credit unions and community-interest companies only.', confidence: 'high', source_url: COOP },
      what_they_fund: { snippet: 'The Co-operative Bank has committed to providing £30m of loan funding to help charities, co-operatives and social enterprises grow and invest in their organisations', confidence: 'high', source_url: COOP },
      how_to_apply: { snippet: 'If you would like to apply for a loan of £250,000 or more, please get in touch with one of our Relationship Managers.', confidence: 'high', source_url: COOP },
      exclusions: { snippet: 'The Charity and Co-operative Lending Fund is available for business use only.', confidence: 'high', source_url: COOP },
      decision_timeline: { snippet: 'We aim to give you a decision within 10 business days of your full application being received.', confidence: 'high', source_url: COOP },
      typical_award: { snippet: 'All businesses can apply for a loan from a minimum of £25,020.', confidence: 'high', source_url: COOP },
      open_status: { snippet: 'All businesses can apply for a loan from a minimum of £25,020.', confidence: 'med', source_url: COOP },
    } },

  // 11. Held through two applies as six-of-seven, then promoted on the 7 Sept
  // ruling that an honest absence is complete: the page says nothing about how
  // long a decision takes, so decision_timeline says exactly that and cites the
  // closest sentence. The row's £150,000 to £7.5m already agrees with the page,
  // so the tidy is the brief alone.
  { id: 'be85b0fc-7d63-4741-97ce-1ce6f37113b5', re: /Green Loans/, pile: 'A', verdict: 'publish',
    quote: 'We offer loans up to £7.5 million, with larger amounts available through partnerships with other social lenders.',
    url: CB,
    brief: {
      who_can_apply: 'Charities and social enterprises delivering social impact. Charity Bank states no minimum income and no list of eligible legal forms; every borrower is expected to be delivering social impact, and loans are secured.',
      what_they_fund: 'Energy efficiency and environmental projects: building or retrofitting for energy efficiency, reducing emissions, promoting biodiversity, transitioning to sustainable energy, and sustainable waste management. Part of a £50 million Energy Efficiency Loan Programme covering measures such as heat pumps and solar panels.',
      how_to_apply: 'Fill in the step-by-step enquiry form on the green loans page, which gathers what the bank needs to discuss a loan. A relationship team then works with the borrower through the process.',
      exclusions: 'The page states no exclusions. The only condition it sets on a borrower is that they are delivering social impact.',
      decision_timeline: 'The page states no decision timeline. It says only that the team works with borrowers throughout the process.',
      typical_award: 'Secured loans from £150,000, up to £7.5 million, with larger amounts available through partnerships with other social lenders. Terms typically up to 25 years.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'If you\'re a Charity or social enterprise looking for a loan to amplify your social impact, you\'re in the right place.', confidence: 'high', source_url: CB },
      what_they_fund: { snippet: 'Projects eligible for green loans include building or retrofitting for energy efficiency, reducing emissions, promoting biodiversity, transitioning to sustainable energy, and delivering sustainable waste management.', confidence: 'high', source_url: CB },
      how_to_apply: { snippet: 'Talk us through what you need by filling in our easy step-by-step form which will give us all the information we need to discuss your loan.', confidence: 'high', source_url: CB },
      exclusions: { snippet: 'All our borrowers are delivering social impact.', confidence: 'med', source_url: CB },
      decision_timeline: { snippet: 'Our team will work with you throughout the process, ensuring you have the support you need at every step.', confidence: 'med', source_url: CB },
      typical_award: { snippet: 'We offer loans up to £7.5 million, with larger amounts available through partnerships with other social lenders.', confidence: 'high', source_url: CB },
      open_status: { snippet: 'Talk us through what you need by filling in our easy step-by-step form which will give us all the information we need to discuss your loan.', confidence: 'med', source_url: CB },
    } },

  // 12. Dedup: the homepage version of a lender already carried.
  { id: 'fdcc973a-c87c-48cf-819c-e921c23fbc73', re: /Charity Bank Loans/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Charity Bank is a savings and loan bank with a mission to use money for good. We use money our savers entrust to us to make loans to UK charities, social enterprises and organisations with charitable purposes.',
    url: 'https://www.charitybank.org/',
    for_paul: 'Duplicate of the live row 72739682, Charity Bank Loans for Social Purpose, at charitybank.org/loans. This row points at the bank\'s homepage and its amount_max of £3.25m matches nothing on it.' },

  // 13. A clean park, and the row already holds the date: next_open_date_parsed
  // is 2026-12-01, which is what the page says. Nothing to write.
  { id: '3d957bb8-f671-4a9e-90ec-61ab71fb45f1', re: /CLA Charitable Trust/, pile: 'A', verdict: 'park',
    quote: 'We are not accepting any further applications in 2026. We expect to re-open in December/January for our 2027 grant-making.',
    url: 'https://www.cla.org.uk/news/apply-for-clact-funding/' },

  // 14. Open, dated, real — and the amount cannot be confirmed from the page.
  { id: '7f8efdf7-22e9-4d06-aee8-62b18008c247', re: /Commonweal Housing/, pile: 'A', verdict: 'hold',
    quote: 'Applications are open until Friday 16th October 2026.',
    url: 'https://www.commonwealhousing.org.uk/partner-with-us-call-for-new-ideas1',
    for_paul: 'Open until 16 October, which matches the row\'s deadline, and the fund is real. The row carries £5,000 to £10,000 and the page states no figure anywhere — it is in the downloadable Application Guide. Confirm the range from the guide or clear it, and this becomes a publish.' },

  // 15. The fund\'s own page exists but was never linked, and it cannot support
  // a brief either.
  { id: 'f2791500-e1cb-4cd3-ae9d-5caa399df3ca', re: /Community Housing Fund/, pile: 'A', verdict: 'hold',
    quote: 'Organisations and groups who want to bid for revenue and/or capital funding should contact the Community-Led Housing London Hub to discuss their application.',
    url: 'https://www.london.gov.uk/programmes-strategies/housing-and-land/housing-and-land-funding-programmes/community-housing-fund',
    for_paul: 'Two problems. apply_url points at the GLA\'s funding-programmes index, where the fund is a bare link; its own page (quoted here) describes the route but gives no dates, no amounts and no exclusions, so it cannot carry a full brief. Its published allocations also stop at Q4 2024-25. Relink and confirm the programme is still running, or reject it as ended.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'A', rows: ROWS, apply: APPLY, db: getAdminDb() })
}
main().catch(e => { console.error(e); process.exit(1) })
