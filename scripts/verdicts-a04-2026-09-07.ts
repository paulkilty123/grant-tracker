// Verdicts — pile A, batch 4, rows 46-60. Four publishes, four rejects, seven holds.
//
// The first batch with publishes since batch 1, and all four are the same shape:
// a named fund on the funder's own page, dated, with eligibility and exclusions
// written out. Two of them (Green Rigg, Shotley Low Quarter) are Community
// Foundation North East wind-farm funds, and the catalogue already carries three
// live CFNE funds of exactly that kind, so the "one row per community
// foundation" convention in memory is not what this catalogue actually does.
//
// The four rejects are all duplicates of live rows, and three of them are the
// index-over-products pattern batch 3 named: a row pointing at a provider's
// homepage or fund index while the products it lists are separate live rows
// (Salesforce, Severn Trent, Social Investment Business). The fourth, Rank's
// Time to Shine, is invitation only.
//
// Two holds are the rule-5 case the brief describes and neither had been seen
// before in this job: an admin-held field that the page now contradicts. Simon
// Gibson's row says CICs are eligible and the trust's eligibility page lists
// "Community Interest Companies" under what it does not fund. Step Change's
// admin-pinned deadline is 4 September, which has passed; the page's own table
// gives 30 October.
//
//   npx tsx --env-file=.env.local scripts/verdicts-a04-2026-09-07.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { runBatch, type Row } from './verdicts-lib-2026-09-07'

const APPLY = process.argv.includes('--apply')
const BATCH = 4

const OGLESBY = 'https://oglesbycharitabletrust.org.uk/spotlight-local-climate-action/'
const SGSG    = 'https://stgilesandstgeorge.org.uk/education/grants-for-education/'
const RIGG    = 'https://www.communityfoundation.org.uk/grants/supporting-community-groups-within-10-mile-radius-green-rigg-wind-farm/'
const SHOTLEY = 'https://www.communityfoundation.org.uk/grants/supporting-the-community-in-the-parish-of-shotley-low-quarter/'

const ROWS: Row[] = [
  // 46. rocbf.org.uk has no DNS record at all today, but the lender is alive at
  // rocbf.co.uk with two not-for-profit products (a £5k-£25k Community Cashflow
  // Fund and the Community Energy Fund) and an archived row already points
  // there. Relink or split is Paul's call, so this is not a dead_url reject.
  { id: 'ec46883d-f99b-4295-a61c-6b6eb06c2aa1', re: /ROCB/, pile: 'A', verdict: 'hold',
    quote: 'We\'re able to lend between £5k and £25k for up to 18 months at a rate of 2% interest per month.',
    url: 'https://www.rocbf.co.uk/cashflow-loans-for-not-for-profits/',
    for_paul: 'The row\'s domain rocbf.org.uk no longer resolves, but Robert Owen Community Banking is trading at rocbf.co.uk with a Community Cashflow Fund for charities and social enterprises in Wales (£5,000 to £25,000, 18 months, 2% a month) and a Community Energy Fund. An archived row, 0362621b, already holds rocbf.co.uk. Relink this row to the cashflow fund, or revive the archived one, or split the lender into its two not-for-profit products.' },

  // 47. Duplicate of the live row 53dd63b0. Worth the same note as LawWorks in
  // batch 3: the live row points at /nonprofit/, the marketing front page, and
  // this hidden one points at the pricing page that actually states the offer
  // and the route. The eligibility itself is in a 2023 PDF and behind a portal
  // login, so neither page passes the depth bar on its own.
  { id: '08819057-94cd-4b9c-879f-af3652675886', re: /Salesforce/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Through the Power of Us Programme , any eligible nonprofit receives 10 Salesforce Nonprofit Cloud or Sales/Service Cloud licences, at no cost.',
    url: 'https://www.salesforce.com/uk/nonprofit/pricing/',
    for_paul: 'Duplicate of the live row 53dd63b0, Salesforce Power of Us Program. A relink for the list: the live row points at salesforce.com/nonprofit/ and this page is the one that states the ten free licences and the three steps to claim them.' },

  // 48. Not a dead site and not a bot wall in the usual sense: the TLS handshake
  // itself is refused, with an internal-error alert, from node and from Chrome
  // alike. One day of that is not evidence the fund has gone.
  { id: '7948612a-70f9-4cce-82a0-c14d9a53e2bd', re: /Screwfix/, pile: 'A', verdict: 'hold',
    quote: '', url: 'https://www.screwfixfoundation.com/',
    for_paul: 'screwfixfoundation.com resolves but refuses the TLS handshake, from a script and from a real browser, so nothing could be read today. The Screwfix Foundation is a registered charity and this looks like an outage rather than a closure. Re-check before rejecting.' },

  // 49. The row points at the fund's index page, which carries no eligibility,
  // no route and no amounts; the two strands it covers are separate rows and
  // one of them is live. Also worth Paul knowing: New Project Funding has two
  // published rows on the same URL, 1ef69197 and f4225849.
  { id: '8e5f63e4-85d9-47db-b278-56263c8ab4f7', re: /Severn Trent/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'The Severn Trent Community Fund is supporting local charities and community groups with £2million a year.',
    url: 'https://www.stwater.co.uk/about-us/severn-trent-community-fund/',
    for_paul: 'Duplicate of the live row 7bda3614, Severn Trent Community Fund Core Funding Grant. This row is the fund\'s index page, which states no eligibility, no amount and no way in. Separately for the dedup list: 1ef69197 and f4225849 are both New Project Funding on the same URL.' },

  // 50. Rule 5, and the first time in this job that an admin-held field is
  // contradicted rather than merely stale. Two of them, and the eligibility one
  // would send a CIC to a funder that names CICs in its exclusions.
  { id: '9f87b6cf-69ce-48e3-8d21-a17361ae0084', re: /Simon Gibson/, pile: 'A', verdict: 'hold',
    quote: 'The Trust does not provide support to Individuals or organisations applying on behalf of individuals Students seeking sponsorship for educational or gap-year purposes Conferences, seminars or workshops Overseas charities, other than conservation charities or those known to the Trustees Community Interest Companies',
    url: 'https://sgctrust.org.uk/eligibility/',
    for_paul: 'Two admin-held fields the page now contradicts. eligible_structures holds cic_guarantee, cic_shares, ltd_guarantee, cooperative and unincorporated; the trust\'s eligibility page funds "UK Registered Charities" and lists "Community Interest Companies" under what it does not fund. location_tag holds Wales; the page names Suffolk, Norfolk, Cambridgeshire, Hertfordshire, Glamorganshire, Gwent, Powys, Camarthanshire and Berkshire. The timing and the amounts are right (form open 1 January to 31 March, typically £5,000 to £10,000 up to £20,000), so this is publishable the moment the two pins move.' },

  // 51. The homepage lists three products and each is a live row. Same shape as
  // the Resilience Fund row grant-tracker-be rejected after batch 2.
  { id: '26029120-6cfa-4346-8834-36f77b0af3b2', re: /Social Investment Business/, pile: 'A', verdict: 'reject', code: 'duplicate',
    quote: 'Loans of between £100k to £1.5m to UK charities and social enterprises',
    url: 'https://www.sibgroup.org.uk/',
    for_paul: 'Duplicate of three live rows: 0adbc570 Community Builders Fund, 007e7f00 Reach Fund and 6e6e8050 Energy Resilience Fund. This row is SIB\'s homepage, and the three products it lists are those three rows plus Flexible Finance (9eb92571, between rounds).' },

  // 52. The apply_url is a Good Finance directory profile, and the funds it
  // names ran to 2022. Social Investment Cymru itself is alive on WCVA's site
  // with three current products, which makes this an index over programmes as
  // well as a relink.
  { id: '829751a6-9ad0-409a-818c-e32d62f0d1ad', re: /Social Investment Cymru/, pile: 'A', verdict: 'hold',
    quote: 'The Fund is investing a total of £6 million in small loans until 2022, with Social Investment Cymru managing access to these fund for social businesses in Wales.',
    url: 'https://www.goodfinance.org.uk/investors-advisors/social-investment-cymru',
    for_paul: 'The row points at a Good Finance directory profile whose named funds ran to 2022, and its amount_max of £6,000,000 is that fund\'s total rather than an award. Social Investment Cymru is alive at wcva.cymru/social-investment-cymru/ with three current products (Bridge and Build Loans, Clean Energy Fund, Community Asset Loan Fund), so this needs relinking to one named fund or splitting into three, not a single date.' },

  // 53. Publish. The row already holds the right amounts and the right closing
  // date; what it has never had is a brief. The fund opens on 8 September, two
  // days from now, and closes on 3 November, so open_status is between_rounds
  // today and the row will be open by the time it is live.
  { id: 'a48f24a5-43b6-43d4-a4b5-093f4718477a', re: /Spotlight/, pile: 'A', verdict: 'publish',
    quote: '£100,000 is available in grants of between £500 – £5,000.',
    url: OGLESBY,
    fields: {
      next_open_date: '8 September 2026', next_open_date_parsed: '2026-09-08',
      deadline: '2026-11-03', is_rolling: false,
      amount_min: 500, amount_max: 5000,
    },
    cits: {
      next_open_date: { snippet: '*The fund will open for applications here on 8th September – information below*', confidence: 'high', source_url: OGLESBY },
      deadline: { snippet: 'Application Deadline 3 rd November 2026', confidence: 'high', source_url: OGLESBY },
      amount_max: { snippet: '£100,000 is available in grants of between £500 – £5,000.', confidence: 'high', source_url: OGLESBY },
    },
    brief: {
      who_can_apply: 'Small charities, CICs limited by guarantee and constituted community groups based in Greater Manchester and working in one or more of its ten boroughs. Your organisation must have an annual turnover under £250,000, work directly with communities and involve beneficiaries in decision-making, and show a track record or a robust plan to deliver impact. Unconstituted groups can apply if they have a corporate bank account requiring two signatories.',
      what_they_fund: 'Work with local people to take nature-based action on climate change, under the three themes of representation, cohesion and participation. Every kind of cost is considered, including unrestricted funding, core running costs, project delivery, continuation funding and capital purchases. Applications should not cover building costs or contribute to large-scale capital projects.',
      how_to_apply: 'The fund opens for applications on the trust\'s own page on 8 September 2026 and closes on 3 November 2026. Read the Application Information Pack first, which carries the full eligibility, process and glossary detail, then apply through the portal linked from the page. Each organisation may submit only one application per round, and queries go to applications@oglesbycharitabletrust.org.uk rather than the trust\'s general enquiry address.',
      exclusions: 'The trust cannot fund its current or past grantholders, private companies limited by shares, animal charities or projects with animals as beneficiaries, schools, organisations active outside the UK, church and building fabric appeals, or charities whose primary purpose is promoting religion. Conferences, awards, expeditions, general sports, holidays, individuals, and sponsorship and marketing appeals are excluded, as is work that is only campaigning or research rather than direct work with the target group.',
      decision_timeline: 'Applications close on 3 November 2026 and only shortlisted applicants are contacted. If you have not heard by 16 December 2026 your application was not successful.',
      typical_award: 'Grants of between £500 and £5,000, from a pot of £100,000. Funding can be unrestricted, core running costs, project delivery, continuation funding or capital purchases.',
      open_status: 'between_rounds',
    },
    briefCits: {
      who_can_apply: { snippet: 'This fund is open to small charities and community groups (with a bank account that requires two signatories) based in Greater Manchester, that operate in one or more of the ten boroughs. To apply, your organisation must have an annual turnover of under £250,000, a demonstrable track record in community and/or climate work, and a plan to deliver impact.', confidence: 'high', source_url: OGLESBY },
      what_they_fund: { snippet: 'You can request a grant between £500 and £5,000. We offer flexible funding options, including unrestricted funding, core running costs, project delivery, continuation funding or capital purchases. We ask that applications do not cover building costs or contribute towards large-scale capital projects.', confidence: 'high', source_url: OGLESBY },
      how_to_apply: { snippet: 'Full information on Eligibility, How to Apply and the Application Process can be found in the application pack.', confidence: 'high', source_url: OGLESBY },
      exclusions: { snippet: 'Non-profit organisations, including CICs limited by guarantee are welcome to apply. We can fund unconstituted groups but only those with a corporate bank account that requires two signatories. We cannot fund private companies limited by shares; or schools, animal charities, or individuals.', confidence: 'high', source_url: OGLESBY },
      decision_timeline: { snippet: 'Unfortunately, we will only contact applicants who have been shortlisted. If you haven\'t heard from us by 16th December 2026, your application was not successful on this occasion.', confidence: 'high', source_url: OGLESBY },
      typical_award: { snippet: '£100,000 is available in grants of between £500 – £5,000.', confidence: 'high', source_url: OGLESBY },
      open_status: { snippet: '*The fund will open for applications here on 8th September – information below*', confidence: 'high', source_url: OGLESBY },
    } },

  // 54. Publish, and a relink: the row pointed at /education/, which is the
  // charity's account of its own work and states no eligibility, no route and
  // no dates. /education/grants-for-education/ carries all three.
  //
  // The amount column is a deliberate departure from the amounts brief's rule
  // for a whole-programme row, which is the highest ceiling. The highest is the
  // Partnership Grant at £50,000 a year, and the page says not to send
  // unsolicited applications for it, so £50,000 is not a figure any reader
  // could ask for. amount_max is the CIG ceiling, £18,500, and typical_award
  // names all four strands including the Partnership one.
  { id: '01aa47c7-4db6-4f51-a129-66ab25e3b548', re: /St Giles/, pile: 'A', verdict: 'publish',
    quote: 'We fund not-for-profit organisations (including charities, schools, churches and social enterprises) delivering activities that support our mission to children and young people from birth to 25 years old.',
    url: SGSG,
    fields: {
      apply_url: SGSG,
      deadline: '2026-09-28', is_rolling: true,
      amount_max: 18500,
    },
    cits: {
      apply_url: { snippet: 'Please apply using the online application form . It is the same for all grants but you have to answer more questions to receive more funding.', confidence: 'high', source_url: SGSG },
      deadline: { snippet: 'Project Grant and CIG applications should be submitted by 7 pm on our quarterly grants\' deadline (set about 5–6 weeks before our Trustee meetings): Monday 15 December 2025 Monday 16 March 2026 Monday 8 June 2026 Monday 28 September 2026 Monday 14 December 2026', confidence: 'high', source_url: SGSG },
      is_rolling: { snippet: 'Small Grant applications can be submitted at any time and we expect to make a decide within six weeks.', confidence: 'high', source_url: SGSG },
      amount_max: { snippet: 'Community Investment Grant (CIG) – Max £18,500 per annum for up to three years', confidence: 'high', source_url: SGSG },
    },
    brief: {
      who_can_apply: 'Not-for-profit organisations, including charities, schools, churches and social enterprises, delivering activities for children and young people from birth to 25. CICs and social enterprises can apply but face additional requirements. Your organisation does not have to be based in the area, but the children and young people you work with must live in or be educated in Covent Garden and south Westminster.',
      what_they_fund: 'Universal and targeted work under five themes: children and families, education and learning, emotional wellbeing, youth activities, and Christian education. Revenue and capital costs are both eligible, from one-off school enrichment and community activities through to weekly delivery over a year and multi-year core support.',
      how_to_apply: 'Read the grant guidelines first, then apply on the online application form, which is the same for every programme with more questions asked for larger amounts. Small Grants can be submitted at any time; Project Grants and Community Investment Grants must be in by 7pm on a quarterly deadline. Partnership Grants are discretionary: send a short outline of the idea to the Clerk rather than an application.',
      exclusions: 'Community Investment Grants are only open to organisations the charity has funded in the last three years that can show a strong commitment to the local area, and are not usually available to schools or to projects working in a school setting. Partnership Grants are discretionary and unsolicited applications are not accepted. Funding is limited to children and young people resident in or educated in Covent Garden and south Westminster.',
      decision_timeline: 'Small Grants are decided within about six weeks of applying. Project Grants and Community Investment Grants go to the trustee meeting that follows their quarterly deadline, set about five to six weeks later; the remaining 2026 deadlines are 28 September and 14 December.',
      typical_award: 'Four programmes with different ceilings: Small Grants up to £3,600, Project Grants up to £12,000, Community Investment Grants up to £18,500 a year for up to three years, and Partnership Grants of £20,000 to £50,000 a year for up to three years. The Partnership Grant is discretionary and does not take unsolicited applications, so £18,500 a year is the most an applicant can ask for cold.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'We fund not-for-profit organisations (including charities, schools, churches and social enterprises) delivering activities that support our mission to children and young people from birth to 25 years old. We do fund Community Interest Companies and social enterprises but there are additional requirements .', confidence: 'high', source_url: SGSG },
      what_they_fund: { snippet: 'We will fund universal and targeted initiatives that fall under our five broad themes.', confidence: 'high', source_url: SGSG },
      how_to_apply: { snippet: 'Please apply using the online application form . It is the same for all grants but you have to answer more questions to receive more funding.', confidence: 'high', source_url: SGSG },
      exclusions: { snippet: 'Unfortunately, CIGs are not usually available to schools or projects working in a school setting.', confidence: 'high', source_url: SGSG },
      decision_timeline: { snippet: 'Small Grant applications can be submitted at any time and we expect to make a decide within six weeks.', confidence: 'high', source_url: SGSG },
      typical_award: { snippet: 'Partnership Grant – Between £20 – £50,000 per annum for up to three years', confidence: 'high', source_url: SGSG },
      open_status: { snippet: 'We can only provide funding to support children and young people who are resident in or educated in our area of benefit (Covent Garden and south Westminster – see map ).', confidence: 'high', source_url: SGSG },
    } },

  // 55. Rule 5 again, the stale half of it. The pinned deadline of 4 September
  // is two days past and the page's own table names 30 October as the last 2026
  // round. Nothing here can be tidied without moving a pin.
  { id: '3b2b8d07-3338-4109-a6f3-c06a27d06196', re: /Step Change/, pile: 'A', verdict: 'hold',
    quote: 'Friday 30th October 2026 Wednesday 25th November 2026',
    url: 'https://oxfordshire.org/ocf_grants/step-change-2/',
    for_paul: 'The admin-held deadline is 4 September 2026, which has passed. The page\'s dates table gives one more 2026 round, closing Friday 30 October with the panel on 25 November, and the page\'s own summary line still says 4 September, so the funder is behind too. The fund itself is in good order (£10,000 to £50,000, income £100,000 to £1m, a volunteer project manager with every grant), so moving the pin to 30 October is all this needs.' },

  // 56. Publish. Open, dated, £1,000 to £5,000, and the row already holds the
  // amounts. The stored apply_url redirects; the fund's own URL is written in.
  { id: 'f5c454d7-728e-4f11-b7f1-1dc139393d3e', re: /Green Rigg|10-mile radius/, pile: 'A', verdict: 'publish',
    quote: 'Grants of between £1,000 and £5,000 are available, with up to £9,000 in exceptional circumstances.',
    url: RIGG,
    fields: { apply_url: RIGG, deadline: '2026-09-14', is_rolling: false, amount_min: 1000, amount_max: 5000 },
    cits: {
      apply_url: { snippet: 'To make an application, please click here', confidence: 'high', source_url: RIGG },
      deadline: { snippet: 'Closing Date: 14/09/2026', confidence: 'high', source_url: RIGG },
      amount_max: { snippet: 'Grants of between £1,000 and £5,000 are available, with up to £9,000 in exceptional circumstances.', confidence: 'high', source_url: RIGG },
    },
    brief: {
      who_can_apply: 'Community and voluntary organisations and schools working within a 10-mile radius of the Green Rigg Wind Farm in Northumberland. Priority goes to those benefiting residents within three miles, and to the parishes that fall partly in that area: Birtley, Corsenside, Kirkwhelpington, Bavington and Chollerton. Requests must be charitable, educational, philanthropic or benevolent in purpose.',
      what_they_fund: 'Priority is given to capital items with a tangible, lasting benefit, including improvements to community buildings. Biodiversity and habitat conservation, and energy conservation and greater use of renewables, are named priorities. Running costs and revenue funding are considered only in exceptional cases.',
      how_to_apply: 'Apply through the Community Foundation North East\'s online application form, using the Apply online link on the fund page. Applications close on 14 September 2026. Ged Robinson at the Foundation manages the fund and takes questions at gr@communityfoundation.org.uk.',
      exclusions: 'Grants are for non-statutory purposes only, so work a public body is already required to fund is out. Running costs and revenue funding are only considered in exceptional cases, and the fund is limited to the 10-mile radius of the wind farm.',
      decision_timeline: 'The page states no decision timeline. It gives the closing date of 14 September 2026 and names the Foundation\'s programme manager as the contact for questions.',
      typical_award: 'Grants of between £1,000 and £5,000, with up to £9,000 in exceptional circumstances.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'The EDF ER Green Rigg Windfarm Community Benefit Fund supports applications from community and voluntary groups working within a 10-mile radius of the Wind Farm, priority is given to those within a 3-mile radius.', confidence: 'high', source_url: RIGG },
      what_they_fund: { snippet: 'Priority will be given to capital items with a tangible, lasting benefit, including improvements to community buildings. Running costs and revenue funding will only be considered in exceptional cases.', confidence: 'high', source_url: RIGG },
      how_to_apply: { snippet: 'To make an application, please click here', confidence: 'high', source_url: RIGG },
      exclusions: { snippet: 'Grants to community and voluntary organisations and schools, for non-statutory purposes only.', confidence: 'high', source_url: RIGG },
      decision_timeline: { snippet: 'Closing Date: 14/09/2026', confidence: 'high', source_url: RIGG },
      typical_award: { snippet: 'Grants of between £1,000 and £5,000 are available, with up to £9,000 in exceptional circumstances.', confidence: 'high', source_url: RIGG },
      open_status: { snippet: 'Closing Date: 14/09/2026', confidence: 'high', source_url: RIGG },
    } },

  // 57. Publish. Same funder, a different wind farm and a different parish, so
  // not a duplicate of 56 or of the three live CFNE funds.
  { id: 'db97dbb6-63b5-4604-8ccb-10a4722ea2b1', re: /Shotley/, pile: 'A', verdict: 'publish',
    quote: 'Applicants can apply for a minimum of £1,000 up to the maximum funds available in the fund year.',
    url: SHOTLEY,
    fields: { apply_url: SHOTLEY, deadline: '2026-09-28', is_rolling: false, amount_min: 1000, amount_max: 15000 },
    cits: {
      apply_url: { snippet: 'To make an application, please click here', confidence: 'high', source_url: SHOTLEY },
      deadline: { snippet: 'Closing Date: 28/09/2026', confidence: 'high', source_url: SHOTLEY },
      amount_min: { snippet: 'The RWE Renewables Kiln Pit Hill Windfarm Community Fund at the Community Foundation has a maximum allocation of £15,000 for grants to voluntary and community projects based in the parish of Shotley Low Quarter. Applicants can apply for a minimum of £1,000 up to the maximum funds available in the fund year.', confidence: 'high', source_url: SHOTLEY },
    },
    brief: {
      who_can_apply: 'Voluntary and community organisations, charities and community groups whose projects are based in the parish of Shotley Low Quarter in Northumberland. CICs and other social enterprises with a good business plan can apply for start-up or expansion costs. Applicants have to show that the project has community benefit and charitable aims.',
      what_they_fund: 'General running costs, specific projects or activities, and capital developments or equipment. The fund names capital items such as games, resources and equipment, revenue items such as trips and entrance fees, sessional worker costs, repairs and refurbishment of community buildings, start-up costs for new community groups, out-of-school activities, and community and environmental projects.',
      how_to_apply: 'Apply through the Community Foundation North East\'s online application form, using the Apply online link on the fund page. Applications close on 28 September 2026. If you are applying for capital items you are asked for three quotes, and the Foundation will get in touch to understand why if you can only get one or two. Pete Barrett manages the fund at pb@communityfoundation.org.uk.',
      exclusions: 'The Foundation does not normally support the general running costs of CICs and other social enterprises, though it will consider start-up or expansion costs from them. Grants for individuals are only considered in special circumstances, and the fund is limited to projects based in the parish of Shotley Low Quarter.',
      decision_timeline: 'The page states no decision timeline. It gives the closing date of 28 September 2026 and says all applications are given due consideration by the advisory panel.',
      typical_award: 'A minimum of £1,000, up to the maximum available in the fund year; the fund has a maximum allocation of £15,000.',
      open_status: 'open',
    },
    briefCits: {
      who_can_apply: { snippet: 'The RWE Renewables Kiln Pit Hill Windfarm Community Fund at the Community Foundation has a maximum allocation of £15,000 for grants to voluntary and community projects based in the parish of Shotley Low Quarter.', confidence: 'high', source_url: SHOTLEY },
      what_they_fund: { snippet: 'You can apply for general running costs, specific projects or activities, or for the costs of capital developments or equipment.', confidence: 'high', source_url: SHOTLEY },
      how_to_apply: { snippet: 'If you are applying for capital items, we ask for three quotes to be provided, we recognise this is not always possible, if you can only secure one, or two quotes we will contact to you to understand why.', confidence: 'high', source_url: SHOTLEY },
      exclusions: { snippet: 'CICs or other social enterprises with a good business plan can apply for help with start-up or expansion, but we do not normally support their general running costs.', confidence: 'high', source_url: SHOTLEY },
      decision_timeline: { snippet: 'This list is not exhaustive and all applications will be given due consideration by the advisory panel.', confidence: 'high', source_url: SHOTLEY },
      typical_award: { snippet: 'Applicants can apply for a minimum of £1,000 up to the maximum funds available in the fund year.', confidence: 'high', source_url: SHOTLEY },
      open_status: { snippet: 'Closing Date: 28/09/2026', confidence: 'high', source_url: SHOTLEY },
    } },

  // 58. The audience call the brief names as Paul's. BGV would be a clean park
  // otherwise: closed, and it says when it reopens.
  { id: '3e386cdc-60ab-413e-a348-11f659d3e4fb', re: /Tech for Good/, pile: 'A', verdict: 'hold',
    quote: 'We only invest in for-profit companies limited by shares. We require that you\'re incorporated in the UK for us to be able to invest.',
    url: 'https://www.bethnalgreenventures.com/apply',
    for_paul: 'An audience call at the edge. BGV invests £60,000 for equity and says it only invests in for-profit companies limited by shares, which rules out charities, CIOs and companies limited by guarantee; the row\'s eligible_structures list cic_guarantee, ltd_guarantee and cooperative, all of which the page excludes. If an equity accelerator for for-profit ventures belongs in the catalogue, this is a park: applications for Autumn 2026 are closed and the page says the next ones open in November. If it does not, it is out_of_scope.' },

  // 59. The Charity Commission register class again. The foundation has no site
  // of its own: mackintoshfoundation.org serves a "Welcome to your new website"
  // placeholder.
  { id: '1f67aead-7d02-49ad-87ae-77f9f9daece7', re: /Theatre and Charitable/, pile: 'A', verdict: 'hold',
    quote: '', url: 'https://register-of-charities.charitycommission.gov.uk/en/charity-search/-/charity-details/327751',
    for_paul: 'A register row: apply_url is the Charity Commission entry, which states no eligibility and no route, and the Mackintosh Foundation has no working website (mackintoshfoundation.org is an unbuilt placeholder). Its amount_min, amount_max, location_tag and eligible_structures are all admin-held. Same class as the other register rows: keep holding, or reject them together.' },

  // 60. Invitation only, on the page that works. The row's own apply_url now
  // serves a PNG, in a browser as well as a script, which is what produced the
  // enrich_failed note the row is carrying.
  { id: 'a91f58e0-5572-4d9b-85ad-d67df0e72e0d', re: /Time to Shine/, pile: 'A', verdict: 'reject', code: 'out_of_scope',
    quote: 'Traditionally organisations are invited to apply for the scheme by Rank\'s staff team.',
    url: 'https://rankfoundation.com/our-approach/leadership/time-to-shine/',
    for_paul: 'Invitation only: Rank\'s staff pick the organisations, and the next programme starts in April 2027. Two things to note before rejecting. The row\'s apply_url, rankfoundation.com/time-to-shine/, now serves a PNG image with no page behind it, in Chrome as well as from a script, and that is what the row\'s needs_intervention_reason records; the note is a tombstone, so it stays until you clear it. And an archived row, 0efbafbc, already points at the working page.' },
]

async function main() {
  await runBatch({ batch: BATCH, pile: 'A', rows: ROWS, apply: APPLY, db: getAdminDb() })
  if (!APPLY) console.log('\n  pass --apply to write')
}
main().catch(e => { console.error(e); process.exit(1) })
