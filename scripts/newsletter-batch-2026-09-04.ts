// The Idox newsletter batch Paul sent on 2026-09-04: sixteen items, checked
// against the catalogue and then against each funder's own page.
//
// Eight are new and are STAGED (hidden, tagged_awaiting_review) per the
// addition gate. Tracked fields on those are written at `system:` trust (50),
// below ai_enrich (60), so a Re-enrich in review can still overwrite them —
// the trap in CLAUDE.md's provenance section.
//
// Four rows we already carry are UPDATED at user_verified (70) so a re-read
// cannot undo a date read off the funder's page today.
//
// Two items are skipped and one row is corrected on the way:
//   LGBT Financial Recognition Scheme — pays individual veterans, not
//     organisations. Out of scope, no row.
//   "Funding to support young musicians and composers" — the likely funder
//     (Fidelio) takes applications from arts organisations but the money is
//     for a named individual; the other candidate (Youth Music NextGen) is
//     individuals only. Neither identified from the Idox item, which is
//     behind a registration wall. Left alone.
//   Shoosmiths Foundation — not a date change but a wrong figure found while
//     checking it: the foundation page states NO amount and our row held
//     £230,000, and it says "UK-registered charity" where we listed CICs,
//     companies and co-ops. Both corrected.
//
// Triangle Trust's autumn round is in the newsletter but its own page gives
// no opening date, so the row's 15 October deadline is left as it stands.
//
// Three funder pages block plain fetches (Historic England, and Groundwork
// for both Comic Relief and One Stop); those were read in a browser today and
// the quotes below are from that reading.
//
//   npx tsx --env-file=.env.local scripts/newsletter-batch-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'

const APPLY   = process.argv.includes('--apply')
const NEW_SRC = 'system:newsletter-batch-2026-09-04'
const UPD_SRC = 'user_verified:newsletter-batch-2026-09-04'
type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

const brief = (url: string, o: Record<string, string>, c: Cit) => ({
  source: 'live_fetch', last_enriched: '2026-09-04', is_local: false, ...o,
  _citations: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, source_url: v.source_url ?? url }])),
})

// ── New rows, staged hidden for review ───────────────────────────────────────
const NEW_ROWS: Record<string, unknown>[] = [
  {
    title: 'The Arts Society External Charity Grants',
    funder: 'The Arts Society',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://theartssociety.org/charity-grants',
    location_tag: 'UK', is_local: false,
    amount_max: 3000,
    deadline: '2026-09-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'scio'],
    impact_sectors: ['creative', 'heritage'],
    target_beneficiaries: ['general_public'],
    description: 'Grants of up to £3,000 per project for UK registered charities working in the arts, heritage and conservation. The autumn 2026 round opened on 1 September and closes at 11.59pm on 30 September 2026. Community interest companies, schools, parent teacher associations, Friends groups and individuals cannot apply.',
    eligibility_criteria: ['UK registered charity', 'Arts, heritage or conservation project', 'CICs, schools and individuals excluded'],
    funder_brief: brief('https://theartssociety.org/charity-grants', {
      who_can_apply: 'UK registered charities only. Community interest companies, schools, parent teacher associations, Friends groups and individuals are not eligible.',
      what_they_fund: 'Arts, heritage and conservation projects, awarded twice a year through an open round.',
      typical_award: 'Up to £3,000 per project.',
      how_to_apply: 'Apply online through the charity grants page during an open round.',
      decision_timeline: 'The autumn 2026 round opened 1 September and closes 30 September 2026 at 23:59.',
      open_status: 'open', location_tag: 'UK', geographic_focus: 'UK and beyond.',
    }, {
      who_can_apply: { snippet: 'Applicants must be UK registered charities', confidence: 'high' },
      typical_award: { snippet: 'Up to £3,000 per project', confidence: 'high' },
      decision_timeline: { snippet: '30 September 2026 at 23:59', confidence: 'high' },
    }),
  },
  {
    title: 'Austin and Hope Pilkington Trust Unpaid Carers Grants',
    funder: 'Austin and Hope Pilkington Trust',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://www.austin-hope-pilkington.org.uk/',
    location_tag: 'UK', is_local: false,
    amount_min: 5000, amount_max: 5000,
    deadline: '2026-09-30', is_rolling: false,
    min_org_income: 1000000,
    eligible_structures: ['registered_charity', 'cio', 'scio'],
    impact_sectors: ['health', 'community'],
    target_beneficiaries: ['families', 'general_public'],
    description: 'Grants of £5,000 to registered UK charities for work focused exclusively on unpaid adult carers aged 18 or over. Round 4 of 2026 runs from 1 to 30 September. This round is for larger charities: the trust sets a minimum operating income and expenditure of £1 million, with no maximum.',
    eligibility_criteria: ['Registered UK charity', 'Minimum operating income £1 million', 'Work focused exclusively on unpaid adult carers'],
    funder_brief: brief('https://www.austin-hope-pilkington.org.uk/', {
      who_can_apply: 'Registered UK charities with a minimum operating income and expenditure of £1 million. There is no maximum. The project must focus exclusively on unpaid adult carers aged 18 or over.',
      what_they_fund: 'Rounds 3 and 4 of 2026 both fund work with unpaid carers. The trust runs themed rounds through the year.',
      typical_award: 'A fixed £5,000 in this round.',
      how_to_apply: 'Apply online during the round window.',
      decision_timeline: 'Round 4 application period is 1 to 30 September 2026.',
      open_status: 'open', location_tag: 'UK', geographic_focus: 'UK-wide.',
    }, {
      who_can_apply: { snippet: 'Minimum operating income: £1,000,000. Minimum operating expenditure: £1,000,000. There is no maximum', confidence: 'high' },
      typical_award: { snippet: 'Grant Round 4 Application Period 1st - 30th September Amount £5,000', confidence: 'high' },
      what_they_fund: { snippet: 'must focus exclusively on unpaid adult (18 or over) carers', confidence: 'high' },
    }),
  },
  {
    title: 'Henry Smith Foundation Domestic Abuse Counselling Fund',
    funder: 'Henry Smith Foundation',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://henrysmith.foundation/grants/domestic-abuse-counselling',
    location_tag: 'UK', is_local: false,
    amount_max: 250000,
    deadline: '2026-10-21', is_rolling: false,
    next_open_date: 'Opens 9am on Wednesday 23 September 2026',
    next_open_date_parsed: '2026-09-23',
    max_org_income: 2000000,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'ltd_guarantee'],
    impact_sectors: ['mental_health', 'justice', 'health'],
    target_beneficiaries: ['women_girls', 'general_public'],
    description: 'Five years of funding worth up to £250,000 in total, at £50,000 a year, for counselling delivered to victims and survivors of domestic abuse. Open to registered charities, CIOs, not-for-profit CICs with an asset lock and other not-for-profits with an income below £2 million and at least three years of experience delivering this counselling. Applications open at 9am on 23 September 2026; expressions of interest close at 5pm on 21 October 2026, with full applications due 18 December 2026.',
    eligibility_criteria: ['Income below £2 million', 'At least three years delivering counselling to victim-survivors', 'Registered charity, CIO, asset-locked CIC or other not-for-profit'],
    funder_brief: brief('https://henrysmith.foundation/grants/domestic-abuse-counselling', {
      who_can_apply: 'Registered charities and Charitable Incorporated Organisations, Community Interest Companies that are not-for-profit with an asset lock, and other not-for-profit organisations. Income must be below £2 million, with at least three years of experience delivering counselling to victim-survivors of domestic abuse.',
      what_they_fund: 'Counselling services for victims and survivors of domestic abuse, funded as core multi-year support.',
      typical_award: 'Up to £250,000 over five years, at £50,000 per year.',
      how_to_apply: 'Two stages. Submit an expression of interest from 23 September 2026, and if invited, a full application by 18 December 2026.',
      decision_timeline: 'Opens 9am Wednesday 23 September 2026. Expression of interest deadline 5pm Wednesday 21 October 2026. Full application deadline 5pm Wednesday 18 December 2026.',
      open_status: 'open', location_tag: 'UK', geographic_focus: 'UK-wide.',
    }, {
      who_can_apply: { snippet: 'Registered charities and Charitable Incorporated Organisations (CIOs) ... Community Interest Companies (CICs) that are not-for-profit with an asset lock', confidence: 'high' },
      typical_award: { snippet: '£250,000 (£50,000 per year) ... Length: five years', confidence: 'high' },
      decision_timeline: { snippet: 'Expression of Interest (EOI) deadline: Wednesday 21 October 2026, 5pm', confidence: 'high' },
      max_org_income: { snippet: 'must be below £2 million', confidence: 'high' },
    }),
  },
  {
    title: 'Army Benevolent Fund Charity Grants',
    funder: 'Army Benevolent Fund',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://armybenevolentfund.org/need-our-help/charity-grants/',
    location_tag: 'England, Wales and Northern Ireland', is_local: false,
    amount_max: 20000,
    deadline: '2026-10-06', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares'],
    impact_sectors: ['community', 'health'],
    target_beneficiaries: ['veterans', 'families'],
    description: 'Grants to UK registered charities and community interest companies whose work directly supports soldiers, veterans and their families. Grants to new partners are unlikely to exceed £20,000. The window for the November 2026 committee opened on 25 August and closes on 6 October 2026; the next window runs 8 December 2026 to 19 January 2027. Organisations delivering solely in Scotland are considered by a separate committee, normally in April. Government bodies and councils cannot apply.',
    eligibility_criteria: ['UK registered charity or CIC', 'Work directly supports the Army family', 'Government bodies and councils excluded'],
    funder_brief: brief('https://armybenevolentfund.org/need-our-help/charity-grants/', {
      who_can_apply: 'A UK registered charitable organisation or Community Interest Company whose work directly supports the Army family. Government bodies and local councils cannot apply.',
      what_they_fund: 'Services for serving soldiers, veterans and their families, from welfare and housing to health and employment support.',
      typical_award: 'Grants to new partners are unlikely to exceed £20,000.',
      how_to_apply: 'Apply online within a committee window.',
      decision_timeline: 'November 2026 committee: opened 25 August, closes 6 October 2026. February 2027 committee: opens 8 December 2026, closes 19 January 2027. Organisations delivering solely in Scotland go to a separate committee, normally held in April.',
      open_status: 'open', location_tag: 'England, Wales and Northern Ireland',
      geographic_focus: 'England, Wales and Northern Ireland; Scotland is handled by a separate committee.',
    }, {
      who_can_apply: { snippet: 'a UK registered charitable organisation or Community Interest Company (CIC)', confidence: 'high' },
      typical_award: { snippet: 'Grants to new partners are unlikely to exceed £20,000', confidence: 'high' },
      decision_timeline: { snippet: 'Opens 25 August, closes 6 October', confidence: 'high' },
    }),
  },
  {
    title: 'Sea-Changers Main Grants',
    funder: 'Sea-Changers',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://www.sea-changers.org.uk/how-to-apply',
    location_tag: 'UK', is_local: false,
    amount_min: 500, amount_max: 2500,
    deadline: '2026-09-30', is_rolling: false,
    impact_sectors: ['environment'],
    target_beneficiaries: ['general_public'],
    description: 'Grants of £500 to £2,500 for UK-based charities and other organisations carrying out marine conservation work. Two rounds a year, closing 31 March and 30 September. A separate small grants strand of up to £500 accepts applications at any time. The funder names no legal form beyond charities and other organisations, so eligibility is left open on this row.',
    eligibility_criteria: ['UK-based organisation', 'Marine conservation related activity'],
    funder_brief: brief('https://www.sea-changers.org.uk/how-to-apply', {
      who_can_apply: 'UK-based charities and other organisations, including schools, carrying out marine conservation related activities.',
      what_they_fund: 'Marine conservation: habitat and species protection, beach cleans, education and campaigning on the marine environment.',
      typical_award: 'Main grants £500 to £2,500. A separate small grants strand awards up to £500 at any time.',
      how_to_apply: 'Apply online through the how to apply page ahead of a round deadline.',
      decision_timeline: 'Main grant rounds close on 31 March and 30 September each year.',
      open_status: 'open', location_tag: 'UK', geographic_focus: 'UK only.',
    }, {
      who_can_apply: { snippet: 'UK-based charities and other organisations (including schools) carrying out marine conservation related activities', confidence: 'high' },
      typical_award: { snippet: '£500 to £2,500', confidence: 'high' },
      decision_timeline: { snippet: '31st March and 30th September each year', confidence: 'high' },
    }),
  },
  {
    title: 'Green Community Grants Programme',
    funder: 'Postcode Green Trust with The Wildlife Trusts',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://www.wildlifetrusts.org/green-community-grants-programme',
    location_tag: 'England, Scotland and Wales', is_local: false,
    amount_max: 25000,
    deadline: '2026-10-21', is_rolling: false,
    next_open_date: 'Next application window opens 30 September 2026',
    next_open_date_parsed: '2026-09-30',
    min_org_income: 10000, max_org_income: 1000000,
    impact_sectors: ['environment', 'community'],
    target_beneficiaries: ['general_public'],
    description: 'Unrestricted grants of up to £25,000 for not-for-profit groups in England, Scotland and Wales with an annual income between £10,000 and £1 million, for work connecting people with nature and the local environment. Funded by players of the Postcode Lottery and delivered by The Wildlife Trusts. The next application window runs from 30 September to 21 October 2026.',
    eligibility_criteria: ['Not-for-profit group', 'Annual income between £10,000 and £1 million', 'Based in England, Scotland or Wales'],
    funder_brief: brief('https://www.wildlifetrusts.org/green-community-grants-programme', {
      who_can_apply: 'Not-for-profit groups in England, Scotland and Wales with an annual income between £10,000 and £1 million. The page names no legal form beyond not-for-profit.',
      what_they_fund: 'Community work on nature and the environment, funded as unrestricted grants rather than restricted project costs.',
      typical_award: 'Unrestricted grants of up to £25,000.',
      how_to_apply: 'Apply through The Wildlife Trusts during an open window.',
      decision_timeline: 'The next window runs 30 September to 21 October 2026.',
      open_status: 'open', location_tag: 'England, Scotland and Wales',
      geographic_focus: 'England, Scotland and Wales.',
    }, {
      who_can_apply: { snippet: 'not-for-profit groups in England, Scotland and Wales with an annual income between £10,000 and £1 million', confidence: 'high' },
      typical_award: { snippet: 'unrestricted grants of up to £25,000', confidence: 'high' },
      decision_timeline: { snippet: '30 September to 21 October', confidence: 'high' },
    }),
  },
  {
    title: 'Comic Relief Community Fund England',
    funder: 'Comic Relief with Groundwork UK',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://www.groundwork.org.uk/comic-relief/',
    location_tag: 'England', is_local: false,
    amount_max: 5000,
    deadline: '2026-09-30', is_rolling: false,
    max_org_income: 250000,
    impact_sectors: ['community', 'financial', 'children'],
    target_beneficiaries: ['people_in_poverty', 'children', 'general_public'],
    description: 'Grants of up to £5,000 for grassroots, community-led organisations in England with a turnover under £250,000, drawing on the lived experience of the people they support. The 2026/27 programme focuses on homelessness and cost of living, early childhood development, and preventing violence against women and girls, refugees and asylum seekers. Just over £600,000 will be shared between around 120 organisations. Applications opened 1 September and close at 5pm on 30 September 2026. Funding can cover project or core costs, and projects must be delivered by 30 September 2027.',
    eligibility_criteria: ['Grassroots community-led organisation in England', 'Turnover under £250,000', 'Organisation based in the region where the project runs'],
    funder_brief: brief('https://www.groundwork.org.uk/comic-relief/', {
      who_can_apply: 'Grassroots, community-led organisations in England with a turnover of under £250,000. The organisation must be located in the same region where the project will be delivered. The page names no legal form.',
      what_they_fund: 'Tackling homelessness and cost of living pressures, early childhood development, and preventing violence against women and girls, refugees or asylum seekers. Project costs, core costs, or both.',
      typical_award: 'Up to £5,000, with just over £600,000 shared between around 120 organisations.',
      how_to_apply: 'Apply through Groundwork during the window; guidance notes are on the how to apply page.',
      decision_timeline: 'Applications opened Tuesday 1 September 2026 and close at 5pm on Wednesday 30 September 2026. All funded projects must be delivered by 30 September 2027.',
      open_status: 'open', location_tag: 'England', geographic_focus: 'England only.',
    }, {
      who_can_apply: { snippet: 'grassroots community organisations, with a turnover of under £250,000', confidence: 'high' },
      typical_award: { snippet: 'Grants of up £5,000 are available', confidence: 'high' },
      decision_timeline: { snippet: 'Applications will open on Tuesday 1 September 2026 and close at 5pm on Wednesday 30 September 2026', confidence: 'high' },
    }),
  },
  {
    title: 'Castle Studies Trust Grants',
    funder: 'Castle Studies Trust',
    funder_type: 'trust_foundation',
    funding_type: 'grant',
    apply_url: 'https://www.castlestudiestrust.org/Grants.html',
    location_tag: 'UK', is_local: false,
    amount_max: 15000,
    deadline: '2026-12-01', is_rolling: false,
    impact_sectors: ['heritage'],
    target_beneficiaries: ['general_public'],
    description: 'Grants of up to £15,000 including VAT for work that advances understanding and knowledge of castles: research, surveys, excavation, geophysics and reconstruction. The application round opens each September and closes on 1 December. The trust names no organisation type, and past awards have gone to universities, heritage groups and individual researchers, so eligibility is left open on this row.',
    eligibility_criteria: ['Project advances understanding of castles', 'Round opens each September, closes 1 December'],
    funder_brief: brief('https://www.castlestudiestrust.org/Grants.html', {
      who_can_apply: 'The trust states no organisation type. Past grants have gone to universities, heritage organisations and individual researchers.',
      what_they_fund: 'Research, surveys, excavation, geophysical work and reconstruction that enhance understanding and knowledge of castles.',
      typical_award: 'Up to a maximum of £15,000 including VAT.',
      how_to_apply: 'Apply online during the annual round.',
      decision_timeline: 'The round opens in September each year and closes on 1 December, or the Friday before if that falls at a weekend.',
      open_status: 'open', location_tag: 'UK', geographic_focus: 'Mainly the British Isles.',
    }, {
      typical_award: { snippet: 'Grants will be up to a maximum of £15,000 (incl VAT)', confidence: 'high' },
      decision_timeline: { snippet: 'The grant application process will open in September each year and close on 1 December of the same year', confidence: 'high' },
    }),
  },
]

// ── Rows we already carry ────────────────────────────────────────────────────
const UPDATES: { id: string; title: string; fields: Record<string, unknown>; citations?: Cit }[] = [
  {
    id: 'ad13fe09-0879-46ae-85e5-f726af1c38ca', title: 'Scops Arts Trust',
    fields: {
      apply_url: 'https://www.scopsartstrust.org.uk/grant-guidelines/', url_status: 'unchecked',
      funding_index_url: 'https://www.scopsartstrust.org.uk/',
      amount_max: 15000, deadline: '2026-09-15', is_rolling: false,
      description: 'Grants for children\'s and young people\'s music education, awarded to registered charities and to formally constituted social enterprises and community groups with clear charitable purposes across the UK. Awards typically start from a few hundred pounds and run to multi-year grants of up to £15,000 a year. Choirs and schools are excluded. Round 3 of 2026 opened on 1 September; stage one applications close at 5pm on Tuesday 15 September 2026.',
    },
    citations: {
      amount_max: { snippet: 'multi-year grants of up to £15,000 per annum', confidence: 'high' },
      deadline:   { snippet: 'Stage 1 deadline 5pm on Tuesday 15 September', confidence: 'high' },
    },
  },
  {
    id: '2bc9fbc3-9696-48d1-857d-5e864eac46da', title: 'Cash4Clubs',
    fields: {
      apply_url: 'https://cash4clubs.org/', url_status: 'unchecked',
      deadline: '2027-01-01', is_rolling: false,
      next_open_date: 'Opens Thursday 1 October 2026',
      next_open_date_parsed: '2026-10-01',
      eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
      description: 'Grants of £2,000 for community sports clubs and organisations across the UK and Ireland, funded by Flutter UK and Ireland with Sported. Open to clubs with a constitution and structured governance, registered charities, and companies without share capital. Applications open on Thursday 1 October 2026 and close on Friday 1 January 2027. Applicants must be 18 or over.',
    },
    citations: {
      deadline:       { snippet: 'Opens Thursday 1st October 2026, closes Friday 1st January 2027', confidence: 'high' },
      next_open_date: { snippet: 'Opens Thursday 1st October 2026', confidence: 'high' },
      eligible_structures: { snippet: 'clubs with a structured governance and constitution, registered charities, or companies without share capital', confidence: 'high' },
    },
  },
  {
    id: 'b57b4b82-8fc5-4a5c-8aa9-9563293c8823', title: 'One Stop Community Partnership Programme',
    fields: {
      amount_min: null, amount_max: 500,
      deadline: '2026-09-30', is_rolling: false,
      description: 'Grants of up to £500 for community groups and organisations operating within two miles of a One Stop store, for work tackling food poverty, supporting vulnerable or older people and low-income families, running youth sports teams, reducing waste or improving the environment. The current round opened 1 September and closes at 5pm on 30 September 2026, with decisions in the week beginning 9 November. Food banks can be funded for equipment but not for buying food. One application per organisation, and none if you were funded in the last 12 months.',
    },
    citations: {
      amount_max: { snippet: 'invites local community groups to apply for funding of up to £500', confidence: 'high' },
      deadline:   { snippet: '1 September 2026 ... 30 September 2026 at 5pm ... Decision date (w/c) 9 November 2026', confidence: 'high' },
    },
  },
  {
    id: '322ac2dc-ab9c-4d23-9016-75d98919dfc9', title: 'Places of Worship Renewal Fund',
    fields: {
      is_active: true, pipeline_state: 'published',
      apply_url: 'https://historicengland.org.uk/advice/grants/what-we-fund/places-of-worship-renewal-fund/',
      url_status: 'unchecked',
      amount_min: 10000, amount_max: 1000000,
      deadline: '2026-10-02', is_rolling: false,
      location_tag: 'England', is_local: false,
      description: 'Grants of £10,000 to £1 million for urgent repairs and essential improvements to listed places of worship in England, of any faith or denomination, provided the building is an active place of worship. Three streams: £10,000 to £50,000, £50,001 to £350,000, and £350,001 to £1 million. Delivered by Historic England for DCMS, with £92 million over four years. Round 2 opened on 4 September 2026 and expressions of interest close at 5pm on Friday 2 October 2026; invitations to apply follow by 26 October, with full applications due 18 November.',
    },
    citations: {
      deadline:   { snippet: 'Round 2: opens on Friday 4 September and the deadline for submitting an EOI is Friday 2 October 2026 at 5pm', confidence: 'high' },
      amount_max: { snippet: 'Grants ranging from £10,000 to £1,000,000 will be awarded for capital works', confidence: 'high' },
    },
  },
  {
    id: 'f635ceba-ed4a-4d76-8260-fe10bf6adf0e', title: 'Shoosmiths Foundation',
    fields: {
      apply_url: 'https://www.shoosmiths.com/impact/responsible-business/shoosmiths-foundation',
      url_status: 'unchecked',
      amount_min: null, amount_max: null,
      eligible_structures: ['registered_charity', 'cio', 'scio'],
      description: 'Funding for UK registered charities working on access to justice, protecting nature and a fair transition to a low carbon economy, and access to the legal profession for people from under-represented backgrounds. The foundation states no grant figure and funds only during open application windows.',
    },
    citations: {
      eligible_structures: { snippet: 'submitted by a UK-registered charity', confidence: 'high' },
      amount_max: { snippet: 'The foundation page states no grant amount; the £230,000 we held appears nowhere on it. Read 2026-09-04.', confidence: 'high' },
    },
  },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')

  console.log('\n-- updates to rows we already carry')
  const ids = UPDATES.map(u => u.id)
  const { data: rows } = await db.from('scraped_grants').select('id, title, is_active, pipeline_state').in('id', ids)
  if (!rows || rows.length !== ids.length) throw new Error(`expected ${ids.length} rows, got ${rows?.length}`)
  const byId = new Map(rows.map(r => [r.id, r]))
  for (const u of UPDATES) {
    const cur = byId.get(u.id)!
    if (!cur.title.toLowerCase().startsWith(u.title.slice(0, 10).toLowerCase())) throw new Error(`wrong row for ${u.title}: ${cur.title}`)
    console.log(`  ${u.title.padEnd(40)} ${cur.pipeline_state}/${cur.is_active ? 'live' : 'hidden'} -> ${Object.keys(u.fields).join(', ')}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: u.id, fields: u.fields, source: UPD_SRC, db, citations: u.citations })
    const refused = r.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${r.applied.join(', ') || 'nothing'}]${refused.length ? ` REFUSED ${JSON.stringify(refused)}` : ''}`)
  }

  console.log('\n-- new rows, staged hidden for review')
  for (const row of NEW_ROWS) {
    const title = String(row.title)
    const { data: dupe } = await db.from('scraped_grants').select('id, pipeline_state').ilike('title', `${title.slice(0, 24)}%`).limit(1)
    if (dupe?.length) { console.log(`  already present: ${title} (${dupe[0].pipeline_state})`); continue }
    console.log(`  ${title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: NEW_SRC, is_active: false }, NEW_SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) console.log(`     FAILED: ${error.message}`)
    else console.log(`     staged ${data.id}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
