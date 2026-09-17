// Northern Ireland brief (docs/handoffs/northern-ireland-2026-09-11.md), batch
// one, run by the orchestrating session on Paul's "start now", 11 Sept 2026.
// Every page quoted was fetched in this session by direct fetch; no model call.
// Dedup by funder ran in SQL before any page was opened.
//
//   npx tsx --env-file=.env.local scripts/northern-ireland-stage-2026-09-11.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:northern-ireland-2026-09-11'
const TODAY = '2026-09-11'
const NI = 'Northern Ireland'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string; pipeline_state?: string }
const NEW: Row[] = [
  { title: 'Halifax Foundation for Northern Ireland Community FLEX', funder: 'Halifax Foundation for Northern Ireland', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'small_grant'],
    apply_url: 'https://www.halifaxfoundationni.org/community-flex/', url_status: 'unchecked',
    location_tag: NI, is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true, max_org_income: 500000,
    eligible_structures: ['registered_charity'], impact_sectors: ['community', 'mental_health', 'disability', 'employment'], target_beneficiaries: ['people_in_poverty', 'disabled_people', 'mental_health', 'unemployed'],
    description: 'Rolling twelve-month grants, average award £5,500, from the Halifax Foundation for Northern Ireland for registered charities with income of £500,000 or less that support people in greatest need: poverty, unemployment, disability, mental health. Covers materials, equipment, salary contributions, overheads, transport, volunteer expenses, training and activity costs. Open on a rolling programme; may close later in the year once funds are allocated.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: NI, last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities in Northern Ireland with income of £500,000 or less and at least one year of annual returns published on the Charity Commission for Northern Ireland website, supporting people in greatest need. At least three unrelated trustees, safeguarding policies and adequate insurance. Not while holding a live Foundation grant, within 12 months of an unsuccessful outcome, or after three grants in three consecutive years.',
      what_they_fund: 'Materials, equipment, salary contributions, overheads, transport, volunteer expenses, training and activity costs for work with people in poverty, unemployment, disability or poor mental health.',
      typical_award: 'Average award £5,500 for a twelve-month grant.',
      exclusions: 'Non-registered charities, travel outside Northern Ireland, grant-making charities, individuals, hospitals, religious promotion, environmental and animal causes, fundraising events, capital costs, bursaries, endowments, charities in deficit, minor refurbishment. Applications completed by a professional fundraising consultant.',
      decision_timeline: 'Rolling programme; the Foundation may close applications later in the year if funds are allocated.',
      how_to_apply: 'Confirm suitability, then the online application portal from the Community FLEX page. Pre-application sessions with the grants team are offered.',
      _citations: {
        typical_award: { snippet: 'Average Award - £5,500', confidence: 'high', source_url: 'https://www.halifaxfoundationni.org/community-flex/' },
        who_can_apply: { snippet: 'income of £500,000 or less', confidence: 'high', source_url: 'https://www.halifaxfoundationni.org/community-flex/' },
        decision_timeline: { snippet: 'Rolling Programme', confidence: 'high', source_url: 'https://www.halifaxfoundationni.org/community-flex/' },
      } } },

  { title: 'Belfast Harbour Community Awards', funder: 'Belfast Harbour', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://www.belfast-harbour.co.uk/community/community-awards/', url_status: 'unchecked',
    location_tag: 'Belfast', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-09-25', is_rolling: false,
    eligible_structures: ['registered_charity', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['community', 'employment', 'environment'], target_beneficiaries: ['general_public'],
    description: 'Grants of up to £5,000 from Belfast Harbour\'s Community Awards for grassroots, community-embedded not-for-profit organisations with a charity number or governing body affiliation, for new projects or expanding existing work in three categories: employability and skills, the environment, and communities. Round two of 2026 closes 5pm Friday 25 September 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Belfast', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Grassroots, community-embedded not-for-profit organisations with a charity number or a governing body affiliation. Not individuals or businesses, and not projects with religious or political objectives.',
      what_they_fund: 'New projects or the expansion of existing work in three categories: supporting employability and skills, supporting the environment, supporting communities.',
      typical_award: 'Individual grants of up to £5,000.',
      exclusions: 'Individuals, businesses, religious or political objectives.',
      decision_timeline: 'Round two of 2026 closes Friday 25 September at 5pm.',
      how_to_apply: 'Submit an entry through the online portal linked from the Community Awards page. Enquiries to the Community Award Management Team on 028 9055 4422.',
      _citations: {
        typical_award: { snippet: 'individual grants of up to £5,000', confidence: 'high', source_url: 'https://www.belfast-harbour.co.uk/community/community-awards/' },
        who_can_apply: { snippet: 'Any grassroots, community embedded, not-for-profit organisations with a charity number or a governing body affiliation may apply. Individuals and businesses are not eligible, and we do not support projects with religious or political objectives.', confidence: 'high', source_url: 'https://www.belfast-harbour.co.uk/community/community-awards/' },
        decision_timeline: { snippet: 'Friday, September 25th at 5pm', confidence: 'high', source_url: 'https://www.belfast-harbour.co.uk/community/community-awards/' },
      } } },

  { title: 'Belfast City Council Ending Violence Against Women and Girls Local Change Fund', funder: 'Belfast City Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: 'https://grants.belfastcity.gov.uk/', url_status: 'unchecked',
    location_tag: 'Belfast', is_local: true, amount_min: 1000, amount_max: 25000, deadline: '2026-10-09', is_rolling: false,
    eligible_structures: ['registered_charity', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['women', 'community', 'justice'], target_beneficiaries: ['women_girls', 'men_boys'],
    description: 'Grants of £1,000 to £25,000 in three tiers from Belfast City Council for the community and voluntary sector in Belfast to deliver events, projects or activity programmes aimed at ending violence against women and girls; projects working with men and boys on the issue are particularly encouraged. Closes 12 noon Friday 9 October 2026; all activity and spend by 31 March 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Belfast', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community and voluntary sector organisations in Belfast.',
      what_they_fund: 'Events, projects or activity programmes aimed at ending violence against women and girls, with projects working with men and boys particularly encouraged.',
      typical_award: 'Tier 1 £1,000 to £10,000; tier 2 £10,001 to £15,000; tier 3 £15,001 to £25,000.',
      exclusions: 'Organisations outside Belfast; activity or spend after 31 March 2027.',
      decision_timeline: 'Closes Friday 9 October 2026 at 12 noon. All activity and spend completed by 31 March 2027.',
      how_to_apply: 'Through the council\'s online grants portal.',
      _citations: {
        decision_timeline: { snippet: 'All activity and spend must be completed by 31 March 2027.', confidence: 'high', source_url: 'https://www.belfastcity.gov.uk/funding' },
        who_can_apply: { snippet: 'community and voluntary sector in Belfast to deliver events, projects or activity programmes aimed at ending violence against women and girls', confidence: 'high', source_url: 'https://www.belfastcity.gov.uk/funding' },
      } } },

  { title: 'Causeway Coast and Glens Christmas Festive Fund 2026', funder: 'Causeway Coast and Glens Borough Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'events'],
    apply_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes/the-christmas-festive-fund-2025', url_status: 'unchecked',
    location_tag: 'Causeway Coast and Glens', is_local: true, amount_min: null, amount_max: 2500, deadline: '2026-10-02', is_rolling: false,
    eligible_structures: ['unincorporated', 'registered_charity'], impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    description: 'Grants of up to £2,500 from Causeway Coast and Glens Borough Council for community associations in towns, villages and hamlets to run Christmas events and projects in which everyone in the community can take part, between 28 November and 16 December 2026. One group per settlement. Closes 12 noon Friday 2 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Causeway Coast and Glens', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community associations from towns, villages and hamlets in the borough. Only one community group per settlement will be successful.',
      what_they_fund: 'Projects and events celebrating Christmas that give everyone in the community the opportunity to participate, held between Saturday 28 November and Wednesday 16 December 2026.',
      typical_award: 'Up to £2,500.',
      exclusions: 'A second group from the same settlement.',
      decision_timeline: 'Closes Friday 2 October 2026 at 12 noon.',
      how_to_apply: 'Online grants portal at grants.ccgbcapps.com, with the guidance document on the fund page.',
      _citations: {
        decision_timeline: { snippet: 'CLOSING Friday 2nd October 2026 @ 12 noon', confidence: 'high', source_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes/the-christmas-festive-fund-2025' },
        who_can_apply: { snippet: 'only ONE community group per settlement will be successful', confidence: 'high', source_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes/the-christmas-festive-fund-2025' },
        typical_award: { snippet: 'Christmas Festive Fund ... Maximum Grant: £2,500', confidence: 'med', source_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes' },
      } } },

  { title: 'Causeway Coast and Glens LEP Capital Grant Programme 2026-27', funder: 'Causeway Coast and Glens Borough Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes/lep-capital-grant-programme', url_status: 'unchecked',
    location_tag: 'Causeway Coast and Glens', is_local: true, amount_min: 5000, amount_max: 30000, deadline: '2026-10-05', is_rolling: false,
    eligible_structures: ['cic_guarantee', 'cic_shares', 'ltd_shares', 'ltd_guarantee', 'cooperative'], impact_sectors: ['social_economy', 'employment'], target_beneficiaries: ['general_public'],
    description: 'Capital grants of £5,000 to £30,000, up to 70% of eligible costs, from Causeway Coast and Glens Borough Council\'s LEP programme for micro and small businesses and social enterprises located and trading in the borough for at least two years: new equipment, production or processing machinery and capital infrastructure for growth or productivity. A mandatory pre-application workshop, then applications by 5pm Monday 5 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Causeway Coast and Glens', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Micro businesses, small businesses and social enterprises located and actively trading within the Causeway Coast and Glens Borough Council area for at least two years. Not a grant for charities without a trading business.',
      what_they_fund: 'New equipment, new production or processing machinery, and capital infrastructure directly required for business growth or productivity improvements.',
      typical_award: '£5,000 to £30,000, up to 70% of eligible project costs.',
      exclusions: 'Businesses trading under two years or outside the borough; revenue costs.',
      decision_timeline: 'Closes 5pm Monday 5 October 2026.',
      how_to_apply: 'Attend the mandatory pre-application workshop, then apply at grants.ccgbcapps.com.',
      _citations: {
        typical_award: { snippet: 'Minimum grant: £5,000', confidence: 'high', source_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes/lep-capital-grant-programme' },
        who_can_apply: { snippet: 'Micro businesses, small businesses and social enterprises', confidence: 'high', source_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes/lep-capital-grant-programme' },
        decision_timeline: { snippet: '5.00pm, Monday 5 October 2026', confidence: 'high', source_url: 'https://causewaycoastandglens.gov.uk/grantsandfunding/open-grant-programmes/lep-capital-grant-programme' },
      } } },

  { title: 'The Fibrus Community Fund', funder: 'Community Foundation for Northern Ireland', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://communityfoundationni.org/grants/the-fibrus-community-fund/', url_status: 'unchecked',
    location_tag: NI, is_local: true, amount_min: null, amount_max: 1500, deadline: '2026-10-16', is_rolling: false, max_org_income: 50000,
    eligible_structures: ['unincorporated', 'registered_charity'], impact_sectors: ['tech', 'community', 'older_people'], target_beneficiaries: ['older_people', 'people_in_poverty', 'disabled_people'],
    description: 'Grants of up to £1,500 from the Fibrus Community Fund at the Community Foundation for Northern Ireland for constituted community and voluntary organisations with income under £50,000 in eligible BT postcodes, for projects tackling digital poverty: access to devices, digital skills training or community internet hubs, with a focus on older people, people on low incomes and people with disabilities. Closes 1pm Friday 16 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: NI, last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Constituted community and voluntary organisations with an annual income below £50,000, based in the eligible postcodes: BT3 to BT9, BT12 to BT57 (most), BT60 to BT82, BT92 to BT94 and BT99. Check the list on the fund page.',
      what_they_fund: 'Projects that provide access to digital devices, strengthen digital skills through training, or create community internet hubs, focused on older people, people on low incomes and people with disabilities.',
      typical_award: 'Up to £1,500.',
      exclusions: 'Organisations with income of £50,000 or more; postcodes outside the eligible list.',
      decision_timeline: 'Closes Friday 16 October 2026 at 1pm.',
      how_to_apply: 'Through the Community Foundation\'s Fundseeker portal linked from the fund page. Questions to applications@communityfoundationni.org or 028 9024 5927.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £1,500', confidence: 'high', source_url: 'https://communityfoundationni.org/grants/the-fibrus-community-fund/' },
        who_can_apply: { snippet: 'Constituted community and voluntary organisations with an annual income below £50,000', confidence: 'high', source_url: 'https://communityfoundationni.org/grants/the-fibrus-community-fund/' },
        decision_timeline: { snippet: 'Friday 16th October at 1pm', confidence: 'high', source_url: 'https://communityfoundationni.org/grants/the-fibrus-community-fund/' },
      } } },

  { title: 'Ireland Funds Heart of the Community Fund, Arts and Culture Round', funder: 'The Ireland Funds', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'project'],
    apply_url: 'https://irelandfunds.org/impact/heart-of-the-community/', url_status: 'unchecked',
    location_tag: NI, is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: false,
    next_open_date: 'Arts and culture round opens 14 September 2026',
    eligible_structures: ['registered_charity', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['creative', 'community'], target_beneficiaries: ['general_public'],
    description: 'The Ireland Funds\' Heart of the Community Fund opens an arts and culture round on 14 September 2026 for non-profit organisations across the island of Ireland, Northern Ireland included: core funding for arts and culture organisations, and project grants for community organisations running arts-based programmes. The spring 2026 round gave €5,000 to €25,000 per grant. Information workshops in Belfast on 25 September and online on 28 September.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: NI, last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Non-profit organisations on the island of Ireland in two categories: arts and culture organisations, and community organisations with arts-based programmes. Previous grantees include Belfast organisations.',
      what_they_fund: 'Core funding for arts and culture organisations\' ongoing activities and operations; grants for a community-based arts project where all expenditure relates directly to the programme.',
      typical_award: 'Not stated for this round. The spring 2026 round awarded €5,000 to €25,000.',
      exclusions: 'Organisations outside the island of Ireland; for-profit bodies.',
      decision_timeline: 'Opens 14 September 2026; the closing date will be on the fund page. Workshops: Dublin 16 September, Belfast 25 September, online 28 September.',
      how_to_apply: 'Read the application guidelines and apply through the online portal from the fund page; questions to grantsinfo@irelandfunds.org.',
      _citations: {
        decision_timeline: { snippet: 'Will open 14 September 2026', confidence: 'high', source_url: 'https://irelandfunds.org/impact/heart-of-the-community/' },
        what_they_fund: { snippet: 'core funding to support their ongoing activities and operations', confidence: 'high', source_url: 'https://irelandfunds.org/impact/heart-of-the-community/' },
        typical_award: { snippet: 'Grants between €5,000 to €25,000 will be awarded', confidence: 'med', source_url: 'https://irelandfunds.org/the-ireland-funds-invites-non-profit-organisations-to-apply-for-its-heart-of-the-community-fund-2026/' },
      } } },

  { title: 'The Honourable The Irish Society Small Grants', funder: 'The Honourable The Irish Society', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://honourableirishsociety.org.uk/our-programmes/how-to-apply/', url_status: 'unchecked',
    location_tag: 'North West and North Coast, Northern Ireland', is_local: true, amount_min: null, amount_max: 2000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['community', 'heritage', 'environment', 'education'], target_beneficiaries: ['general_public', 'children'],
    description: 'Small grants, mostly up to £2,000 with a few larger awards of £10,000 to £20,000, from The Honourable The Irish Society for charities, community groups and other not-for-profits based in or delivering work in the communities it serves around Coleraine, the City of Londonderry and the North Coast, across early years, waterways stewardship, and culture, heritage and reconciliation. Applications are taken through the year and considered at the next grants committee; the October 2026 committee took applications received by 1 September.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'North West and North Coast, Northern Ireland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities, community groups and other not-for-profit organisations based in, or delivering work within, the communities the Society serves, with a clear governing structure.',
      what_they_fund: 'Local organisations and community-based activity across three programmes: Growing Together (early years), Living Rivers Living Communities (waterways), and Living Heritage Shared Futures (culture, heritage and reconciliation).',
      typical_award: 'The majority are small, maximum £2,000. A smaller number of larger grants of £10,000 to £20,000 where there is a strong case for wider or longer-term impact.',
      exclusions: 'Organisations without a governing structure or outside the areas served.',
      decision_timeline: 'Applications are accepted through the year and put to the next grants committee. Applications received by 1 September 2026 went to the October 2026 committee; the next cut-off is not yet published.',
      how_to_apply: 'Online application form on the Society\'s site; use the application preview to prepare.',
      _citations: {
        typical_award: { snippet: 'The majority of our grants are small (maximum £2,000) and are designed to support local organisations and community-based activity.', confidence: 'high', source_url: 'https://honourableirishsociety.org.uk/our-programmes/how-to-apply/' },
        who_can_apply: { snippet: 'We support applications from eligible organisations such as charities, community groups and other not-for-profit organisations.', confidence: 'high', source_url: 'https://honourableirishsociety.org.uk/our-programmes/how-to-apply/' },
      } } },

  { title: 'Ulster Garden Villages Grants', funder: 'Ulster Garden Villages', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['project', 'core_costs'], pipeline_state: 'between_rounds_scheduled',
    apply_url: 'https://ugv.org.uk/', url_status: 'unchecked',
    location_tag: NI, is_local: true, amount_min: 750, amount_max: null, amount_undisclosed: false, deadline: '2026-11-30', is_rolling: false,
    next_open_date: 'Expressions of interest open 2 November 2026',
    eligible_structures: ['registered_charity'], impact_sectors: ['community', 'housing', 'health'], target_beneficiaries: ['people_in_poverty', 'homeless', 'general_public'],
    description: 'Ulster Garden Villages, one of Northern Ireland\'s largest grant-making trusts at about £1.5 million a year, takes expressions of interest from registered charities in a November window: the next runs 2 to 30 November 2026. Current focus: poverty, homelessness, health and wellbeing, and community resilience and cohesion. Grants start at £750 and, exceptionally, run to seven figures depending on the project and the charity\'s size.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: NI, last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Registered charities in Northern Ireland whose projects show active participation and self-help, within the current focus areas.',
      what_they_fund: 'Poverty, homelessness, health and wellbeing, and community resilience and cohesion.',
      typical_award: 'From £750 upwards; exceptionally up to £1,000,000, depending on the project and the charity\'s size.',
      exclusions: 'Unregistered organisations; work outside the focus areas.',
      decision_timeline: 'Expressions of interest are open 2 to 30 November 2026.',
      how_to_apply: 'Through the How to Apply page on the Ulster Garden Villages site during the window.',
      _citations: {
        decision_timeline: { snippet: 'The next application window opens November 2, 2026 and runs through November 30, 2026.', confidence: 'high', source_url: 'https://ugv.org.uk/' },
        what_they_fund: { snippet: 'Poverty, Homelessness, Health and Wellbeing and Community Resilience and Cohesion', confidence: 'high', source_url: 'https://ugv.org.uk/' },
      },
      _walk_note: 'Amount range and registered-charity requirement are from Supporting Communities\' October 2025 note on the reopening, not the UGV homepage; the How to Apply page was not read. Confirm before publishing.' } },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  type Held = { id: string; title: string; funder: string | null; pipeline_state: string; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id, title, funder, pipeline_state, apply_url').range(from, from + 999)
    if (error) throw error
    all.push(...(data as Held[]))
    if (!data || data.length < 1000) break
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  console.log(`table read: ${all.length} rows (table has ${count})`)
  if (all.length !== count) throw new Error('partial read; refusing to dedup against part of the table')
  let staged = 0
  for (const row of NEW) {
    const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    const exact = all.filter(d => d.apply_url && norm(d.apply_url) === norm(row.apply_url))
    if (exact.length) { console.log(`  already_held, skipping: ${row.title} -> ${exact.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase())
    if (sameFunder.length) console.log(`  same funder held (${sameFunder.length}): ${row.title} -> ${sameFunder.slice(0, 3).map(d => d.title).join('; ')}`)
    const state = (row.pipeline_state ?? 'tagged_awaiting_review') as 'tagged_awaiting_review' | 'between_rounds_scheduled'
    console.log(`  stage ${row.title} [${state}]`)
    if (!APPLY) continue
    const { pipeline_state: _ps, ...fields } = row
    const stamped = { ...stampNewGrant({ ...fields, source: SRC, is_active: false }, SRC), pipeline_state: state }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
