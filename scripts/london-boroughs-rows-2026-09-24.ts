// Row data for the London boroughs batch, brief docs/handoffs/london-boroughs-2026-09-24.md.
// Read by scripts/london-boroughs-stage-2026-09-24.ts (writes) and
// scripts/london-boroughs-score-2026-09-24.ts (scores against the London orgs),
// so both work from exactly the same rows.
export const SRC = 'system:london-boroughs-2026-09-24'
export const TODAY = '2026-09-24'

export type Row = Record<string, unknown> & {
  title: string; funder: string; apply_url: string
  // Two funds that live on one council page share its URL; say so explicitly.
  shares_url_with?: string
}
export type Fix = { id: string; expect_title: RegExp; fields: Record<string, unknown>; citations?: Record<string, { snippet: string; confidence: 'high' | 'med' | 'low' }>; why: string }

// ── Ealing ────────────────────────────────────────────────────────────────────
const EAL_BS = 'https://www.ealing.gov.uk/better-spaces'
const EAL_BS_PDF = 'https://www.ealing.gov.uk/download/downloads/id/21609/better_spaces.pdf'

// ── Elizabeth line ────────────────────────────────────────────────────────────
const ELCF = 'https://tfl.gov.uk/travel-information/improvements-and-projects/improving-the-elizabeth-line'

// ── Hounslow ──────────────────────────────────────────────────────────────────
const HOU = 'https://www.hounslow.gov.uk/council-grants'
const HOU_SUST_PDF = 'https://www.hounslow.gov.uk/downloads/file/14348/sustainability-grant-guidance-2026-27'
const HOU_SMALL_PDF = 'https://www.hounslow.gov.uk/downloads/file/14067/small-grant-guidance-2026-2027'

// ── Brent ─────────────────────────────────────────────────────────────────────
const BRENT_TTZ = 'https://www.brent.gov.uk/neighbourhoods-and-communities/community-funding-and-support/brent-together-towards-zero-grant'
const BRENT_IAM = 'https://www.brent.gov.uk/neighbourhoods-and-communities/community-funding-and-support/i-am-brent-grant'

// ── Barnet ────────────────────────────────────────────────────────────────────
const YBF_S2G = 'https://www.youngbarnetfoundation.org.uk/space2grow-42'

// ── Haringey ──────────────────────────────────────────────────────────────────
const HAR_CCF = 'https://haringey.gov.uk/environment/climate/haringey-community-carbon-fund'

// ── Waltham Forest ────────────────────────────────────────────────────────────
const WF_CWF = 'https://www.walthamforest.gov.uk/neighbourhoods/grants/community-ward-funding'

// ── Newham ────────────────────────────────────────────────────────────────────
const NEW_LYLE = 'https://www.newham.gov.uk/community-parks-leisure/funding-community-projects-1/3'
const NEW_LYLE_PDF = 'https://www.newham.gov.uk/downloads/file/11408/lyles-local-fund-2026-27-grant-brochure'

// ── Kensington and Chelsea ────────────────────────────────────────────────────
const KC_VSSF = 'https://thekandcfoundation.com/responding-specific-challenges/voluntary-sector-support-fund-2027-30-small-grants-fund'
const KC_SPIRIT = 'https://thekandcfoundation.com/responding-specific-challenges/community-spirit-small-grants-fund'
const KC_GRENFELL = 'https://www.kcsc.org.uk/funding/grenfell-community-activities-grant'
const KC_NCIL = 'https://planningconsult.rbkc.gov.uk/NCILRBKC'
const WW_CSF = 'https://www.westway.org/grants-opportunities/grants/grant/csf/'
const WW_CIF = 'https://www.westway.org/grants-opportunities/grants/grant/cif/'

// ── Bromley ───────────────────────────────────────────────────────────────────
const AZELIA = 'https://azeliahallbeckenham.co.uk/Grant-Application/'

// ── Greenwich ─────────────────────────────────────────────────────────────────
const GRE_THEMED = 'https://www.royalgreenwich.gov.uk/help-money/voluntary-community-funding/people-themed-grants'

const GHCF = 'https://www.groundwork.org.uk/london/greenwich-healthier-communities-fund-grants/'

// ── Southwark ─────────────────────────────────────────────────────────────────
const SW_VCS = 'https://www.southwark.gov.uk/community-engagement/grants-and-funding/voluntary-and-community-sector-support-grant'

// ── Wandsworth and Lambeth ────────────────────────────────────────────────────
const SWSJ = 'https://swsjcharity.org.uk/grants-orgs/'

// ── Tower Hamlets ─────────────────────────────────────────────────────────────
const EECF_TH = 'https://eastendcf.org/tower-hamlets/'
const WTT_GUIDE = 'https://eastendcf.org/wp-content/uploads/2026/09/Wakefield-Tetley-Small-Grants-Grants-Fund_Open-Round_Autumn-2026-Guidelines-2-1-1.docx'

const AAF_ORG = 'https://aldgateallhallows.org.uk/grants/grants-for-schools-organisations/'
const COL_CIL = 'https://www.cityoflondon.gov.uk/about-us/working-with-community/community-infrastructure-levy-neighbourhood-fund/community-infrastructure-levy-neighbourhood-fund-apply'

// ── Hackney ───────────────────────────────────────────────────────────────────
const HPC_HOW = 'https://hackneyparochialcharities.org.uk/how-to-apply/'
const HPC_DL = 'https://hackneyparochialcharities.org.uk/how-to-apply/deadline-dates/'
const SHPC = 'https://hackneyparochialcharities.org.uk/about/south-hpc/'

// ── Islington ─────────────────────────────────────────────────────────────────
const ISL_LIF = 'https://www.islington.gov.uk/advice/voluntary-and-community-sector/funding-support/local-initiatives-fund'

// ── Camden ────────────────────────────────────────────────────────────────────
const CAM_VCS = 'https://www.camden.gov.uk/voluntary-and-community-sector-in-camden'
const CAM_LOVE = 'https://www.lovecamden.org/spotlight/the-love-culture-fund'
const CG_EQ = 'https://www.camdengiving.org.uk/the-equality-fund-2026'

// ── Westminster ───────────────────────────────────────────────────────────────
const WM_EHT = 'https://www.westminster.gov.uk/leisure-libraries-and-community/charities-and-community-grants/edward-harvist-trust'
const WM_EVENTS = 'https://www.westminster.gov.uk/leisure-libraries-and-community/community-events-fund'
const WM_PADD = 'https://www.westminster.gov.uk/leisure-libraries-and-community/charities-and-community-grants/paddington-charities'
const WM_WARD = 'https://www.westminster.gov.uk/about-council/democracy/ward-budget-application'

// ── Merton ────────────────────────────────────────────────────────────────────
const MER_NCIL = 'https://www.merton.gov.uk/communities-and-neighbourhoods/funding/civic-pride/neighbourhood'

// ── Bexley ────────────────────────────────────────────────────────────────────
const BEX_GDG = 'https://www.bvsc.co.uk/resource/bvsc-grassroots-development-grant-opportunity'
const BEX_GDG_PDF = 'https://www.bvsc.co.uk/sites/bvsc.co.uk/files/Guidance%20Document%20Grassroot%20Development%20Grant.pdf'

// ── Kingston upon Thames ──────────────────────────────────────────────────────
const KIN_NCG = 'https://www.kingston.gov.uk/leisure-and-community/community-grants/neighbourhood-grants'
const KIN_NCIL = 'https://www.kingstonletstalk.co.uk/communities-and-neighbourhoods/ncil/'

// ── Hammersmith and Fulham ────────────────────────────────────────────────────
const HF_SG = 'https://www.lbhf.gov.uk/community/information-voluntary-sector/small-grants-funding'

// ── Enfield ───────────────────────────────────────────────────────────────────
const ENF_SOC = 'https://enfieldsociety.org.uk/grants/'

// ── London-wide ───────────────────────────────────────────────────────────────
const WCGL_WHAT = 'https://wcgl.london/what-we-fund'
const WCGL_WHO = 'https://wcgl.london/who-can-apply'

export const NEW: Row[] = [
  { title: 'Ealing Council — Better Spaces Fund', funder: 'Ealing Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: EAL_BS, url_status: 'unchecked',
    location_tag: 'Ealing', is_local: true, amount_min: null, amount_max: 10000, deadline: '2026-11-15', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['environment', 'community', 'faith'], target_beneficiaries: ['general_public'],
    niche_tags: ['climate', 'energy', 'renewable_energy'],
    description: 'Ealing Council’s grant programme for community and faith organisations to improve the buildings and spaces they use: cutting energy costs, keeping them warmer in winter and cooler in summer, and reducing flood risk. Grants of up to £10,000, from a £100,000 fund, for works such as insulation, double glazing, solar panels, heat pumps, LED lighting, shutters, awnings and greening. It cannot pay rent, bills, administration or staffing. Previously called Community Climate Grants. Applications open 22 September and close 15 November 2026; groups in Greenford, Northolt and Southall are prioritised if the fund is oversubscribed.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Ealing', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Not-for-profit community or faith organisations that work for the benefit of local people and are based in, or mainly operate within, the London Borough of Ealing. The organisation needs suitable financial management, such as a group bank account, clear procedures for approving spending and a treasurer or equivalent. Tenants need their landlord’s permission for the works.',
      what_they_fund: 'Improvements to community buildings and spaces that cut running costs, usually through energy efficiency, or that make a building more resilient to heat and heavy rain: insulation, solar panels, double glazing, heat pumps, LED lighting and smart meters, ventilation, shutters, awnings, tree planting and greening.',
      typical_award: 'Up to £10,000 per organisation, from a total fund of £100,000.',
      exclusions: 'Day-to-day organisational costs, including rent, bills, administration costs and staffing costs.',
      priorities: 'Projects are scored on energy and carbon saving (reducing gas scores higher than reducing electricity) or on resilience to heat and heavy rain, plus community involvement, a delivery plan ready to start in early 2027, and value for money. Applications from Greenford, Northolt and Southall score higher if the fund is oversubscribed.',
      geographic_focus: 'London Borough of Ealing.',
      decision_timeline: 'Closes 15 November 2026. Scored by a panel of the council’s climate team in late November, grant offers in mid December 2026, payment in February 2027.',
      how_to_apply: 'Complete the application form and email it to climateaction@ealing.gov.uk with proof of lease or ownership and one quote for the planned work.',
      _citations: {
        who_can_apply: { snippet: 'is a not-for-profit community or faith organisation • works for the benefit of local people • is based in, or mainly operates within, the London Borough of Ealing', confidence: 'high', source_url: EAL_BS_PDF },
        typical_award: { snippet: 'The Better Spaces fund offers grants of up to £10,000 for community and faith groups.', confidence: 'high', source_url: EAL_BS },
        exclusions: { snippet: 'it cannot be used to cover day-to-day organisational costs. This items that are not allowed can be, but are not limited to: • rent • bills • administration costs • staffing costs', confidence: 'high', source_url: EAL_BS_PDF },
        open_status: { snippet: 'Applications are open from 22 September to 15 November 2026', confidence: 'high', source_url: EAL_BS },
        how_to_apply: { snippet: 'Please complete and return the application form to climateaction@ealing.gov.uk with: • proof of lease/ownership • one quote for the work being planned', confidence: 'high', source_url: EAL_BS_PDF },
      } } },

  { title: 'Elizabeth line Community Fund', funder: 'Transport for London (Elizabeth line)', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: ELCF, url_status: 'unchecked',
    location_tag: 'Hillingdon, Ealing, Westminster, Camden, Islington, City of London, Tower Hamlets, Newham, Greenwich, Bexley, Redbridge, Barking and Dagenham, Havering, Slough, Reading, Maidenhead, South Buckinghamshire, Brentwood',
    is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-10-09', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'environment', 'young_people'], target_beneficiaries: ['general_public', 'young_people', 'disabled_people'],
    niche_tags: ['accessibility'],
    description: 'An annual fund from TfL’s Elizabeth line for community groups, charities and not-for-profit organisations located along the line. Grants of up to £5,000, which fully fund the project, for work that promotes community wellbeing, sustainability and the environment, local engagement and connectivity, youth engagement, or accessibility and inclusion. The project must be within a 15-minute walk of an Elizabeth line station and have a clear connection to the Elizabeth line. Past grants have gone to community gardens, mental health and wellbeing programmes, women’s community projects and improvements to public spaces around stations. Closes Friday 9 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Elizabeth line corridor, Reading and Heathrow to Shenfield and Abbey Wood', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community groups, charities and not-for-profit organisations whose project is based within a 15-minute walk of an Elizabeth line station and can show a clear connection to the Elizabeth line. Organisations affiliated with political or religious organisations or activities cannot apply.',
      what_they_fund: 'Projects that create lasting benefits for communities served by the railway and promote community wellbeing, sustainability and the environment; local engagement and connectivity; youth engagement; or accessibility and inclusion.',
      typical_award: 'Up to £5,000, fully funding the project.',
      exclusions: 'Organisations affiliated with political or religious organisations or activities. Projects more than a 15-minute walk from an Elizabeth line station, or without a clear connection to the line.',
      geographic_focus: 'Within a 15-minute walk of an Elizabeth line station, from Reading and Heathrow in the west through central London to Shenfield and Abbey Wood in the east.',
      decision_timeline: 'Annual fund. The 2026 round is open now and closes on Friday 9 October 2026.',
      how_to_apply: 'Apply through the online form linked from the Elizabeth line Community Fund section of the TfL page. Questions go to the fund administrator, the Elizabeth line community ambassador team at GTS Rail Operations (ambassadors.team@gtsr.co.uk).',
      _citations: {
        who_can_apply: { snippet: 'Be a community group, charity or not-for-profit organisation - Have a project based within a 15-minute walk of an Elizabeth line station - Demonstrate a clear connection to the Elizabeth line', confidence: 'high', source_url: ELCF },
        typical_award: { snippet: 'Deliver the project with funding of up to £5,000, which will be fully funded through the Community Fund', confidence: 'high', source_url: ELCF },
        exclusions: { snippet: 'Not be affiliated with political or religious organisations or activities', confidence: 'high', source_url: ELCF },
        open_status: { snippet: 'Applications to the Elizabeth line Annual Community Fund are now open. Closing date: Friday 9 October 2026.', confidence: 'high', source_url: ELCF },
      } } },

  { title: 'Hounslow Thriving Communities Fund — Sustainability Grant', funder: 'London Borough of Hounslow', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'core_costs'],
    apply_url: HOU, shares_url_with: 'd33d42f4 Thriving Communities Fund - Small Grants (both funds live on the council grants page)', url_status: 'unchecked',
    location_tag: 'Hounslow', is_local: true, amount_min: 10000, amount_max: 15000, deadline: '2026-09-30', is_rolling: false,
    max_org_income: 300000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['general_public', 'children', 'families', 'young_people'],
    niche_tags: [],
    description: 'Unrestricted grants of £10,000 to £15,000 from Hounslow Council for local voluntary, community and social enterprise organisations, replacing the old Thriving Communities Revenue Grant. It invests in the organisation rather than a project: staffing, rent, systems, governance, service delivery and other costs that build sustainability. Each funded group gets a named Grant Manager and support from Ealing and Hounslow CVS until December 2027. About 8 to 10 awards from £100,000. Aimed at organisations with income up to £300,000 that deliver in Hounslow and mainly benefit Hounslow residents. Closes 30 September 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Hounslow', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Not-for-profit constituted voluntary, community and social enterprise organisations: registered charities, CIOs, Community Interest Companies, companies limited by guarantee without share capital, and constituted community and voluntary organisations. They must deliver activities or services within Hounslow and primarily benefit Hounslow residents. Aimed at small and medium organisations with annual income up to £300,000 (higher considered where there is a clear case). Needs a formal governing document, a bank account in the organisation’s name and at least three unrelated trustees, directors or committee members.',
      what_they_fund: 'Unrestricted funding for the organisation itself, for example staffing, rent and premises, systems and digital infrastructure, volunteer and staff development, governance improvements, organisational development, service delivery and community engagement, alongside a support offer from a named Grant Manager and Ealing and Hounslow CVS.',
      typical_award: 'Between £10,000 and £15,000 per organisation, from a budget of £100,000; about 8 to 10 organisations funded.',
      exclusions: 'Organisations that are not constituted and not-for-profit; companies with share capital; organisations that do not deliver in Hounslow or mainly benefit Hounslow residents.',
      priorities: 'Organisations based in Hounslow, and organisations working within the borough’s Equality Opportunity Areas. Work contributing to the Council’s Corporate Plan areas: early childhood, learning and opportunity, work, community life and healthy life.',
      geographic_focus: 'London Borough of Hounslow.',
      decision_timeline: 'Open 21 August to 30 September 2026. Assessment conversations in the week of 19 October, funding decisions and start of grants in November 2026; delivery and support run to December 2027.',
      how_to_apply: 'Apply through the council’s grants portal, linked from the Thriving Communities Fund page, answering three questions in writing or by other formats the guidance allows.',
      _citations: {
        who_can_apply: { snippet: 'Applications are welcomed from not-for-profit constituted voluntary, community and social enterprise (VCSE) organisations, including: Registered charities Charitable Incorporated Organisations (CIOs) Community Interest Companies (CICs) Companies Limited by Guarantee (without share capital)', confidence: 'high', source_url: HOU_SUST_PDF },
        typical_award: { snippet: 'Applicants can apply for between £10,000 and £15,000.', confidence: 'high', source_url: HOU_SUST_PDF },
        max_org_income: { snippet: 'The grant is primarily aimed at small and medium-sized VCSE organisations with an annual income of up to £300,000.', confidence: 'high', source_url: HOU_SUST_PDF },
        open_status: { snippet: 'Applications are open from 21 August to 30 September 2026.', confidence: 'high', source_url: HOU },
      } } },

  // ── Brent ───────────────────────────────────────────────────────────────────
  // brent.gov.uk refuses curl (403); both pages were read through the reader proxy.
  { title: 'Brent Together Towards Zero Grant', funder: 'Brent Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: BRENT_TTZ, url_status: 'unchecked',
    location_tag: 'Brent', is_local: true, amount_min: null, amount_max: 5000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated', 'individual'],
    impact_sectors: ['environment', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['climate', 'circular_economy', 'urban_greening', 'energy'],
    description: 'Brent Council’s small grants programme for community climate action. Grants of up to £5,000 for one-off activities with a clear beginning and end that help tackle the climate and ecological emergency in Brent: re-use and repair, recycling and waste reduction, community gardens and food growing, environmental education, community-scale energy efficiency, and building local skills for the energy transition. Open to Brent residents, constituted community groups, tenant and resident associations, faith groups, charities, housing associations, social enterprises and local businesses with a clear community benefit. Round 5 opened on 15 June 2026 and funding runs until spring 2027 or until it runs out; one award per round. Projects that are exclusively tree planting are not funded.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Brent', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Applicants aged 18 or over, based in Brent with a project in Brent: individual residents, constituted community groups, established tenant or resident associations, faith groups, charities, housing associations, social enterprises, and local businesses for projects with a clear community benefit. New residents and newly formed groups are particularly welcome.',
      what_they_fund: 'One-off activities within a project with a clear beginning and end that help tackle the climate and ecological emergency, for example re-use and repair, recycling and waste reduction, community gardens and food growing, environmental education or workshops, community environmental campaigns, community-scale energy efficiency, and building local skills and capacity for the energy transition. Benefits should continue after the funding ends.',
      typical_award: 'Up to £5,000. One award per funding round.',
      exclusions: 'Projects that are exclusively tree planting. Planters or installations on the public highway need to keep footways clear and should involve Brent Highways early.',
      priorities: 'Projects that support the themes of the Council’s Climate and Ecological Emergency Strategy, improve the local environment, greenery or biodiversity or deliver measurable carbon savings, and involve or benefit young people, older people, Black, Asian and minority ethnic communities, and people with physical or mental disabilities.',
      geographic_focus: 'London Borough of Brent.',
      decision_timeline: 'Round 5 opened 15 June 2026. Funding runs until spring 2027 or until funds run out. After applying, the team asks for supporting documents, to be supplied within two weeks.',
      how_to_apply: 'Read the guidance notes on the grant page, then apply through the council’s online form. Help, or a paper form, from ecogrants@brent.gov.uk.',
      _citations: {
        open_status: { snippet: 'Applications for round 5 are now open.', confidence: 'high', source_url: BRENT_TTZ },
        typical_award: { snippet: 'You can apply for up to £5,000 for one off activities that contribute to a project with a clear beginning and end.', confidence: 'high', source_url: BRENT_TTZ },
        decision_timeline: { snippet: 'Funding runs until: Spring 2027 (or until funds run out)', confidence: 'high', source_url: BRENT_TTZ },
        exclusions: { snippet: 'Together Towards Zero grant funding cannot be used for exclusively tree planting projects.', confidence: 'high', source_url: BRENT_TTZ },
      } } },

  { title: 'I AM Brent Community Microgrants', funder: 'I AM Brent (Step Up Hub consortium, funded by the Mayor of London’s Violence Reduction Unit)', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: BRENT_IAM, funding_index_url: 'https://stepuphub.org/community-microgrant/', url_status: 'unchecked',
    location_tag: 'Brent', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-09-27', is_rolling: false,
    max_org_income: 200000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['young_people', 'justice', 'community'], target_beneficiaries: ['young_people', 'families', 'ethnic_minorities'],
    niche_tags: ['youth_support'],
    description: 'Grants of up to £5,000, with capacity building support, for new projects that help young people aged 25 and under, their families and associated community members stay safe from violence in five areas of Brent: Chalkhill Estate, Church Road Estate, Harlesden Town Centre, St Raphael’s Estate and Stonebridge Estate. Run by the I AM Brent consortium led by Step Up Hub and funded by the Mayor of London’s Violence Reduction Unit. Applicants must be a charity, not-for-profit organisation or unincorporated association based in Brent, with turnover under £200,000 and at least a quarter of its senior team or trustees from a minority ethnic background. Round 3 closes at 11.59pm on 27 September 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Brent', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'A charity, not-for-profit organisation or unincorporated association based in Brent, with at least 25% of its senior team and/or trustees from a minority ethnic background, total annual turnover under £200,000, and a bank account needing two people to authorise payments. Individuals aged 18 or over may apply only in partnership with an eligible organisation. The whole project must be delivered and the grant spent by 28 February 2027.',
      what_they_fund: 'New, fully costed prevention or diversionary projects that reduce violence locally, for young people aged 25 and under, their families or associated community members who live, work, study or spend substantial time in Chalkhill Estate, Church Road Estate, Harlesden Town Centre, St Raphael’s Estate or Stonebridge Estate. Aims can include better community relations, confidence and social skills, community voice, mental health, educational outcomes, employment prospects, and reducing the risk of gender-based violence.',
      typical_award: 'Up to £5,000, which must cover the project’s full cost, plus workshops and one-to-one capacity building support.',
      exclusions: 'Existing projects (the grant must be for a new project). Organisations with turnover of £200,000 or more, or with under 25% of senior team or trustees from a minority ethnic background. Individuals applying without a partner organisation.',
      geographic_focus: 'Five areas of Brent: Chalkhill Estate, Church Road Estate, Harlesden Town Centre, St Raphael’s Estate and Stonebridge Estate.',
      decision_timeline: 'Round 3 is open from 12 August until 11.59pm on Sunday 27 September 2026. Four stages: shortlisting, a 45-minute interview, a community panel, then due diligence within two weeks.',
      how_to_apply: 'Read the guidance and assessment criteria and apply through the Step Up Hub website (stepuphub.org/community-microgrant).',
      _citations: {
        who_can_apply: { snippet: 'be a charity, not-for profit organisation or unincorporated association based in Brent * have at least 25% of the organisation’s senior team and/or trustees from a minority ethnic background * have a total annual turnover of less than £200,000', confidence: 'high', source_url: BRENT_IAM },
        typical_award: { snippet: 'I AM Brent provides grants of up to £5,000 and capacity building support for all applicants.', confidence: 'high', source_url: BRENT_IAM },
        open_status: { snippet: 'Applications for round 3 are open from 12 August 2026 until 27 September 2026.', confidence: 'high', source_url: BRENT_IAM },
        geographic_focus: { snippet: 'Chalkhill Estate * Church Road Estate * Harlesden Town Centre * St Raphael’s Estate * Stonebridge Estate.', confidence: 'high', source_url: BRENT_IAM },
      } } },

  // ── Barnet ──────────────────────────────────────────────────────────────────
  // Judgement for Paul: open to 4 October, but only to Young Barnet Foundation
  // members who applied to join before 28 August 2026. Staged because the fund
  // recurs every year (this is round 42) and a Barnet youth group needs to know
  // membership is the route in; reject if members-only rounds should not show.
  { title: 'Young Barnet Foundation — Space2Grow Main Grant 2026', funder: 'Young Barnet Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: YBF_S2G, funding_index_url: 'https://www.youngbarnetfoundation.org.uk/space2grow', url_status: 'unchecked',
    location_tag: 'Barnet', is_local: true, amount_min: 4000, amount_max: 10000, deadline: '2026-10-04', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['young_people', 'mental_health'], target_beneficiaries: ['young_people', 'children', 'mental_health', 'ethnic_minorities', 'carers'],
    niche_tags: ['youth_mh'],
    description: 'Young Barnet Foundation’s annual main grant, round 42 of its Space2Grow Children and Young People’s Fund. Grants of £4,000 to £10,000 for 12-month projects starting from 1 March 2027 that deliver activities and support for children and young people in the London Borough of Barnet and meet their mental health support needs (getting advice, getting help, getting more help, getting risk support). Themes this year: early intervention and prevention, children and young people from ethnic minorities, young carers, and suicidal ideation. £70,000 in total. Open only to Young Barnet Foundation VCFSE members who applied to join before 28 August 2026. Closes 23:59 on Sunday 4 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Barnet', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Young Barnet Foundation voluntary, community, faith and social enterprise members who deliver activities and services in Barnet. Membership must have been applied for before 28 August 2026. Partner organisations in a joint project complete a separate partnership working form.',
      what_they_fund: 'Up to 12-month projects, starting from 1 March 2027, delivering activities, opportunities and support services for children and young people in Barnet, which show how they meet participants’ mental health support needs across four levels: getting advice, getting help, getting more help, getting risk support.',
      typical_award: 'Between £4,000 and £10,000 per application, from £70,000 in total.',
      exclusions: 'Organisations that are not Young Barnet Foundation members, or applied to join on or after 28 August 2026. Projects outside the London Borough of Barnet.',
      priorities: 'Early intervention and prevention; supporting children and young people from ethnic minorities; supporting young carers; suicidal ideation.',
      geographic_focus: 'London Borough of Barnet.',
      decision_timeline: 'Opened 19 August 2026 and closes 23:59 on Sunday 4 October 2026. Panel in the week of 30 November; applicants told no later than the week of 4 January 2027. Dates are subject to change.',
      how_to_apply: 'Read the eligibility criteria document, draft answers from the PDF version of the form (the online form cannot be saved part way), then apply through the online form linked from the Space2Grow #42 page.',
      _citations: {
        who_can_apply: { snippet: 'This fund is open to Young Barnet Foundation VCFSE members who deliver activities and services in Barnet. You must have applied to be a member prior to the 28th August 2026 .', confidence: 'high', source_url: YBF_S2G },
        typical_award: { snippet: 'Between £4,000 and £10,000 for up to a 12-month project.', confidence: 'high', source_url: YBF_S2G },
        decision_timeline: { snippet: 'Application Deadline: 23:59, Sunday 4th October 2026*', confidence: 'high', source_url: YBF_S2G },
      } } },

  // ── Haringey ────────────────────────────────────────────────────────────────
  { title: 'Haringey Community Carbon Fund — Year 6', funder: 'Haringey Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital', 'project'],
    apply_url: HAR_CCF, url_status: 'unchecked',
    location_tag: 'Haringey', is_local: true, amount_min: null, amount_max: 50000, deadline: '2026-11-29', is_rolling: false,
    next_open_date: '2026-09-29',
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['environment', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['climate', 'energy', 'renewable_energy'],
    description: 'Haringey Council’s grants for community-led decarbonisation and climate resilience projects that benefit Haringey residents, funded by developers’ carbon offset payments. Year 6 has £100,000 in three sizes: micro grants up to £1,000 (any individual or community group, constituted or not), medium grants up to £15,000 and large grants up to £50,000. Applicants for the larger grants must be constituted, working for the public benefit, and based in or mostly active in Haringey. Past projects include solar panels and batteries on community buildings. Applications open 29 September and close 11.59pm on 29 November 2026; shortlisted medium and large applicants present to a panel on 21 January 2027 and grants are issued from April 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Haringey', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Applicants must be constituted (a written set of rules), working for the public benefit, and based in and/or mostly active in Haringey. Any individual or community group can apply for a micro grant without being constituted. Further criteria depend on grant size.',
      what_they_fund: 'Community-led projects that reduce carbon emissions and benefit Haringey residents, now including climate resilience projects that deliver carbon savings; for example solar panels and batteries on community buildings. Scored on carbon reduction, community engagement, project delivery, budget and climate resilience, and for Years 5 and 6, contribution to the Borough of Culture objectives.',
      typical_award: 'Micro grants up to £1,000; medium grants up to £15,000; large grants up to £50,000. £100,000 in total for Year 6.',
      exclusions: 'Unconstituted groups for medium and large grants. Projects not based in or mostly active in Haringey. Works that need planning permission or consents should seek pre-application advice first.',
      priorities: 'High-impact carbon reduction projects, and projects that increase local climate resilience.',
      geographic_focus: 'London Borough of Haringey.',
      decision_timeline: 'Applications from Tuesday 29 September to 11.59pm Sunday 29 November 2026. Shortlisted medium and large applicants present to the panel on 21 January 2027; outcomes in March 2027; first grants issued from April 2027.',
      how_to_apply: 'Complete the micro grant form, or the medium and large grant form, from the fund page and email it with the attachments to climate@haringey.gov.uk. Question and answer sessions run on 29 September (in person) and 21 October (online), with one-to-one slots on 9 to 13 November.',
      _citations: {
        open_status: { snippet: 'Applications for year 6 can be submitted from Tuesday 29 September 2026 until Sunday 29 November 2026, 11.59pm.', confidence: 'high', source_url: HAR_CCF },
        typical_award: { snippet: 'large – up to £50,000 - medium – up to £15,000 - micro – up to £1,000', confidence: 'high', source_url: HAR_CCF },
        who_can_apply: { snippet: 'constituted – have a written set of rules and guidelines - working for the public benefit - based in and/or mostly active in Haringey', confidence: 'high', source_url: HAR_CCF },
      } } },

  // ── Waltham Forest ──────────────────────────────────────────────────────────
  // walthamforest.gov.uk answers curl with an empty 202; read through the proxy.
  // Ward budgets, but with a published process, a year-round window and a page
  // to apply from, so it clears the brief's ward-budget bar.
  { title: 'Waltham Forest Community Ward Funding 2026/27', funder: 'London Borough of Waltham Forest', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: WF_CWF, url_status: 'unchecked',
    location_tag: 'Waltham Forest', is_local: true, amount_min: null, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated', 'individual'],
    impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood', 'place_based'],
    description: 'Waltham Forest Council’s ward budgets for residents and community-based organisations delivering local initiatives, projects or improvements that benefit their area. Ward councillors decide which projects to fund and how much; each three-member ward has £10,000 and each two-member ward £6,660 for the year, and a project can draw on up to two wards. The 2026/27 round opened on 1 September 2026 under the theme Waltham Forest Futures. There is no deadline: applications are taken through the year while the ward still has money, and projects must finish by 31 August 2027. Funding cannot pay for staffing or wages or for individual needs.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Waltham Forest', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Residents and community-based organisations delivering initiatives, projects or improvements for the benefit of their local area in Waltham Forest. Applicants with outstanding evaluation or proof of spend from the 2025/26 round may find new applications delayed.',
      what_they_fund: 'Local initiatives, projects or improvements that benefit a ward, under the 2026/27 theme Waltham Forest Futures: opportunities communities need and foundations for longer-term, sustainable change. Past awards went to festivals, community gardens, youth sport, clean-ups, signage and residents’ activities.',
      typical_award: 'No per-applicant figure is stated. Ward councillors decide the amount from a ward budget of £10,000 (three-member wards) or £6,660 (two-member wards); a project can apply to up to two wards.',
      exclusions: 'Personal needs or individual support; staffing costs or wages.',
      geographic_focus: 'London Borough of Waltham Forest, ward by ward.',
      decision_timeline: 'Opened Tuesday 1 September 2026 with no deadline; applications accepted while the ward has funding left. Funded projects must be completed by Tuesday 31 August 2027.',
      how_to_apply: 'Apply through the Community Ward Funding page. Questions and support from the Community Ward Funding Team at cwfsupport@walthamforest.gov.uk.',
      _citations: {
        open_status: { snippet: 'This year there is no deadline, and applicants can apply throughout the year, so long as the ward they are applying in still has available funding.', confidence: 'high', source_url: WF_CWF },
        who_can_apply: { snippet: 'Community ward funding is an available budget to help residents and community-based organisations deliver local initiatives, projects or improvements for the benefit of the local area.', confidence: 'high', source_url: WF_CWF },
        exclusions: { snippet: 'this funding cannot be used for personal needs, on an individual basis, or to pay staffing costs or wages.', confidence: 'high', source_url: WF_CWF },
        typical_award: { snippet: 'three-member wards have £10,000 and * two-member wards have £6,660', confidence: 'med', source_url: WF_CWF },
      } } },

  // ── Newham ──────────────────────────────────────────────────────────────────
  { title: 'Lyle’s Local Fund 2026/27 (Newham)', funder: 'Tate & Lyle Sugars with the London Borough of Newham', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: NEW_LYLE, url_status: 'unchecked',
    location_tag: 'Newham', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-10-25', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'young_people', 'education', 'creative', 'health', 'heritage'], target_beneficiaries: ['general_public', 'children', 'young_people', 'families'],
    niche_tags: ['neighbourhood'],
    description: 'A fund from Tate & Lyle Sugars, run with Newham Council, for practical community-led projects that help make Newham safer, healthier and more prosperous. Grants of up to £5,000 from a £50,000 pot for not-for-profit organisations based in Newham whose work benefits Newham residents: charities, community groups, schools and parent-led school groups, CICs and social enterprises with a not-for-profit purpose, and faith groups proposing inclusive community benefit. Themes include children and young people, health and wellbeing, community safety, and communities and neighbourhoods, including cultural and heritage projects. Open 22 September to 11pm on 25 October 2026; a Tate & Lyle employee panel decides in late November and payments go out in mid December. One application per organisation.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Newham', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Not-for-profit organisations based in Newham whose work benefits Newham residents: charities and community organisations, schools and parent-led school groups, community interest companies and social enterprises with a not-for-profit purpose, faith and community groups proposing inclusive community benefit, and other constituted not-for-profit organisations. Suitable governance and an organisational bank account are expected, with insurance, safeguarding and DBS in place where relevant. One application per organisation.',
      what_they_fund: 'Practical, community-focused projects benefiting Newham residents under one main theme: children and young people (learning, confidence, creativity, mentoring, youth voice, family support, safe spaces); health and wellbeing (physical and mental health, social connection, peer support, carers); community safety and security; communities and neighbourhoods (events, resident-led activity, culture and heritage, volunteering, intergenerational work, neighbourhood improvement).',
      typical_award: 'Up to £5,000 per project, from a total fund of £50,000.',
      exclusions: 'Organisations not based in Newham or whose work does not benefit Newham residents; profit-making organisations; applicants with outstanding monitoring from previous grants.',
      geographic_focus: 'London Borough of Newham.',
      decision_timeline: 'Opens Tuesday 22 September 2026 and closes 11pm Sunday 25 October 2026. Council checks and scoring 4 to 15 November, Tate & Lyle Sugars employee panel 16 to 27 November, outcomes in the week of 7 December, agreements and payments from the week of 14 December 2026.',
      how_to_apply: 'Complete the application form found in the Grant Brochure linked from the fund page. Grant surgeries on 29 September (online) and 7 October (Stratford Library) are strongly encouraged. Queries to lyleslocalfund@newham.gov.uk; free application help from One Newham and Aston-Mansfield.',
      _citations: {
        open_status: { snippet: 'The grant goes live on Tuesday 22 September 2026 and closes on Sunday 25 October 2026 at 11.00pm', confidence: 'high', source_url: NEW_LYLE },
        typical_award: { snippet: 'Grants of up to £5,000 will be available, and the fund is open to not-for-profit organisations, such as schools, charities and community groups, who are based in Newham and whose work benefits the residents of Newham.', confidence: 'high', source_url: NEW_LYLE },
        who_can_apply: { snippet: 'Community interest companies and social enterprises with a not-for-profit purpose', confidence: 'high', source_url: NEW_LYLE_PDF },
      } } },

  // ── Kensington and Chelsea ──────────────────────────────────────────────────
  { title: 'Kensington and Chelsea VSSF 2027-30 — Small Grants Fund', funder: 'The Kensington + Chelsea Foundation with Kensington and Chelsea Council', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'unrestricted', 'multi_year'],
    apply_url: KC_VSSF, url_status: 'unchecked',
    location_tag: 'Kensington and Chelsea', is_local: true, amount_min: 25000, amount_max: 25000, deadline: '2026-09-25', is_rolling: false,
    max_org_income: 250000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['people_in_poverty', 'general_public'],
    niche_tags: [],
    description: 'Core funding of £25,000 a year for three years (April 2027 to March 2030) for smaller voluntary and community organisations helping to reduce deprivation in Kensington and Chelsea while easing pressure on council services. Run by the K+C Foundation for Kensington and Chelsea Council as the small grants strand of the Voluntary Sector Support Fund 2027-30, with £150,000 a year for about six grants. Open to registered charities and constituted groups such as CICs with income of no more than £250,000 in the last financial year. Decided by a paid panel of ten local residents with lived experience. Two stages: an expression of interest by 5pm on Friday 25 September 2026, then a full application for those shortlisted in late October.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kensington and Chelsea', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Smaller non-profit voluntary and community organisations in Kensington and Chelsea: registered charities and constituted groups such as CICs, with a maximum annual income of £250,000 in the previous financial year.',
      what_they_fund: 'Core costs for organisations helping to reduce deprivation in Kensington and Chelsea while working with the Council to ease pressure on local services.',
      typical_award: 'Fixed grants of £25,000 a year for three years; £150,000 a year available in total.',
      exclusions: 'Organisations with income over £250,000 in the last financial year (they apply to the Council’s Open or Infrastructure strands, whose expression of interest closed on 30 April 2026).',
      priorities: 'Set by a participatory panel of ten K+C residents with lived experience of the issues the fund addresses, who wrote the criteria and questions and assess applications.',
      geographic_focus: 'Royal Borough of Kensington and Chelsea.',
      decision_timeline: 'Expression of interest by 5pm Friday 25 September 2026; shortlisting in late October; final decisions at the end of November; grants start 1 April 2027.',
      how_to_apply: 'Complete the online expression of interest linked from the fund page. Shortlisted organisations are invited to a full application.',
      _citations: {
        typical_award: { snippet: 'The fund offers voluntary and community sector organisations fixed grants of £25,000 per year for three years for core costs .', confidence: 'high', source_url: KC_VSSF },
        who_can_apply: { snippet: 'registered charities and constituted groups such as CICs, with a maximum annual income of £250,000 in the previous financial year', confidence: 'high', source_url: KC_VSSF },
        open_status: { snippet: 'complete the Expression of Interest by Friday 25th September 2026 at 5pm .', confidence: 'high', source_url: KC_VSSF },
      } } },

  { title: 'Kensington + Chelsea Foundation — Community Spirit Small Grants Fund', funder: 'The Kensington + Chelsea Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'project'],
    apply_url: KC_SPIRIT, url_status: 'unchecked',
    location_tag: 'Kensington and Chelsea', is_local: true, amount_min: null, amount_max: 1000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'creative'], target_beneficiaries: ['general_public', 'ethnic_minorities'],
    niche_tags: ['neighbourhood'],
    description: 'Grants of up to £1,000 from the K+C Foundation for one-off and short-term events and activities that bring joy, hope and healing to Kensington and Chelsea: cultural and celebration events, school holiday activities, workshops and sports tournaments lasting no more than six weeks and not part of an organisation’s day-to-day work. Most beneficiaries must be K&C residents, and the grant must be at least a quarter of the project cost. Rolling, with no deadline, but apply at least six weeks before the project starts; one application per organisation in Year 6 (September 2026 to March 2027), and the fund closes when the money runs out. Projects in the south of the borough and grassroots groups working with minoritised or excluded communities are of particular interest.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kensington and Chelsea', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations running events or activities whose beneficiaries are mostly residents of Kensington and Chelsea. One application per organisation in Year 6 of the fund (September 2026 to March 2027).',
      what_they_fund: 'One-off and short-term events and activities (no longer than six weeks, not part of core day-to-day work) that bring joy, hope and healing to the community, such as cultural and celebration events, school holiday activities, workshops and sports tournaments.',
      typical_award: 'Up to £1,000. The grant must make up at least 25% of the total project cost.',
      exclusions: 'Core, day-to-day work; activities lasting more than six weeks; applications made less than six weeks before the project starts; a second application in the same fund year.',
      priorities: 'Projects in the south of the borough, and grassroots organisations working with minoritised or excluded communities.',
      geographic_focus: 'Royal Borough of Kensington and Chelsea.',
      decision_timeline: 'Rolling, no deadline; applications reviewed as they arrive. The fund closes when the year’s allocation runs out.',
      how_to_apply: 'Apply through the Year 6 online form linked from the fund page, at least six weeks before the project starts.',
      _citations: {
        open_status: { snippet: 'The Community Spirit Small Grants Fund is now open for applications on a rolling basis, with grants of up to £1,000 available.', confidence: 'high', source_url: KC_SPIRIT },
        typical_award: { snippet: 'The maximum available is £1,000 and our grant must make up at least 25% of the total project cost.', confidence: 'high', source_url: KC_SPIRIT },
        exclusions: { snippet: 'one-off and short-term events (not spanning more than 6 weeks and not part of an organisation’s core, day-to-day work)', confidence: 'high', source_url: KC_SPIRIT },
      } } },

  { title: 'Westway Trust — Community Seedling Fund', funder: 'Westway Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'project'],
    apply_url: WW_CSF, url_status: 'unchecked',
    location_tag: 'Kensington and Chelsea', is_local: true, amount_min: null, amount_max: 2000, deadline: '2026-10-12', is_rolling: false,
    max_org_income: 20000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'unincorporated'],
    impact_sectors: ['community', 'creative'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood', 'place_based'],
    description: 'Project grants of up to £2,000 from Westway Trust, the charity that manages the land under the Westway flyover, for small, under-resourced grassroots organisations with annual turnover under £20,000 working in Kensington and Chelsea, with a particular focus on North Kensington. Projects in any art form or theme important to North Kensington’s communities, where public engagement is central or significant. Community organisations, registered charities, CIOs, CICs and constituted groups can apply. Very competitive: the similar programme last year received 98 applications and funded 38. Closes 5pm on Monday 12 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kensington and Chelsea', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community organisations, registered charities, registered CIOs, registered CICs, or community groups with a written constitution or governing document, with annual turnover under £20,000, operating within Kensington and Chelsea with a particular focus on North Kensington. Groups with turnover of £20,000 to £100,000 apply to the Community Impact Fund instead.',
      what_they_fund: 'Projects that benefit local communities in North Kensington, in any art form or theme important to them, where public engagement is central to the activity or a significant element of it.',
      typical_award: 'Up to £2,000 for any one project, regardless of partnerships between organisations.',
      exclusions: 'Organisations with turnover of £20,000 or more; organisations not operating in Kensington and Chelsea.',
      geographic_focus: 'Royal Borough of Kensington and Chelsea, focused on North Kensington.',
      decision_timeline: 'Open now; closes 5pm Monday 12 October 2026.',
      how_to_apply: 'Read the guidelines and FAQs on the Westway Trust fund page and apply online from there.',
      _citations: {
        typical_award: { snippet: 'The maximum grant awarded is £2,000 for any one project regardless of collaborations or partnerships between organisations.', confidence: 'high', source_url: WW_CSF },
        max_org_income: { snippet: 'specifically for small, under-resourced grassroots organisations with an annual turnover of less than £20,000.', confidence: 'high', source_url: WW_CSF },
        who_can_apply: { snippet: 'We fund community organisations, registered charities, registered Charitable Incorporated Organisations (CIO), or registered Community Interest Companies (CIC), or a community group with a written constitution', confidence: 'high', source_url: WW_CSF },
        open_status: { snippet: 'Apply by Monday 12 October, 5pm', confidence: 'high', source_url: 'https://www.kcsc.org.uk/funding/community-seedling-fund' },
      } } },

  { title: 'Westway Trust — Community Impact Fund', funder: 'Westway Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'project'],
    apply_url: WW_CIF, url_status: 'unchecked',
    location_tag: 'Kensington and Chelsea', is_local: true, amount_min: null, amount_max: 3000, deadline: '2026-10-12', is_rolling: false,
    min_org_income: 20000, max_org_income: 100000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'unincorporated'],
    impact_sectors: ['community', 'creative'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood', 'place_based'],
    description: 'Project grants of up to £3,000 from Westway Trust for community-centred organisations with annual turnover between £20,000 and £100,000 working in Kensington and Chelsea, with a particular focus on North Kensington. The Trust looks for projects where tangible positive impact is central, or where there is a significant element of public engagement. Community organisations, registered charities, CIOs, CICs and constituted groups can apply. Very competitive: last year’s similar programme funded 38 of 98 applicants. Closes 5pm on Monday 12 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kensington and Chelsea', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community organisations, registered charities, registered CIOs, registered CICs, or community groups with a written constitution or governing document, with annual turnover between £20,000 and £100,000, operating within Kensington and Chelsea with a particular focus on North Kensington. Smaller groups apply to the Community Seedling Fund; larger ones to Transformation Grants.',
      what_they_fund: 'Projects with a positive impact on the communities of North Kensington, where tangible impact is a central theme or where there is a significant element of public engagement.',
      typical_award: 'Up to £3,000 for any one project, regardless of partnerships between organisations.',
      exclusions: 'Organisations with turnover under £20,000 or over £100,000; organisations not operating in Kensington and Chelsea.',
      geographic_focus: 'Royal Borough of Kensington and Chelsea, focused on North Kensington.',
      decision_timeline: 'Open now; closes 5pm Monday 12 October 2026.',
      how_to_apply: 'Apply online from the Westway Trust fund page.',
      _citations: {
        typical_award: { snippet: 'The maximum grant awarded is £3,000 for any one project regardless of collaborations or partnerships between organisations.', confidence: 'high', source_url: WW_CIF },
        max_org_income: { snippet: 'This fund is specifically designed for local community-centred organisations with an annual turnover of between £20,000 and £100,000 .', confidence: 'high', source_url: WW_CIF },
        open_status: { snippet: 'Applications are now open for the Community Impact Fund, with up to £3,000 available for any one project.', confidence: 'high', source_url: 'https://www.kcsc.org.uk/funding/community-impact-fund-0' },
      } } },

  { title: 'Kensington and Chelsea Neighbourhood CIL (NCIL)', funder: 'Royal Borough of Kensington and Chelsea', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital', 'project'],
    apply_url: KC_NCIL, funding_index_url: 'https://www.rbkc.gov.uk/planning-and-building-control/planning-policy/neighbourhood-community-infrastructure-levy-ncil', url_status: 'unchecked',
    location_tag: 'Kensington and Chelsea', is_local: true, amount_min: null, amount_max: null, deadline: '2027-01-31', is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'individual'],
    impact_sectors: ['community', 'environment'], target_beneficiaries: ['general_public'],
    niche_tags: ['place_based', 'urban_greening'],
    description: 'Kensington and Chelsea’s Neighbourhood Community Infrastructure Levy, relaunched with year-round applications, funds local infrastructure that makes the borough greener, safer and fairer: greening, speed indicator devices, CCTV, crossings, cycle hangars, air quality sensors, benches, libraries and sports facilities. Residents, community groups, residents’ associations, registered charities, infrastructure providers and charitable companies can apply within the amount available in their ward; £3.16 million was available across the wards in September 2026. Decisions are made twice a year, in June and December; applications for the June 2027 decisions must be in by 11.59pm on 31 January 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kensington and Chelsea', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Residents, local community groups, residents’ associations, registered charities, infrastructure providers and charitable companies. Multi-ward applications are possible.',
      what_they_fund: 'Local infrastructure that makes the borough greener (greening projects), safer (speed indicator devices, CCTV, pedestrian crossings) and fairer (libraries, sports facilities), with indicative costs published for common items such as cycle hangars, air quality sensors and benches.',
      typical_award: 'No per-applicant figure is published; applications must fit within the amount available in the ward (£3.16 million across the borough in September 2026).',
      exclusions: 'Requests above the funds available in the ward; projects that are not infrastructure.',
      geographic_focus: 'Royal Borough of Kensington and Chelsea, by ward and neighbourhood plan area.',
      decision_timeline: 'Applications accepted all year; decisions twice a year in June and December. The next decisions are in June 2027 for applications received by 11.59pm on 31 January 2027.',
      how_to_apply: 'Apply using the NCIL online application form on the RBKC consultation portal, or by email or post.',
      _citations: {
        open_status: { snippet: 'The RBKC Neighbourhood Community Infrastructure Levy (NCIL) has relaunched with a new all year-round application process', confidence: 'high', source_url: KC_NCIL },
        decision_timeline: { snippet: 'The next decisions will be made in June 2027 and your application needs to be in by 11:59pm on 31 January 2027.', confidence: 'high', source_url: KC_NCIL },
        who_can_apply: { snippet: 'Residents, local community groups, residents’ associations, registered charities, infrastructure providers and charitable companies may apply for NCIL funding.', confidence: 'high', source_url: 'https://www.rbkc.gov.uk/planning-and-building-control/planning-policy/neighbourhood-community-infrastructure-levy-ncil' },
      } } },

  // Only public page is the CVS listing, which carries the council's form and brief.
  { title: 'Grenfell Community Activities Grant', funder: 'Royal Borough of Kensington and Chelsea', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: KC_GRENFELL, url_status: 'unchecked',
    location_tag: 'Kensington and Chelsea', is_local: true, amount_min: null, amount_max: 20000, deadline: '2026-09-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'mental_health', 'creative'], target_beneficiaries: ['general_public', 'families'],
    niche_tags: ['trauma_recovery'],
    description: 'Kensington and Chelsea Council grants for free activities exclusively for people eligible for Grenfell Community Support, residents living within 500m of Grenfell Tower or who lived there at the time of the tragedy. Up to £20,000 for 12-month projects (pro rata if shorter), or £2,500 to £5,000 for one-off projects, from a £125,000 round. Activities cover residents’ four priorities: wellbeing and relaxation, group day trips, creative activities such as arts, crafts, cooking or gardening, and physical activity. Everything except day trips must be delivered in Notting Dale between November 2026 and October 2027, though the delivering organisation can be based elsewhere. Constituted organisations only, and partnership bids of up to three are allowed. Closes 30 September 2026; a second round opens in February or March.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kensington and Chelsea', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Constituted organisations with a bank account in the organisation’s name and two unrelated signatories: charities, CICs, residents’ associations, faith groups and voluntary and community sector organisations. Applicants must show a strong understanding of the Grenfell community and the impact of the tragedy, established connections with local residents, and experience of delivering similar projects. The delivery organisation can be based outside the area; partnership bids of up to three organisations are allowed with one lead applicant.',
      what_they_fund: 'Free, inclusive, culturally sensitive activities exclusively for individuals and families eligible for Grenfell Community Support: wellbeing, relaxation and wellness activities; group day trips; creative activities such as arts, crafts, cooking or gardening; and physical activities not already covered by the Leisure Centre membership offer.',
      typical_award: 'Up to £20,000 for projects lasting 12 months (pro rata for shorter projects), or £2,500 to £5,000 for one-off projects. £125,000 in this round.',
      exclusions: 'Activities open to people not eligible for Grenfell Community Support; charged activities; delivery outside Notting Dale (except day trips); unconstituted groups.',
      geographic_focus: 'Notting Dale, Royal Borough of Kensington and Chelsea: residents within 500m of Grenfell Tower or who lived there at the time of the tragedy.',
      decision_timeline: 'Recommended submission by 23 September; deadline 30 September 2026; outcomes by 21 October; activities from November 2026 to October 2027. Two rounds a year for three years; the next opens in February or March 2027.',
      how_to_apply: 'Download the application form, FAQs, terms and brief for applicants from the Kensington and Chelsea Social Council listing and return the form as instructed there. The evaluation panel includes residents from the Operational Steering Group, Notting Dale councillors and council officers.',
      _citations: {
        typical_award: { snippet: 'Up to £20,000 for projects lasting 12 months (or pro rata for shorter projects). • Between £2,500 and £5,000 for one-off projects.', confidence: 'high', source_url: KC_GRENFELL },
        who_can_apply: { snippet: 'Eligible organisations include: • Charities. • Community Interest Companies (CICs). • Residents\' associations. • Faith groups. • Voluntary and community sector organisations.', confidence: 'high', source_url: KC_GRENFELL },
        open_status: { snippet: '30 September: Application deadline.', confidence: 'high', source_url: KC_GRENFELL },
      } } },

  // ── Bromley ─────────────────────────────────────────────────────────────────
  { title: 'Azelia Hall Charity — Grants for Bromley', funder: 'The Azelia Hall Charity', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: AZELIA, url_status: 'unchecked',
    location_tag: 'Bromley', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-11-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['health', 'disability', 'mental_health'], target_beneficiaries: ['disabled_people', 'mental_health'],
    niche_tags: ['chronic_illness'],
    description: 'One-off grants of up to £5,000 from the Azelia Hall Charity, which runs a community hall in Beckenham and started a grant scheme in 2025, for local charities and other not-for-profit initiatives serving Bromley residents who are unwell or convalescent or dealing with physical or mental disabilities or challenges. No minimum grant; staff or service costs for up to a year can be covered. Registered charities are preferred but other non-profits, such as CICs, are not ruled out; individuals cannot apply. Deadline 30 November 2026, for the trustees’ meeting in January 2027. The remit is the London Borough of Bromley only.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Bromley', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Local charities and other registered not-for-profit initiatives (for example a CIC) that serve residents of the London Borough of Bromley. Charitable status helps but is not required. Individuals cannot apply.',
      what_they_fund: 'Services for Bromley residents who are unwell or convalescent, or who are dealing with physical or mental disabilities or challenges. Single, one-off grants; staff or service costs can be covered for a fixed period of up to one year.',
      typical_award: 'Up to £5,000, with no minimum. More only in exceptional circumstances.',
      exclusions: 'Work outside the London Borough of Bromley; individuals; regular or repeat funding.',
      geographic_focus: 'London Borough of Bromley only.',
      decision_timeline: 'Deadline 30 November 2026 for the trustees’ meeting in January 2027. No feedback is given on unsuccessful applications.',
      how_to_apply: 'Complete the short online application form on the grant page (name, organisation, amount, how the request meets the criteria, and up to 500 words on what the grant is for). Questions to grants@azeliahallbeckenham.co.uk.',
      _citations: {
        typical_award: { snippet: 'We now provide grants of up to £5,000 to local charities and others that serve Bromley residents.', confidence: 'high', source_url: AZELIA },
        what_they_fund: { snippet: 'The services are for those who are unwell or convalescent, or who are dealing with physical / mental disabilities or challenges.', confidence: 'high', source_url: AZELIA },
        open_status: { snippet: 'The next Trustees\' meeting to consider grant applications will be in January 2027. Application deadline is 30th November 2026.', confidence: 'high', source_url: AZELIA },
      } } },

  // ── Greenwich ───────────────────────────────────────────────────────────────
  { title: 'Royal Greenwich VCFS Grants 2027-31 — Strength in People (Themed grants)', funder: 'Royal Borough of Greenwich', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'multi_year'],
    apply_url: GRE_THEMED, funding_index_url: 'https://www.royalgreenwich.gov.uk/help-money/funding-voluntary-and-community-organisations-royal-greenwich', url_status: 'unchecked',
    location_tag: 'Greenwich', is_local: true, amount_min: null, amount_max: 225000, deadline: '2026-10-26', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community', 'health', 'housing', 'disability', 'creative'], target_beneficiaries: ['general_public', 'carers', 'disabled_people', 'homeless', 'people_in_poverty'],
    niche_tags: ['befriending', 'social_isolation'],
    description: 'The first strand of Royal Greenwich’s four-year Voluntary, Community and Faith Sector grants programme, worth £2.35 million a year from April 2027. Themed grants in nine areas: befriending and social connection for vulnerable adults, carers, community centre activity, creative health and socially engaged arts, homelessness and rough sleeping, information, guidance and advice, SEND, learning disabilities and autism, volunteering infrastructure, and volunteering for families known to children’s social care. Bid caps run from £60,000 (befriending) to £225,000 (specialist advice), set theme by theme in the prospectus. Open to formally constituted not-for-profit organisations operating in the borough, including charities, CICs, social enterprises, faith groups, friends groups and tenants’ and residents’ associations. Applications through Plinth by 5pm on 26 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Greenwich', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, companies limited by guarantee, CICs, educational establishments, religious organisations, social enterprises, constituted community organisations, friends groups, and tenants’ and residents’ associations that are non-statutory, formally constituted, not-for-profit, have a properly elected management committee, and operate in the Royal Borough of Greenwich.',
      what_they_fund: 'Services under nine themes supporting the council’s commissioning priorities: befriending and social connection for vulnerable adults; carers across the life course; community centre activity; creative health and socially engaged arts and culture; homelessness and people at risk of rough sleeping; information, guidance, advice and specialist support; SEND, learning disabilities and autism; volunteering infrastructure; volunteering opportunities for families known to Children’s Social Care.',
      typical_award: 'Caps are set per theme: for example up to £60,000 for befriending, £65,000 for carers, £70,000 for community centres, £75,000 for creative health, £100,000 for homelessness, and £65,000, £100,000 or £225,000 for the three levels of advice. The strand is worth £2.35 million a year over four years.',
      exclusions: 'Private groups or companies; profit-making or trading arms; groups fundraising for redistribution; political parties or political campaigning; religious activity that promotes the religion or requires attendance at services; organisations whose main purpose is campaigning, except local groups addressing specific health and social inequalities.',
      geographic_focus: 'Royal Borough of Greenwich.',
      decision_timeline: 'Opened 14 September 2026; closes 5pm on 26 October 2026. Assessment 27 October to 8 December, decisions in December, awards on 25 January 2027, delivery from April 2027. Small neighbourhood grants open March 2027 and development grants June 2027.',
      how_to_apply: 'Complete the online application on Plinth, linked from the council’s Apply page, using the application form template, guidance notes and financial templates published there. Questions to VCS-Grant@royalgreenwich.gov.uk.',
      _citations: {
        typical_award: { snippet: 'Befriending and social connection for vulnerable adults You can bid for up to £60,000.', confidence: 'high', source_url: GRE_THEMED },
        open_status: { snippet: 'Deadline for completing the application is 5pm on 26th October 2026 .', confidence: 'high', source_url: 'https://www.royalgreenwich.gov.uk/help-money/voluntary-community-funding/apply' },
        who_can_apply: { snippet: 'be non-statutory - be formally constituted - operate in the not-for-profit sector - have a properly elected management committee - operate in the Royal Borough of Greenwich', confidence: 'high', source_url: 'https://www.royalgreenwich.gov.uk/help-money/voluntary-community-funding/who-can-apply' },
      } } },

  // groundwork.org.uk refuses curl (403); read through the reader proxy. Only the
  // Small, Micro and Enabling strands are open; Medium and Large are under review.
  { title: 'Greenwich Healthier Communities Fund (Phase 3)', funder: 'NHS Greenwich Charitable Funds, run by Groundwork London', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant', 'capacity'],
    apply_url: GHCF, url_status: 'unchecked',
    location_tag: 'Greenwich', is_local: true, amount_min: 500, amount_max: 5000, deadline: '2026-12-14', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated', 'individual'],
    impact_sectors: ['health', 'community', 'disability', 'young_people'], target_beneficiaries: ['general_public', 'disabled_people', 'children', 'young_people', 'older_people'],
    niche_tags: ['public_health', 'social_isolation', 'learning_disability'],
    description: 'A fund from NHS Greenwich Charitable Funds, with the South East London ICB and the Healthier Greenwich Partnership, run by Groundwork London, for projects that prevent or respond to health inequalities in the Royal Borough of Greenwich. Phase 3 is open for Delivery Small grants of £500 to £5,000 (continuing or piloting small projects, up to six months), and Micro and Enabling grants (capacity building and one-off purchases such as training, equipment and infrastructure) awarded on a rolling basis, all until 14 December 2026. The Medium (£5,001 to £20,000) and Large strands are under review and not open. Groups or individuals can apply; money must be spent in Greenwich for Greenwich residents; one live grant at a time.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Greenwich', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Groups or individuals who can show their project prevents or responds to health inequalities in Greenwich and aligns with the Greenwich Health and Wellbeing Strategy. Eligibility differs by strand. Only one live grant on the Fund at a time; current grant holders must talk to the team before applying.',
      what_they_fund: 'Projects that prevent health and wellbeing inequality by tackling its causes, or respond to current health issues and reduce unequal outcomes, in Greenwich. Open now: capacity building and one-off purchases (training, equipment, infrastructure) and the continuation or pilot of small projects. Priority themes for the larger strands include learning disabilities and autism, isolation, long-term conditions, and active healthy living for children and young people.',
      typical_award: '£500 to £5,000 in the open strands (Delivery Small, Micro and Enabling). Medium and Large strands (£5,001 to £100,000) are not currently open.',
      exclusions: 'Spending outside Greenwich or not for Greenwich residents; a second live grant on the Fund.',
      geographic_focus: 'Royal Borough of Greenwich.',
      decision_timeline: 'Phase 3 Delivery Small applications close 14 December 2026; Micro and Enabling grants are awarded on an ongoing basis until 14 December 2026.',
      how_to_apply: 'Read the prospectus and strand guidance on the Groundwork page, then apply through the strand links there. Support from GreenwichHealthierCommunities@Groundwork.org.uk or 020 7239 1286; an accessibility pot helps applicants who need assistance.',
      _citations: {
        open_status: { snippet: 'Phase 3 funding is now open for Delivery Grants Small, Medium and Large Grants.Application Deadline is 14 December 2026.', confidence: 'high', source_url: GHCF },
        typical_award: { snippet: 'Please note we are in the process of reviewing and updating Delivery Medium and Large, so these are not currently open for application.', confidence: 'high', source_url: GHCF },
        who_can_apply: { snippet: 'The grant welcomes applications from groups or individuals who can demonstrate that their proposed project prevents or responds to health inequalities in Greenwich', confidence: 'high', source_url: GHCF },
      } } },

  // ── Southwark ───────────────────────────────────────────────────────────────
  { title: 'Southwark Council — Voluntary and Community Sector Support Grant 2026-28', funder: 'Southwark Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'multi_year'],
    apply_url: SW_VCS, url_status: 'unchecked',
    location_tag: 'Southwark', is_local: true, amount_min: null, amount_max: 50000, deadline: '2026-10-25', is_rolling: false,
    next_open_date: '2026-10-05', min_org_income: 300000, max_org_income: 1500000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['general_public', 'people_in_poverty'],
    niche_tags: [],
    description: 'A one-off £1.5 million fund from Southwark Council giving time-limited support to established Southwark voluntary and community organisations under financial pressure, to give them capacity to plan for their future as funding changes. Core resilience grants of up to £50,000 a year for two years (2026 to 2028), plus a further £100,000 shared among grantees for a sector-led consortium. For constituted organisations such as registered charities and CICs working from premises in Southwark, running for at least five years, with income of £300,000 to £1.5 million in each of the last two years of audited accounts. Applications open through the Southwark grants portal on Monday 5 October and close at 11.59pm on 25 October 2026. Not a new ongoing grants programme.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Southwark', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Constituted organisations, such as registered charities or community interest companies, that work from premises in Southwark, have run for at least five years, and had income of £300,000 to £1.5 million in each of their last two years of audited accounts.',
      what_they_fund: 'Core resilience funding for organisations under financial pressure, giving them capacity to adapt and plan for their future as funding changes, plus a sector-led consortium element for collaboration and shared learning across Southwark’s voluntary sector.',
      typical_award: 'Up to £50,000 a year for two years per organisation, from £1.5 million; a further £100,000 supports a consortium of grantees.',
      exclusions: 'Organisations without premises in Southwark, under five years old, or outside the £300,000 to £1.5 million income band in either of the last two years. It is a one-off fund, not an ongoing grants programme.',
      geographic_focus: 'London Borough of Southwark.',
      decision_timeline: 'Applications open Monday 5 October 2026 and close at 11.59pm on 25 October 2026. Funding covers 2026 to 2028.',
      how_to_apply: 'Apply through the Southwark grants portal once it opens, showing your role and impact in Southwark communities, the pressure on your organisation, how the funding keeps it running, your approach to equality, diversity and inclusion, and how you would spend the money over two years.',
      _citations: {
        typical_award: { snippet: 'Each organisation can get up to £50,000 a year for 2 years, to give them the capacity to plan for their future.', confidence: 'high', source_url: `${SW_VCS}/what-we-will` },
        who_can_apply: { snippet: 'have had an income of £300,000 to £1.5 million in each year of your last 2 years of audited accounts - have been running for at least 5 years', confidence: 'high', source_url: `${SW_VCS}/who-can-apply` },
        open_status: { snippet: 'Applications open on Monday 5 October 2026. Applications close at 11.59pm on Thursday 25 October 2026.', confidence: 'high', source_url: `${SW_VCS}/how-apply` },
      } } },

  // ── Wandsworth and Lambeth ──────────────────────────────────────────────────
  { title: 'Sir Walter St John’s Educational Charity — Grants to Organisations', funder: 'Sir Walter St John’s Educational Charity', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: SWSJ, funding_index_url: 'https://swsjcharity.org.uk/how-to-apply/', url_status: 'unchecked',
    location_tag: 'Wandsworth, Lambeth', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-12-01', is_rolling: false,
    // No max_org_income: the £150k line is "usually" and only for the £5k strand.
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['education', 'young_people'], target_beneficiaries: ['children', 'young_people', 'people_in_poverty', 'refugees_migrants', 'disabled_people'],
    niche_tags: [],
    description: 'Grants from Sir Walter St John’s Educational Charity, a Battersea charity, for education and training of children and young people under 25 in Wandsworth and Lambeth who are in financial need, with preference for Battersea. Small education grants of up to £1,500 go to local community and voluntary organisations for educational activities and projects, prioritising children in areas of social disadvantage, refugee and asylum-seeking children, disabled children, and looked-after children and care leavers. Small organisations (usually with funds under £150,000) can also be supported with grants of £5,000 (occasionally up to £10,000 by invitation) for start-up running costs, educational equipment and organisational development. The strategic grants strand is closed. Next deadline: Tuesday 1 December 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Wandsworth, Lambeth', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Local community and voluntary organisations and registered charities working with children and young people under 25 in Wandsworth and Lambeth; for the £5,000 grants, usually organisations with funds under £150,000.',
      what_they_fund: 'Educational activities and projects with a clear educational purpose for children and young people in financial need, addressing local needs: start-up running costs for a new ongoing project, equipment for educational projects, costs that help the organisation grow, and time-limited projects.',
      typical_award: 'Small education grants up to £1,500; grants of £5,000 for small organisations (occasionally up to £10,000 by invitation).',
      exclusions: 'Work without a clear educational purpose; beneficiaries aged 25 or over or outside Wandsworth and Lambeth. The strategic grants strand is closed.',
      priorities: 'Battersea; children living in areas of social disadvantage; refugee and asylum-seeking children and young people; disabled children and young people; looked-after children and care leavers.',
      geographic_focus: 'London Boroughs of Wandsworth and Lambeth, with preference for Battersea.',
      decision_timeline: 'Next grant deadline Tuesday 1 December 2026.',
      how_to_apply: 'Download the grant criteria and application form from the How to apply page and email the completed application with supporting information to the Charity’s Manager (manager@swsjcharity.org.uk).',
      _citations: {
        typical_award: { snippet: 'Small education grants of up to £1,500 are available for local community and voluntary organisations for educational activities and projects.', confidence: 'high', source_url: SWSJ },
        who_can_apply: { snippet: 'Your organisation can be a voluntary or community organisation and/or a registered charity (usually with funds of under £150k.)', confidence: 'med', source_url: SWSJ },
        open_status: { snippet: 'Future grant deadlines are as follows: Tuesday 1st December', confidence: 'high', source_url: SWSJ },
      } } },

  // ── Tower Hamlets ───────────────────────────────────────────────────────────
  // EECF lists every Tower Hamlets fund it runs on one borough page; three held
  // rows already point there (0d2f1c04, 3ec8bf99, f5eeeea8), all off.
  { title: 'Wakefield Tetley Small Grants Fund 2026 (Tower Hamlets)', funder: 'Wakefield and Tetley Trust, managed by East End Community Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'project', 'core_costs'],
    apply_url: EECF_TH, shares_url_with: 'EECF Tower Hamlets page, which lists every Tower Hamlets fund it runs (0d2f1c04, 3ec8bf99, f5eeeea8)', url_status: 'unchecked',
    location_tag: 'Tower Hamlets', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-10-01', is_rolling: false,
    max_org_income: 250000,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated'],
    impact_sectors: ['community', 'mental_health', 'disability'], target_beneficiaries: ['people_in_poverty', 'carers', 'disabled_people', 'ethnic_minorities', 'refugees_migrants', 'mental_health'],
    niche_tags: ['social_isolation'],
    description: 'Grants of up to £5,000 from the Wakefield and Tetley Trust, run by East End Community Foundation, for small charities and community groups based in and operating in Tower Hamlets that support marginalised or disadvantaged people: carers, disabled people, children with additional needs, Black, Asian and minority ethnic communities, refugees and people with no recourse to public funds, people in insecure work, families affected by domestic abuse, people with poor mental health and people living alone. Project or core costs, including salaries and rent, for up to a year. Registered charities and community groups with income of £250,000 or less; those under £100,000 are prioritised. CICs cannot apply. £50,000 in total. Closes at midday on Thursday 1 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Tower Hamlets', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities and community groups based in and operating within Tower Hamlets with annual income of £250,000 or less; groups with income up to £100,000 are prioritised. Grassroots groups, tenants’ and residents’ associations and self-help groups are particularly encouraged. Community Interest Companies cannot apply.',
      what_they_fund: 'Project costs, time-limited activities, and core costs including staff salaries, rent and running costs, for work with people who are marginalised or disadvantaged: carers, disabled people, children with additional needs, Black, Asian and minority ethnic communities, refugees, people with no recourse to public funds, people in manual or insecure work, families affected by domestic abuse, people with poor mental health, and isolated people living alone.',
      typical_award: 'Up to £5,000 for projects lasting up to one year, from a £50,000 fund.',
      exclusions: 'CICs; individuals; work already done; organisations with an unexpired grant from the fund; significant unrestricted reserves or serious deficit; promoting religion; animal charities; environmental improvements; building restoration or conservation; uniformed youth groups; projects with schools or vocational training.',
      priorities: 'Groups with income up to £100,000. For core funding: registered charities of three years or more, modest reserves, no paid fundraisers, effective use of volunteers, and over 70% of work in Tower Hamlets.',
      geographic_focus: 'London Borough of Tower Hamlets.',
      decision_timeline: 'Opened 2 September 2026; closes 12pm on Thursday 1 October 2026. Outcomes in early December 2026; payments December 2026 to January 2027.',
      how_to_apply: 'Read the Autumn 2026 guidelines linked from the EECF Tower Hamlets page and apply through the online application form linked there. Help from grants@eastendcf.org or 020 7345 4444.',
      _citations: {
        typical_award: { snippet: 'A fund of £50,000 is available, with grants of up to £5,000 for projects and activities.', confidence: 'high', source_url: EECF_TH },
        who_can_apply: { snippet: 'Applications will be accepted from registered charities and community groups with annual incomes of £250,000 or less.', confidence: 'high', source_url: WTT_GUIDE },
        exclusions: { snippet: 'Please note that we CANNOT fund CIC’s through this programme.', confidence: 'high', source_url: WTT_GUIDE },
        open_status: { snippet: 'The deadline for applications is 12 pm (midday) on Thursday 1st October 2026.', confidence: 'high', source_url: EECF_TH },
      } } },

  { title: 'Aldgate & Allhallows Foundation — Grants for Schools and Organisations', funder: 'The Aldgate and Allhallows Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'multi_year'],
    apply_url: AAF_ORG, url_status: 'unchecked',
    location_tag: 'Tower Hamlets, City of London', is_local: true, amount_min: null, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['education', 'young_people'], target_beneficiaries: ['young_people', 'children', 'people_in_poverty'],
    niche_tags: ['literacy_numeracy', 'stem'],
    description: 'An education charity founded in the City of London that funds clearly defined, time-limited education projects from schools and organisations benefiting children and young people under 30 who live permanently in Tower Hamlets or the City of London, are in full-time education or studying for a recognised qualification, and come from disadvantaged backgrounds or areas of high deprivation. Keen on projects that enhance the National Curriculum, improve literacy and numeracy, promote science, maths and the arts, attract match funding or test new ideas. Grants can run up to three years. No closing date: applications are taken all year through an online form, with decisions by governors meeting in May and September. No award range is published; 2024 grants to organisations totalled £192,265.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Tower Hamlets, City of London', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Schools and organisations running education projects for children or young people under 30 who are permanent residents of Tower Hamlets or the City of London, in full-time education or studying for a recognised qualification, and from disadvantaged backgrounds or areas of high deprivation there. The form asks for legal status and charitable aims.',
      what_they_fund: 'Clearly defined, time-limited education projects, especially those enhancing the National Curriculum, improving literacy and numeracy, promoting science, mathematics and the arts, attracting match funding, or testing new ideas. Priority for work that is not yet part of regular activity and is strategic, addressing root causes or influencing wider policy and practice.',
      typical_award: 'No per-applicant figure is published. Grants can run for up to three years.',
      exclusions: 'Equipment or teachers’ salaries that are the education authority’s responsibility; supplementary schools or mother tongue teaching; buying, repairing or furnishing buildings; stage, film, publication or video production; performances or exhibitions; retrospective requests; replacing statutory funding; general appeals.',
      geographic_focus: 'London Borough of Tower Hamlets and the City of London.',
      decision_timeline: 'Rolling, with no closing date. Governors meet twice a year, in May and September; applications need to arrive in good time for assessment, including a meeting with the Grants Manager.',
      how_to_apply: 'Complete the online application form linked from the grants for schools and organisations page; initial enquiries are considered by the Chief Executive.',
      _citations: {
        who_can_apply: { snippet: 'permanent residents of London Borough of Tower Hamlets or the City of London - in full-time education or studying for a recognised qualification', confidence: 'high', source_url: AAF_ORG },
        open_status: { snippet: 'Applications can be submitted throughout the year. There is no closing date', confidence: 'high', source_url: AAF_ORG },
        exclusions: { snippet: 'the purchase, repair or furnishing of buildings - stage, film, publication or video production costs - performances or exhibitions', confidence: 'high', source_url: AAF_ORG },
      } } },

  // ── City of London ──────────────────────────────────────────────────────────
  { title: 'City of London — Community Infrastructure Levy Neighbourhood Fund', funder: 'City of London Corporation', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital', 'project', 'multi_year'],
    apply_url: COL_CIL, url_status: 'unchecked',
    location_tag: 'City of London', is_local: true, amount_min: 10000, amount_max: 500000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community', 'environment', 'health', 'young_people'], target_beneficiaries: ['general_public', 'people_in_poverty', 'older_people', 'disabled_people', 'children', 'families'],
    niche_tags: ['place_based', 'accessibility', 'biodiversity'],
    description: 'The City of London Corporation’s Neighbourhood CIL fund: one-off or multi-year grants (up to five years) of £10,000 to £500,000 for activity within the Square Mile that directly benefits people living and working there. It funds revenue activity addressing the impact of development, equipment and digital services, access audits, and infrastructure such as building and open-space works, lighting, public art and street furniture, with up to three years of maintenance. Priorities include green space, disadvantaged and minoritised groups, older, disabled and LGBTQIA+ people, sport and health, children and families, accessibility, co-designed proposals, climate and biodiversity, and street cleanliness. Open to constituted voluntary and resident groups, business associations, CICs, charitable companies, CIOs and charitable community benefit societies. Rolling, with no deadline.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'City of London', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Constituted voluntary organisations and resident associations; constituted business organisations and associations; registered CICs; not-for-profit charitable companies; registered CIOs; exempt or excepted charities; charitable community benefit societies. All need at least three unrelated members on the governing body and a bank account with two unrelated signatories at different addresses.',
      what_they_fund: 'Activity within the City of London that directly benefits people living and working there: revenue activity addressing the impact of development, equipment and digital services, access audits, and infrastructure including building and open-space works, lighting, public art and street furniture, plus up to three years of maintenance of funded infrastructure.',
      typical_award: '£10,000 minimum to £500,000 maximum; one-off or multi-year for up to five years.',
      exclusions: 'Grants under £10,000 or over £500,000; projects outside the City or without direct benefit to City residents and workers or City-based support; work already done; organisations holding an active CIL Neighbourhood Fund grant; governing bodies with fewer than three unrelated members.',
      priorities: 'Green space; disadvantaged, minoritised, older, disabled and LGBTQIA+ people and those in poverty; sport, exercise, walking and cycling; children, young people and families; accessibility; co-designed proposals; climate and biodiversity; street cleanliness.',
      geographic_focus: 'City of London (the Square Mile).',
      decision_timeline: 'Rolling, no deadlines. Requests under £100,000 are decided by officers, normally within 12 weeks; £100,000 and over by the Resource Allocation Sub-Committee, normally within six months.',
      how_to_apply: 'Start an online application from the CIL Neighbourhood Fund Information & Apply page on the City Corporation grants portal.',
      _citations: {
        typical_award: { snippet: 'The minimum grant for projects or infrastructure that an organisation can apply for is £10,000 and the maximum grant is £500,000.', confidence: 'high', source_url: COL_CIL },
        open_status: { snippet: 'Online applications can be submitted at any time, there are no deadlines.', confidence: 'high', source_url: COL_CIL },
        who_can_apply: { snippet: 'Constituted voluntary organisations and resident associations. - Constituted business organisations and associations. - Registered community interest companies (CIC).', confidence: 'high', source_url: COL_CIL },
      } } },

  // ── Hackney ─────────────────────────────────────────────────────────────────
  { title: 'Hackney Parochial Charities — Project Grants for Organisations', funder: 'Hackney Parochial Charities', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: HPC_HOW, url_status: 'unchecked',
    location_tag: 'Hackney', is_local: true, amount_min: null, amount_max: null, deadline: '2026-10-18', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'older_people', 'young_people', 'education'], target_beneficiaries: ['people_in_poverty', 'older_people', 'young_people', 'refugees_migrants', 'families'],
    niche_tags: ['social_isolation'],
    description: 'Project grants from Hackney Parochial Charities, endowed charities dating from 1603, for organisations working to relieve hardship and poverty and advance life chances for people living within the ancient parish area of benefit in Hackney. Priorities: socially isolated older people, individuals and families with no recourse to public funds, advice and support organisations, and services for young people. Schools as institutions, statutory work, umbrella bodies, environmental conservation, campaigning and running costs such as rent and bills are excluded. The area of benefit does not cover all of Hackney: Woodberry Down, Brownswood, western Stamford Hill West, Clissold, western Stoke Newington, Haggerston, Hoxton and Shoreditch are outside it. Trustees meet twice a year; the next project deadline is 18 October 2026. No award range is published.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Hackney', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations based in the parish or surrounding parishes, including youth groups, pensioner groups, religious groups, other charities, community support groups and nursing organisations, that can prove the work is specifically for people living or based within the area of benefit. Organisations need charitable aims; companies limited by shares and commercial companies are excluded.',
      what_they_fund: 'Projects that relieve poverty, advance people in life, are educational in the broadest sense, or provide services and opportunities to people within the area of benefit, including organised breaks for families and children. Current priorities: socially isolated elderly people; individuals and families with no recourse to public funds; advice and support organisations; support services for young people.',
      typical_award: 'No per-organisation figure is published.',
      exclusions: 'General appeals; local authorities or statutory work; schools, colleges or universities; umbrella, second-tier or grant-making bodies; hospice running costs; feasibility studies; professional training; organisations without charitable aims; overseas trips; heritage (unless educational); environmental conservation; social research; campaigning or awareness raising; website projects; IT equipment; debt; daily living costs, rent or utility bills; retrospective grants.',
      geographic_focus: 'The Hackney Parochial Charities area of benefit, following the ancient parish boundaries in the London Borough of Hackney. Woodberry Down, Brownswood, the western half of Stamford Hill West, Clissold, the western half of Stoke Newington, Haggerston, Hoxton West, Hoxton East and Shoreditch are outside it.',
      decision_timeline: 'Trustees meet twice a year. Project applications can be submitted at any time and go to the next meeting; the 2026 project deadlines are 18 April and 18 October.',
      how_to_apply: 'Complete the online Project Application Form from the How to apply page, endorsed by two independent referees (one letter on the referee organisation’s headed paper), with the latest annual report and accounts and a detailed project budget.',
      _citations: {
        what_they_fund: { snippet: 'Socially isolated elderly Individuals and families with no recourse to public funds Advice and support organisations Support service to young people', confidence: 'high', source_url: HPC_HOW },
        open_status: { snippet: 'Project Applications 18th April 2026 18th October 2026', confidence: 'high', source_url: HPC_DL },
        exclusions: { snippet: 'Organisations that do not have charitable aims (such as companies limited by shares and commercial companies)', confidence: 'high', source_url: 'https://hackneyparochialcharities.org.uk/eligibility-check/exclusions/' },
      } } },

  { title: 'South Hackney Parochial Charity — Grants to Organisations', funder: 'South Hackney Parochial Charity', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: SHPC, funding_index_url: HPC_HOW, url_status: 'unchecked',
    location_tag: 'Hackney', is_local: true, amount_min: null, amount_max: null, deadline: '2026-10-03', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'education'], target_beneficiaries: ['people_in_poverty', 'general_public'],
    niche_tags: [],
    description: 'Grants to organisations from South Hackney Parochial Charity, set up by trust deed in 1900, for the relief of need and the promotion of education in the Parish of South Hackney. Trustees meet four times a year; the remaining 2026 deadline for project applications is 3 October. The area of benefit follows the ancient parish boundaries rather than the whole borough. Applications use the shared Hackney Parochial Charities project form. No award range is published.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Hackney', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations working for people within the Parish of South Hackney area of benefit (see the charity’s map). Individuals apply separately through a supporting agency.',
      what_they_fund: 'The relief of need and the promotion of education in the Parish of South Hackney.',
      typical_award: 'No per-organisation figure is published.',
      exclusions: 'Anything covered by regular state financial support; higher education grants; grants to people living outside the area; retrospective grants.',
      geographic_focus: 'The Parish of South Hackney, London Borough of Hackney, as shown on the charity’s map; not the whole borough.',
      decision_timeline: 'Trustees meet four times a year. 2026 deadlines for project and individual applications: 3 January, 5 April, 1 August and 3 October.',
      how_to_apply: 'Apply with the Project Application Form on the Hackney Parochial Charities How to apply page, selecting South Hackney Parochial Charity.',
      _citations: {
        what_they_fund: { snippet: 'The charity’s main objective is the relief of need and promotion of education in the Parish of South Hackney', confidence: 'high', source_url: SHPC },
        open_status: { snippet: 'South Hackney Parochial Charity Project Applications and Individual Applications 3rd January 2026 5th April 2026 1st August 2026 3rd October 2026', confidence: 'high', source_url: HPC_DL },
      } } },

  // ── Islington ───────────────────────────────────────────────────────────────
  // Ward budgets, but £13,000 a ward with a published process and three dated
  // rounds a year; the 22 September round has just closed, so anything sent now
  // goes to the 21 January 2027 round.
  { title: 'Islington Council — Local Initiatives Fund', funder: 'Islington Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: ISL_LIF, url_status: 'unchecked',
    location_tag: 'Islington', is_local: true, amount_min: 350, amount_max: null, deadline: '2027-01-21', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Islington Council’s ward-level small grants: each of the 17 wards has £13,000 a year for projects and events that benefit its residents, decided by the ward councillors. 171 projects shared £230,555 in 2025-26, an average of about £1,350; the minimum award is £350. Applicants must be constituted and Islington-based (an unconstituted group can apply through a host group), at least 75% of beneficiaries should be Islington residents, staff must be paid the London Living Wage, and projects should start three to four months after the deadline. Three rounds a year: the 22 September 2026 round has closed, so applications now go to the round closing on 21 January 2027. Talk to the ward councillors before applying.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Islington', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Constituted, Islington-based community groups and voluntary and community sector organisations that meet the council’s minimum requirements. Individuals and unconstituted groups cannot hold a grant but can apply through a constituted Islington group that holds it for them. At least 75% of beneficiaries should be Islington residents. Staff funded by the grant must be paid at least the London Living Wage.',
      what_they_fund: 'Locally run projects, activities, events and local improvements that benefit the residents of a ward, including festivals and street parties (with the right permissions). Ward councillors decide.',
      typical_award: 'Minimum £350 (and at least £50 per ward when applying to several). No maximum is published; the 2025-26 average was about £1,350. Each ward has £13,000 a year.',
      exclusions: 'Alcohol; unconstituted applicants without a host group; organisations with outstanding monitoring from a previous award.',
      geographic_focus: 'London Borough of Islington, by ward.',
      decision_timeline: 'Three deadlines a year: 28 May 2026, 22 September 2026 and 21 January 2027, with decisions two to three months later. Late applications roll into the next round. Funding must be spent within 12 months of the award.',
      how_to_apply: 'Contact the ward councillors first, then request the application form from LocalInitiativesFund@islington.gov.uk and return it by a deadline.',
      _citations: {
        open_status: { snippet: 'If your organisation submits an application form after any of the dates above, it will be considered in the next round of applications.', confidence: 'high', source_url: ISL_LIF },
        typical_award: { snippet: 'The minimum grant award is £350 and a minimum of £50 per ward should be requested by organisations submitting proposals to more than one ward.', confidence: 'high', source_url: `${ISL_LIF}/local-initiatives-fund-application-guidance` },
        who_can_apply: { snippet: 'We cannot give grants to unconstituted groups, so if you are applying as an individual or unconstituted group, you may need a community group to hold the grant for you.', confidence: 'high', source_url: `${ISL_LIF}/local-initiatives-fund-application-guidance` },
        decision_timeline: { snippet: 'Thursday 21 January 2027 : Final decisions communicated to applicants by early April 2027.', confidence: 'high', source_url: ISL_LIF },
      } } },

  // ── Camden ──────────────────────────────────────────────────────────────────
  // camden.gov.uk sits behind a Cloudflare challenge; read through the reader
  // proxy. The Handy Guide PDF was not readable, so eligibility here is the page's.
  { title: 'Camden Council — Organisational Development Fund', funder: 'Camden Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'capacity'],
    apply_url: CAM_VCS, url_status: 'unchecked',
    location_tag: 'Camden', is_local: true, amount_min: null, amount_max: 10000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['general_public'],
    niche_tags: [],
    description: 'Grants of up to £10,000 from Camden Council, part of its 2024 to 2031 voluntary and community sector investment programme, to help Camden VCS organisations become more resilient, sustainable and adaptable. Applications must address at least one of two aims: sustainability (addressing key risks, stabilising in the short term and building long-term viability) or adaptability (adapting and innovating in response to internal and external pressures). Rolling, with no deadline since it opened on 9 March 2026; applications go to a monthly panel at the start of each month. Apply through Plinth after reading the fund’s Handy Guide.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Camden', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary and community sector organisations in Camden. The fund’s Handy Guide sets the minimum requirements; read it before applying.',
      what_they_fund: 'Organisational development that makes a VCS organisation more resilient, sustainable and adaptable: addressing key risks and stabilising in the short term on a path to long-term viability, or adapting and innovating in response to internal and external changes and pressures.',
      typical_award: 'Up to £10,000.',
      exclusions: 'Not stated on the council page; see the Handy Guide.',
      geographic_focus: 'London Borough of Camden.',
      decision_timeline: 'Rolling since 9 March 2026 with no deadline. Applications are reviewed at a monthly panel held at the start of each month.',
      how_to_apply: 'Read the Organisational Development Fund Handy Guide, then register on Plinth and apply through the link on the council’s VCS page. Questions to vcs@camden.gov.uk.',
      _citations: {
        open_status: { snippet: 'There is no deadline for applications, the fund welcomes applications on a rolling basis. These will be reviewed during a monthly panel, held at the start of each month.', confidence: 'high', source_url: CAM_VCS },
        typical_award: { snippet: 'Grants of up to £10,000 are available.', confidence: 'high', source_url: CAM_VCS },
        what_they_fund: { snippet: 'Sustainability: To help VCS organisations address key risks – stabilising in the short term and putting them on a path to viability in the long term', confidence: 'high', source_url: CAM_VCS },
      } } },

  { title: 'Camden Council — Love Culture Fund (Round 3)', funder: 'Camden Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: CAM_LOVE, url_status: 'unchecked',
    location_tag: 'Camden', is_local: true, amount_min: 2000, amount_max: 2000, deadline: '2026-11-02', is_rolling: false,
    next_open_date: '2026-10-05', max_org_income: 50000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated', 'individual', 'sole_trader'],
    impact_sectors: ['creative', 'community', 'heritage'], target_beneficiaries: ['general_public'],
    niche_tags: ['visual_arts', 'theatre', 'film_media'],
    description: 'Camden Council micro-grants of £2,000 for participatory arts and culture projects that benefit Camden residents: exhibitions, talks, workshops, clubs, courses, public art and performances, including work that widens access to culture, supports health and wellbeing, or tells Camden’s hidden histories. Open to individuals, community groups and registered organisations based in Camden with turnover under £50,000; schools cannot lead. Six rounds over two years with five grants per round. Round 3 opens on Monday 5 October and closes on Monday 2 November 2026. No match funding needed; capital works are not funded and projects must finish by March 2028.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Camden', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Individuals, community groups and registered organisations based in Camden. Organisations must have annual turnover under £50,000. Schools cannot be the lead applicant. Partnerships are fine if the partner is also based in Camden.',
      what_they_fund: 'Projects with a strong creative, cultural or arts element and participatory elements that engage Camden communities: exhibitions, talks, workshops, clubs, courses, public art and performances across visual, performing, digital and literary arts, film and theatre.',
      typical_award: '£2,000, the amount every application is expected to request. Five grants per round.',
      exclusions: 'Organisations with turnover over £50,000; schools as lead applicant; anyone not based in Camden; projects already started or finishing after March 2028; capital works such as building or equipment upgrades.',
      geographic_focus: 'London Borough of Camden.',
      decision_timeline: 'Six rounds over two years. Round 3 opens Monday 5 October 2026 and closes Monday 2 November 2026.',
      how_to_apply: 'Apply in the round window from the Love Culture Fund page; written, audio or video applications are accepted. Attend an information session or contact culture@camden.gov.uk first.',
      _citations: {
        open_status: { snippet: 'Round 3 opens on Monday 5 October 2026 , and you’ll have until Monday 2 November 2026 to submit your application.', confidence: 'high', source_url: CAM_LOVE },
        typical_award: { snippet: 'You can apply for £2,000 — this is the maximum amount and the amount we expect all applications to request.', confidence: 'high', source_url: CAM_LOVE },
        who_can_apply: { snippet: 'You can apply as an individual, a community group or a registered organisation. If you’re applying as an organisation, your annual turnover must be under £50,000.', confidence: 'high', source_url: CAM_LOVE },
      } } },

  // camdengiving.org.uk (Squarespace) read through the reader proxy. The index
  // page says 17 October; the fund's own page says Thursday 15 October, used here.
  { title: 'Camden Giving — The Equality Fund 2026', funder: 'Camden Giving', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'multi_year'],
    apply_url: CG_EQ, url_status: 'unchecked',
    location_tag: 'Camden', is_local: true, amount_min: 30000, amount_max: 30000, deadline: '2026-10-15', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    impact_sectors: ['community', 'housing', 'education', 'disability'], target_beneficiaries: ['ethnic_minorities', 'disabled_people'],
    niche_tags: ['advocacy', 'campaigning'],
    description: 'Camden Giving’s flagship fund and its only unrestricted one: two-year grants of £30,000 in total for Camden-based small charities and social enterprises tackling inequalities that Camden residents face because of race and/or disability. This round funds only organisations whose primary focus is addressing poor outcomes of the housing or education systems for people from the global majority and/or disabled people, through advocacy, mentoring, campaigning or creating third spaces. About eight grants, decided by a panel of ten Camden residents with lived experience of racism and/or ableism. Applications close at midday on Thursday 15 October 2026 and can be made in any language; outcomes by 16 November. Talk to the grants team first.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Camden', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Camden-based small charities and social enterprises whose primary focus is addressing poor outcomes of the housing or education systems for people from the global majority and/or disabled people. Organisations with an active Equality Fund grant or overdue reporting cannot apply.',
      what_they_fund: 'Unrestricted funding for organisations tackling the housing or education systems through advocacy, mentoring, campaigning or creating third spaces, to address inequality experienced by Camden residents due to race and/or disability.',
      typical_award: '£30,000 in total over two years; about eight grants this round.',
      exclusions: 'Organisations whose primary focus falls outside the housing or education systems for global majority and/or disabled people; current Equality Fund grantees; organisations with overdue reporting.',
      geographic_focus: 'London Borough of Camden.',
      decision_timeline: 'Closes at midday on Thursday 15 October 2026; applicants hear by 16 November 2026.',
      how_to_apply: 'Contact grants@camdengiving.org.uk to talk through the criteria, then apply through the button on the Equality Fund 2026 page, in any language.',
      _citations: {
        typical_award: { snippet: 'these two-year grants of £30,000 (in total) to organisations will decided by a panel of residents with lived experience', confidence: 'high', source_url: CG_EQ },
        who_can_apply: { snippet: 'We will only fund organisations whose primary focus is one or more of the following criteria: Organisations that address poor outcomes of the housing or education systems on people from the global majority and/ or people with disabilities.', confidence: 'high', source_url: CG_EQ },
        open_status: { snippet: 'Applications close on Thursday 15th October 2026 at 12:00 PM (Midday).', confidence: 'high', source_url: CG_EQ },
      } } },

  // ── Westminster ─────────────────────────────────────────────────────────────
  // Each of the five Harvist boroughs runs its own share with its own process;
  // the held row a2744303 is Brent's (archived). This is Westminster's.
  { title: 'Edward Harvist Trust — Westminster Grants', funder: 'Edward Harvist Trust (administered by Westminster City Council)', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant', 'core_costs'],
    apply_url: WM_EHT, url_status: 'unchecked',
    location_tag: 'Westminster', is_local: true, amount_min: null, amount_max: 3000, deadline: '2026-10-31', is_rolling: false,
    next_open_date: '2026-10-01',
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['community', 'older_people', 'health', 'education'], target_beneficiaries: ['older_people', 'people_in_poverty', 'general_public'],
    niche_tags: [],
    description: 'Small grants from the Edward Harvist Trust’s Westminster share, run by Westminster City Council, for registered not-for-profit organisations improving the quality of life of local people: relief of elderly and disadvantaged residents, relief of distress and sickness, recreation and leisure facilities, and educational facilities. Projects or running costs (equipment, staff, rent, utilities) can be funded. Two rounds a year with £20,000 to £30,000 each, so grants are unlikely to exceed £2,000 to £3,000. The October round opens on 1 October and closes on 31 October 2026, with announcements around 15 December. One grant per organisation per year; online form only.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Westminster', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Registered not-for-profit organisations working in the City of Westminster. Grants go to organisations, not individuals. Statutory bodies only for provision beyond their statutory duty. One successful grant per organisation per year.',
      what_they_fund: 'Projects or running costs, including equipment, staff fees, rent and utilities, that serve the Trust’s objects: relief of elderly and disadvantaged residents; relief of distress and sickness; recreation and leisure facilities that improve quality of life; educational facilities.',
      typical_award: 'Likely no more than £2,000 to £3,000; each round has about £20,000 to £30,000 in total.',
      exclusions: 'Individuals; statutory responsibilities; organisations funded by the Trust within the last year.',
      geographic_focus: 'City of Westminster (the Westminster share of the Edward Harvist Trust).',
      decision_timeline: 'Opens 1 October and closes 31 October 2026; assessment in November; announcements around 15 December. Rounds open every April and October.',
      how_to_apply: 'Apply through the online application form linked from the council’s Edward Harvist Trust page.',
      _citations: {
        open_status: { snippet: 'The fund opens for applications every April and October.', confidence: 'high', source_url: WM_EHT },
        typical_award: { snippet: 'applicants are likely to receive a grant no larger than £2,000 to £3,000 and should submit applications with this in mind.', confidence: 'high', source_url: WM_EHT },
        who_can_apply: { snippet: 'Grants are made to organisations rather than individuals. These must be registered not-for-profit organisations.', confidence: 'high', source_url: WM_EHT },
      } } },

  { title: 'Westminster City Council — Community Events Fund', funder: 'Westminster City Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: WM_EVENTS, url_status: 'unchecked',
    location_tag: 'Westminster', is_local: true, amount_min: null, amount_max: 5000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'individual'],
    impact_sectors: ['community', 'creative'], target_beneficiaries: ['general_public', 'ethnic_minorities'],
    niche_tags: ['neighbourhood'],
    description: 'Westminster City Council grants of up to £2,500 per event, or up to £5,000 where organisations collaborate, to organise new single-day community events in the City of Westminster that celebrate culture, community cohesion and collective reflection. Events must be free to attend (and food free if fully funded) and inclusive. Registered charities and CICs can apply, and so can individuals linked to a registered Westminster group who live or work in the city where no suitable organisation can be found. Past awards ranged from £500 to about £3,000 across the wards. Listed as open for applications.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Westminster', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities and CICs with sound governance and accountability structures. Individuals affiliated to a registered group in Westminster, who live or work there and volunteer to help others, can apply where no suitable organisation can be found.',
      what_they_fund: 'New single-day events in Westminster of cultural significance or that promote community cohesion and integration, including venue booking and associated event costs.',
      typical_award: 'Up to £2,500 per event, or up to £5,000 for a collaboration between organisations.',
      exclusions: 'Series of events; events that charge entry; events that could be perceived as non-inclusive.',
      geographic_focus: 'City of Westminster.',
      decision_timeline: 'Listed as open for applications on the council’s funding page; no deadline stated.',
      how_to_apply: 'Apply through the Community Events Fund page on the Westminster City Council website.',
      _citations: {
        typical_award: { snippet: 'For each event, a maximum of £2,500 will be made available, or for collaboration between organisations grants of up to £5,000 will be available.', confidence: 'high', source_url: WM_EVENTS },
        who_can_apply: { snippet: 'registered charities and CICs with sound governance and accountability structures', confidence: 'high', source_url: WM_EVENTS },
        exclusions: { snippet: 'The event must be a single-day event, not a series of events. The event must be free for the community to enter and attend', confidence: 'high', source_url: WM_EVENTS },
        open_status: { snippet: 'Open for applications Community Events Fund', confidence: 'med', source_url: 'https://www.westminster.gov.uk/leisure-libraries-and-community/funding-and-grant-opportunities-westminster' },
      } } },

  { title: 'Paddington Charities — Grants for Organisations', funder: 'Paddington Welfare Charities and Paddington Charitable Estates Educational Fund (administered by Westminster City Council)', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: WM_PADD, url_status: 'unchecked',
    location_tag: 'Westminster', is_local: true, amount_min: null, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'health', 'disability', 'education'], target_beneficiaries: ['people_in_poverty', 'disabled_people', 'older_people'],
    niche_tags: [],
    description: 'The Paddington Charities, the Paddington Welfare Charities and the Paddington Charitable Estates Educational Fund, give grants to organisations working for residents of the former Metropolitan Borough of Paddington (W2, W9 and parts of NW8 and W10) who are in need, hardship or distress, or sick, disabled or infirm; the Educational Fund also helps with educational courses, training for a profession or trade, school clothes and educational holidays. Grants are not made in relief of public funds. Rolling: request a grant through the council’s community grant form and the team makes contact. No award range is published.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Westminster', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations that work to benefit residents of the former Metropolitan Borough of Paddington (W2, W9 and parts of NW8 and W10); individuals can also apply.',
      what_they_fund: 'Support for residents in need, hardship or distress, or who are sick, disabled or infirm (Welfare Charities); financial help for educational courses, a profession or trade, school clothes or educational holidays (Educational Fund).',
      typical_award: 'No per-organisation figure is published.',
      exclusions: 'Grants are not made in the relief of public funds. Beneficiaries must live in the former Metropolitan Borough of Paddington.',
      geographic_focus: 'Former Metropolitan Borough of Paddington in the City of Westminster: W2, W9 and parts of NW8 and W10.',
      decision_timeline: 'Rolling; funding is ongoing.',
      how_to_apply: 'Fill in the Westminster community grant request form linked from the Paddington Charities page; the team will make contact.',
      _citations: {
        who_can_apply: { snippet: 'The Paddington Welfare Charities gives grants to individuals, or to organisations that work to benefit residents, who are in need, hardship or distress, or who are sick, disabled or infirm.', confidence: 'high', source_url: WM_PADD },
        geographic_focus: { snippet: 'Those who benefit from funding from either charity must be living in the former Metropolitan Borough of Paddington (W2, W9 and parts of NW8 and W10).', confidence: 'high', source_url: WM_PADD },
      } } },

  // Ward budgets, but £46,000 a ward a year with a published online application.
  { title: 'Westminster City Council — Ward Budgets', funder: 'Westminster City Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: WM_WARD, url_status: 'unchecked',
    location_tag: 'Westminster', is_local: true, amount_min: null, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood', 'place_based'],
    description: 'Westminster ward councillors’ budgets for local issues and priorities: each ward starts with £46,000 a year, rolling over across the four-year electoral cycle. Community groups, charities and organisations that benefit Westminster residents can apply at any time through the council’s online form, at least two months before the project starts (three months for more than three wards or more than £10,000). Projects need a clear benefit for residents of the ward. A business bank account is required; funds are not paid to individuals. No per-project cap is published.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Westminster', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community groups, charities and organisations that benefit Westminster residents, with a business bank account (funds cannot go to individual accounts).',
      what_they_fund: 'Projects that address local issues and priorities and have a clear benefit for residents of the ward or wards applied to.',
      typical_award: 'No per-project figure is published. Each ward has an initial £46,000 a year; requests over £10,000 need three months’ notice.',
      exclusions: 'Payments to individual bank accounts; projects without a clear benefit to the ward’s residents.',
      geographic_focus: 'City of Westminster, ward by ward.',
      decision_timeline: 'Rolling. Apply at least two months before the project starts, or three months for more than three wards or more than £10,000.',
      how_to_apply: 'Complete the online ward budget application form (it cannot be saved part way), with project dates, a cost breakdown and the wards involved.',
      _citations: {
        who_can_apply: { snippet: 'We welcome applications from community groups, charities, and organisations that benefit Westminster residents.', confidence: 'high', source_url: WM_WARD },
        decision_timeline: { snippet: 'You need to apply at least two months before the intended start of your project (or three months if you are requesting funding for more than three wards or for more than £10,000).', confidence: 'high', source_url: WM_WARD },
        typical_award: { snippet: 'An initial budget of £46,000 per year is allocated to each ward, which rolls over each year across a four-year electoral cycle.', confidence: 'med', source_url: WM_WARD },
      } } },

  // ── Merton ──────────────────────────────────────────────────────────────────
  { title: 'Merton Council — Investing in Neighbourhoods Fund (Neighbourhood CIL) 2026', funder: 'Merton Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital', 'project'],
    apply_url: MER_NCIL, url_status: 'unchecked',
    location_tag: 'Merton', is_local: true, amount_min: null, amount_max: null, deadline: '2026-10-12', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community', 'environment'], target_beneficiaries: ['general_public'],
    niche_tags: ['place_based', 'neighbourhood'],
    description: 'Merton Council’s Civic Pride Investing in Neighbourhoods Fund, paid from the Neighbourhood Community Infrastructure Levy, for projects that address the demands new development such as housing places on Merton’s neighbourhoods: past awards funded school energy education, heritage installations, youth services, playground upgrades, park works, sustainable drainage, community gardens and allotments, from about £7,000 to £89,000. Organisations can bid for grants, and residents can propose projects for the council to deliver. Bids need the delivery organisation’s support, landowner approval and endorsement from at least one Merton councillor; previously funded projects must show match funding and a plan to reduce reliance on the council. Bidding window 7 September to 11.59pm on Monday 12 October 2026; decisions from March 2027 and funding no earlier than June 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Merton', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations bidding for grant funding, and any local resident with an idea that can be delivered by the council. Bids need the support of the delivering organisation or council service, approval of everyone with a legal interest in the land or asset, and an email or letter of endorsement from at least one Merton councillor (ward councillors for ward-specific projects).',
      what_they_fund: 'Projects, programmes and assets that address the demands new development places on Merton’s neighbourhoods, with public benefit.',
      typical_award: 'No per-bid figure is published. Past awards ranged from about £7,000 to £89,000.',
      exclusions: 'Projects unaffected by development with little benefit to it; projects serving only private interests or with little public benefit; bidders in legal or other disputes with the council. Previously council-funded projects must show value, other funding pursued, non-council funding and a long-term plan.',
      geographic_focus: 'London Borough of Merton.',
      decision_timeline: 'Bidding window 7 September to 11.59pm Monday 12 October 2026. Allocations recommended for Cabinet from March 2027; grant agreements no earlier than April 2027; funding available no earlier than June 2027.',
      how_to_apply: 'Work through the six steps on the Investing in Neighbourhoods Fund page and submit the application form in Step 6, with councillor endorsement attached.',
      _citations: {
        open_status: { snippet: 'The new bidding window opens on Monday 7 September 2026 and closes on Monday 12 October 2026.', confidence: 'high', source_url: MER_NCIL },
        who_can_apply: { snippet: 'The Investing in Neighbourhoods fund is open to organisations who can bid for grant funding and any local resident with an idea that can be delivered by the council.', confidence: 'high', source_url: MER_NCIL },
        exclusions: { snippet: 'You must get an email or letter of support (endorsement) from at least one Merton councillor.', confidence: 'high', source_url: MER_NCIL },
      } } },

  // ── Bexley ──────────────────────────────────────────────────────────────────
  { title: 'BVSC Grassroots Development Grant (Bexley)', funder: 'Bexley Voluntary Service Council, with the South East London VCSE Alliance and SEL ICB', funder_type: 'capacity_builder',
    funding_type: 'grant', funding_subtypes: ['capacity', 'small_grant'],
    apply_url: BEX_GDG, funding_index_url: 'https://www.bvsc.co.uk/funding', url_status: 'unchecked',
    location_tag: 'Bexley', is_local: true, amount_min: null, amount_max: 3000, deadline: '2026-10-19', is_rolling: false,
    max_org_income: 100000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'health', 'young_people', 'older_people'], target_beneficiaries: ['general_public', 'young_people', 'older_people', 'ethnic_minorities', 'disabled_people'],
    niche_tags: [],
    description: 'Development grants of up to £3,000 from Bexley Voluntary Service Council for grassroots voluntary, community and social enterprise groups in Bexley with income under £100,000, paired with three core training sessions (governance, developing a fundable project, and volunteer management) that applicants complete to access the grant. The money builds capacity: governance and leadership, organisational development, training, financial systems, evaluation, digital equipment and software, policies, communications and specialist support. About 12 grants from £36,000, funded by the South East London VCSE Alliance and ICB. Priority for groups working on long-term conditions, isolation and frailty, or children and young people with complex needs, and for young people, older people, Global Majority and migrant communities, people with SEND and North Bexley residents. Closes midday on 19 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Bexley', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary, community and social enterprise organisations based in or delivering services in the London Borough of Bexley with annual income below £100,000: registered charities, CICs, social enterprises, constituted community groups and informal community groups. Applicants take part in three core training sessions to access the grant.',
      what_they_fund: 'Organisational capacity: governance and leadership development, organisational development, training and skills, financial systems and sustainability planning, monitoring and evaluation, digital development and equipment or software, policies and quality standards, communications and community engagement, consultancy and specialist support.',
      typical_award: 'Up to £3,000 per organisation; up to £36,000 in total for about 12 organisations.',
      exclusions: 'Support already available through BVSC; existing staff salaries; debt repayment; activities already funded from another source.',
      priorities: 'Groups in the three ICB neighbourhood health areas or supporting ICB priority groups: multiple long-term conditions, isolation and frailty, children and young people with complex needs; young people, older people, Global Majority and migrant communities, people with SEND, North Bexley residents, and by-and-for organisations.',
      geographic_focus: 'London Borough of Bexley.',
      decision_timeline: 'Closes 12:00pm on 19 October 2026. An online information session runs on 8 October 2026.',
      how_to_apply: 'Read the guidance document linked from the BVSC resource page, then apply through the online form on the BVSC funding page. Help from sectorsupport@bvsc.co.uk.',
      _citations: {
        typical_award: { snippet: 'Eligible organisations may apply for grants of up to £3,000 having completed the development training programme', confidence: 'high', source_url: BEX_GDG_PDF },
        who_can_apply: { snippet: 'Be based in Bexley or deliver services within Bexley. • Have an annual income below £100,000.', confidence: 'high', source_url: BEX_GDG_PDF },
        open_status: { snippet: 'Closing Date: 19 October 2026 at 12:00pm (Midday)', confidence: 'high', source_url: 'https://www.bvsc.co.uk/funding' },
      } } },

  // ── Kingston upon Thames ────────────────────────────────────────────────────
  // One row for the four neighbourhood committees: identical rules, one pot each.
  { title: 'Kingston Council — Neighbourhood Community Grants', funder: 'Royal Borough of Kingston upon Thames', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: KIN_NCG, funding_index_url: 'https://www.kingston.gov.uk/leisure-and-community/community-grants', url_status: 'unchecked',
    location_tag: 'Kingston upon Thames', is_local: true, amount_min: null, amount_max: 3000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood', 'social_isolation'],
    description: 'Kingston Council grants of up to £3,000 for projects, activities, services and events that benefit communities in one of the borough’s four neighbourhoods: Kingston and North Kingston, New and Old Malden, Surbiton, and South of the Borough. Each neighbourhood has £20,000 a financial year, awarded through the year until it runs out; decisions are made by the Neighbourhood Committee at meetings roughly every two months (next on 10 November 2026, then 14 January 2027). For not-for-profit, voluntary and community organisations and faith groups. Start-up, pilot and one-off projects, venue hire, equipment and project staffing can be covered; priority for work meeting the needs of marginalised or isolated people. One application per group per year.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kingston upon Thames', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Not-for-profit organisations, voluntary or community sector organisations, and faith groups (for community work not primarily religious), with a constitution and a group bank account. One application per group per year.',
      what_they_fund: 'Projects, activities, services and events benefiting a Kingston neighbourhood: start-up, pump-priming, developmental or pilot activity, one-off projects completed within 12 months, venue hire, equipment, and staffing on the specific project; community events. Priority for work meeting the needs of marginalised or isolated people and for the local Neighbourhood Community Plan priorities.',
      typical_award: 'Up to £3,000 per application. Each neighbourhood has £20,000 a financial year.',
      exclusions: 'Applications on behalf of individuals or commercial organisations; repeat applications for the same activity (unless strong community benefit and evidence of other fundraising); promoting religion or belief; anything tied to a pending planning or licensing application; projects creating ongoing running costs for the council.',
      geographic_focus: 'Royal Borough of Kingston upon Thames, by neighbourhood: Kingston and North Kingston, New and Old Malden, Surbiton, South of the Borough.',
      decision_timeline: 'Rolling through the financial year while funds last. Kingston and North Kingston committee dates: 15 September and 10 November 2026, 14 January, 9 March and 27 April 2027; outcomes within 10 working days of the meeting.',
      how_to_apply: 'Choose the neighbourhood page linked from the council’s Neighbourhood Community Grants page and complete the online form on Kingston Let’s Talk, uploading the constitution, a recent bank statement and a project budget. Questions to grants@kingston.gov.uk.',
      _citations: {
        typical_award: { snippet: 'Neighbourhood Community Grants of up to £3,000 per application, are available to fund projects/ activities/ services to benefit communities in each of the four neighbourhood areas.', confidence: 'high', source_url: KIN_NCG },
        open_status: { snippet: 'Applications can be submitted throughout the year, rather than groups needing to apply by a specific deadline.', confidence: 'high', source_url: 'https://www.kingston.gov.uk/leisure-and-community/community-grants' },
        who_can_apply: { snippet: 'not-for-profit organisations - voluntary or community sector organisations - faith groups', confidence: 'high', source_url: 'https://www.kingstonletstalk.co.uk/communities-and-neighbourhoods/neighbourhood-community-grants-kingston-and-north/' },
      } } },

  // ── Hammersmith and Fulham ──────────────────────────────────────────────────
  // lbhf.gov.uk returns an empty 202 to curl; read through the reader proxy. The
  // page says the window closes "31 November"; staged as 30 November.
  { title: 'Hammersmith & Fulham Council — Small Grants Programme', funder: 'Hammersmith & Fulham Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: HF_SG, url_status: 'unchecked',
    location_tag: 'Hammersmith and Fulham', is_local: true, amount_min: 100, amount_max: 10000, deadline: '2026-11-30', is_rolling: false,
    next_open_date: '2026-10-01',
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Small grants of £100 to £10,000 from Hammersmith & Fulham Council’s Third Sector Investment Programme for local voluntary and community sector organisations delivering activities, services and projects that benefit H&F residents, with priority for groups the council does not already fund. Two windows: 1 October to the end of November 2026, and 1 January to 15 February 2027. Organisations serving refugees and asylum seekers can apply on the same form for the separate Supporting Vulnerable Communities Grant. Successful groups register on H&F Community Compass. Sobus offers help to new organisations.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Hammersmith and Fulham', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Local voluntary and community sector organisations delivering activities, services and projects that benefit residents of Hammersmith & Fulham. The council aims to reach the widest range of community groups, especially those it does not currently fund.',
      what_they_fund: 'Activities, services and projects that benefit H&F residents, as set out in the small grant application pack.',
      typical_award: '£100 to £10,000.',
      exclusions: 'Not stated on the landing page; see the small grant application pack.',
      geographic_focus: 'London Borough of Hammersmith & Fulham.',
      decision_timeline: 'Open 1 October to the end of November 2026 (the page says 31 November), then 1 January to 15 February 2027.',
      how_to_apply: 'Download the small grant application pack from the council page and apply through the council’s online form. Sobus can help new organisations.',
      _citations: {
        open_status: { snippet: 'The scheme will be open for applications between the periods of 1 October to 31 November 2026, and 1 January to 15 February 2027.', confidence: 'high', source_url: HF_SG },
        typical_award: { snippet: 'Small grants provide funding between £100-£10,000 to local Voluntary and Community Sector Organisations delivering activities, services and projects that benefit the residents of Hammersmith & Fulham.', confidence: 'high', source_url: HF_SG },
      } } },

  { title: 'Hammersmith & Fulham Council — Supporting Vulnerable Communities Grant (refugees and asylum seekers)', funder: 'Hammersmith & Fulham Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: HF_SG, shares_url_with: 'the H&F Small Grants Programme row in this batch (one page, one form)', url_status: 'unchecked',
    location_tag: 'Hammersmith and Fulham', is_local: true, amount_min: 1000, amount_max: 20000, deadline: '2026-11-30', is_rolling: false,
    next_open_date: '2026-10-01',
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['community', 'justice'], target_beneficiaries: ['refugees_migrants'],
    niche_tags: ['refugee_rights'],
    description: 'Grants of £1,000 to £20,000 from Hammersmith & Fulham Council for voluntary and community organisations delivering services specifically for refugees and asylum seekers in the borough, run alongside the council’s Small Grants Programme on the same online form. Windows: 1 October to the end of November 2026, and 1 January to 15 February 2027. Additional guidance for refugee and asylum seeker projects sits on the small grants page.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Hammersmith and Fulham', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Voluntary and community sector organisations delivering services specifically for refugees and asylum seekers in Hammersmith & Fulham.',
      what_they_fund: 'Services for refugees and asylum seekers living in the borough.',
      typical_award: '£1,000 to £20,000.',
      exclusions: 'Projects not specifically for refugees and asylum seekers (these apply to the general small grants).',
      geographic_focus: 'London Borough of Hammersmith & Fulham.',
      decision_timeline: 'Open 1 October to the end of November 2026, then 1 January to 15 February 2027.',
      how_to_apply: 'Apply through the same online form as the Small Grants Programme, following the additional guidance for projects supporting refugees and asylum seekers.',
      _citations: {
        typical_award: { snippet: 'There is additional grant funding available between £1,000-£20,000 for organisations that are applying to deliver services specifically for refugees and asylum seekers, via our Supporting Vulnerable Communities Grant.', confidence: 'high', source_url: HF_SG },
        open_status: { snippet: 'The scheme will be open for applications between the periods of 1 October to 31 November 2026, and 1 January to 15 February 2027.', confidence: 'high', source_url: HF_SG },
      } } },

  // ── Enfield ─────────────────────────────────────────────────────────────────
  // The application form is dated January 2018 but is still the one offered;
  // the site posts news weekly (latest 21 September 2026), so the scheme is live.
  { title: 'The Enfield Society — Project Grants', funder: 'The Enfield Society', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: ENF_SOC, url_status: 'unchecked',
    location_tag: 'Enfield', is_local: true, amount_min: 100, amount_max: 5000, deadline: null, is_rolling: true,
    eligible_structures: null,
    impact_sectors: ['heritage', 'environment', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['built_heritage', 'natural_heritage'],
    description: 'Grants of £100 to £5,000 from The Enfield Society, the borough’s civic and amenity charity, for projects that conserve and enhance the civic and natural environment of the London Borough of Enfield and its surroundings: buildings of architectural or environmental interest, the Green Belt, open spaces and views, well-designed development, and footpaths, commons and rights of way. The Society prefers not to fund 100% of a project and encourages other funding. No deadline: download the application form and post or email it, or contact the Society to discuss a proposal first.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Enfield', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Applicants with projects that further the Society’s charitable object in the London Borough of Enfield and its immediate surroundings. The page does not restrict the legal form of the applicant.',
      what_they_fund: 'Conserving and enhancing buildings of architectural quality or environmental interest; defending the Green Belt; protecting and improving open spaces and views; environmentally sound, well-designed development; preserving footpaths, commons and rights of way.',
      typical_award: '£100 to £5,000. The Society prefers not to fund 100% of the cost of a project.',
      exclusions: 'Projects outside the Society’s aims or outside Enfield and its immediate surrounding area.',
      geographic_focus: 'London Borough of Enfield and its immediate surrounding area.',
      decision_timeline: 'Rolling; no deadline stated.',
      how_to_apply: 'Download the application form (Word or OpenDocument) from the grants page and post or email it; full submission details are in the form. Contact the Society first if unsure.',
      _citations: {
        typical_award: { snippet: 'Applications will be considered for grants of between £100 and £5,000.', confidence: 'high', source_url: ENF_SOC },
        what_they_fund: { snippet: 'The Society’s object is the conservation and enhancement of the civic and natural environment of the London Borough Enfield and its immediate surrounding area for the public benefit.', confidence: 'high', source_url: ENF_SOC },
      } } },

  { title: 'Kingston Neighbourhood Community Infrastructure Levy (NCIL) Round 4, 2026-27', funder: 'Royal Borough of Kingston upon Thames', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital', 'project'],
    apply_url: KIN_NCIL, url_status: 'unchecked',
    location_tag: 'Kingston upon Thames', is_local: true, amount_min: null, amount_max: null, deadline: '2026-11-01', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'environment'], target_beneficiaries: ['general_public'],
    niche_tags: ['place_based', 'neighbourhood'],
    description: 'Kingston’s Neighbourhood Community Infrastructure Levy, the local share of CIL from new development, for one-off local infrastructure projects such as green spaces, sustainable transport and community facilities. Round 4 covers only the Kingston and North Kingston and the Surbiton neighbourhoods (New and Old Malden and South of the Borough have not reached the funding threshold). Open to community groups, residents’ associations, registered charities, charitable companies and public bodies. Projects must be fully costed, meet the Neighbourhood Community Plan, benefit the wider community and start within a year of award; running and maintenance costs are not funded. Expressions of interest from 15 August to 1 November 2026, then full bids in January and February 2027 and decisions around June 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Kingston upon Thames', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Local community groups, residents’ associations, registered charities, infrastructure providers and charitable companies, as well as council departments and other public sector organisations, for projects in the Kingston and North Kingston or Surbiton neighbourhoods.',
      what_they_fund: 'One-off local infrastructure projects that benefit the wider community, for example parks, biodiversity, community hubs, accessible programmes for under-represented groups and public art, meeting the CIL Regulations and the Neighbourhood Community Plan.',
      typical_award: 'No per-bid figure is published; budgets vary by neighbourhood and larger bids get extra scrutiny.',
      exclusions: 'Maintenance or running costs; projects in New and Old Malden or South of the Borough this round; projects that cannot start within a year of award.',
      geographic_focus: 'Kingston and North Kingston, and Surbiton neighbourhoods of the Royal Borough of Kingston upon Thames.',
      decision_timeline: 'Expressions of interest open 15 August to 1 November 2026; checks November to December; full bid reports January to February 2027; committee decisions around June 2027; funds released from late July 2027.',
      how_to_apply: 'Submit the NCIL expression of interest form on Kingston Let’s Talk by 1 November 2026, after reading the bidder guidance; shortlisted bidders then submit a project bid report. Questions to neighbourhood_management@kingston.gov.uk, copying cil@kingston.gov.uk.',
      _citations: {
        open_status: { snippet: 'Make an expression of interest by 1 Nov 2026', confidence: 'high', source_url: KIN_NCIL },
        who_can_apply: { snippet: 'It is available to local community groups, residents’ associations, registered charities, infrastructure providers, and charitable companies, as well as council departments and other public sector organisations.', confidence: 'high', source_url: KIN_NCIL },
        exclusions: { snippet: 'Be a one-off project (maintenance/running costs cannot be funded via NCIL)', confidence: 'high', source_url: KIN_NCIL },
      } } },

  // ── London-wide: Walking and Cycling Grants London ──────────────────────────
  { title: 'Walking and Cycling Grants London (WCGL)', funder: 'Transport for London and London Marathon Foundation, run by Groundwork London', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['project', 'multi_year'],
    apply_url: WCGL_WHAT, funding_index_url: 'https://wcgl.london/', url_status: 'unchecked',
    location_tag: 'London', is_local: true, amount_min: null, amount_max: 10000, deadline: '2026-09-28', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['sport', 'health', 'community'], target_beneficiaries: ['general_public', 'disabled_people', 'older_people'],
    niche_tags: ['social_isolation'],
    description: 'Grants of up to £10,000 over three years for not-for-profit groups and organisations delivering walking and cycling activity in Greater London, for people who need encouragement to walk or cycle: new, lapsed and occasional cyclists, infrequent walkers, and communities currently detached from walking and cycling. Funded by Transport for London and the London Marathon Foundation and run by Groundwork London. Delivery runs February to September in 2027, 2028 and 2029. Open to constituted community groups, not-for-profits, CICs, social enterprises and charities with a bank account with two unrelated signatories. Closes 10am on Monday 28 September 2026; outcomes 14 to 23 December 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'London', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations delivering in Greater London that are a constituted community group, a not-for-profit organisation, community interest company or social enterprise, or a charity or third sector organisation, with a bank account with two unrelated signatories.',
      what_they_fund: 'Projects that encourage people to walk and/or cycle more often and more safely for transport, exercise or leisure, especially people new to it, lapsed or infrequent, and that connect with communities currently detached from walking or cycling in London. Aims include confidence, frequency, more accessible bike ownership, exercise for inactive people and less social isolation.',
      typical_award: 'Up to £10,000 over three years, for delivery February to September 2027, January to September 2028 and January to September 2029.',
      exclusions: 'Projects delivered outside Greater London; organisations without a written constitution or two unrelated bank signatories.',
      geographic_focus: 'Greater London.',
      decision_timeline: 'Closes 10am Monday 28 September 2026. Outcomes between 14 and 23 December 2026; first year of delivery February to September 2027.',
      how_to_apply: 'Apply through the online application linked from the WCGL What we fund and How to apply pages, after reading the WCGL application guidance. Help from wcgl@groundwork.org.uk or 020 7239 1286.',
      _citations: {
        typical_award: { snippet: 'For new projects in 2026 Walking and Cycling Grants London (WCGL) will fund grants of up to £10,000', confidence: 'high', source_url: WCGL_WHAT },
        who_can_apply: { snippet: 'your project must be delivered in Greater London and your organisation must be either: : • A constituted community group', confidence: 'high', source_url: WCGL_WHO },
        open_status: { snippet: 'The application window is now open and accepting applications until 10am, Monday 28 September 2026.', confidence: 'high', source_url: WCGL_WHO },
      } } },

  { title: 'Walking and Cycling Grants London — Community Ideas Grants', funder: 'Transport for London and London Marathon Foundation, run by Groundwork London', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: WCGL_WHO, funding_index_url: 'https://wcgl.london/', url_status: 'unchecked',
    location_tag: 'London', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-09-28', is_rolling: false,
    // No max_org_income: the test is income under £50,000 OR grants under
    // £10,000 last year, so a larger org with little grant income still qualifies.
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    impact_sectors: ['sport', 'health', 'community'], target_beneficiaries: ['general_public', 'disabled_people', 'older_people'],
    niche_tags: ['social_isolation'],
    description: 'Grants of up to £5,000 for one-year walking or cycling projects in Greater London, for smaller community groups, charities and social enterprises that may not have applied for a grant or run a community project before. Applicants can pick from a template list of previously successful walking and cycling project ideas and get support through application and delivery. Eligible organisations received grants of less than £10,000 last year or have income under £50,000, and must not have been funded by WCGL before; one project per organisation. Funded by TfL and the London Marathon Foundation, run by Groundwork London. Closes 10am on Monday 28 September 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'London', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations delivering in Greater London that are a constituted community group, a not-for-profit, CIC or social enterprise, or a charity or third sector organisation, with a bank account with two unrelated signatories, which received grants of less than £10,000 last year or have income under £50,000 (or both), and have never been funded by Walking and Cycling Grants London.',
      what_they_fund: 'One-year walking or cycling projects, often chosen from a template list of previously successful project ideas, that get people walking and cycling more often and more safely, especially those new to it or detached from it.',
      typical_award: 'Up to £5,000 for a one-year project.',
      exclusions: 'Organisations previously funded by WCGL; more than one project per organisation; organisations over both thresholds (grants of £10,000 or more last year and income of £50,000 or more).',
      geographic_focus: 'Greater London.',
      decision_timeline: 'Closes 10am Monday 28 September 2026. Outcomes between 14 and 23 December 2026.',
      how_to_apply: 'Apply through the Community Ideas Grant application linked from the WCGL pages, using the CIG prospectus (available in several languages). Help from wcgl@groundwork.org.uk or 020 7239 1286.',
      _citations: {
        typical_award: { snippet: 'The Community Ideas Grants fund grants of up to £5,000 for one year projects to smaller community groups, charities and social enterprises who may not have applied for a grant or run a community project before.', confidence: 'high', source_url: WCGL_WHAT },
        who_can_apply: { snippet: 'Organisations applying for a Community Ideas Grant must have received either grants of less than £10,000 last year, or have an income of less than £50,000, or both.', confidence: 'high', source_url: WCGL_WHO },
        open_status: { snippet: 'The deadline for applications is 10am Monday 28 September 2026.', confidence: 'high', source_url: 'https://wcgl.london/infographic' },
      } } },
]

// Held rows fixed in place rather than restaged. Each is off, its link is dead,
// and the funder's working page shows a round open now or within 30 days.
export const FIXES: Fix[] = [
  { id: 'd33d42f4-db55-404a-80f1-624f3fba067d', expect_title: /Thriving Communities Fund - Small Grants/,
    why: 'Archived with url_status dead; the council grants page works and shows round 3 opening 28 September 2026 and closing 18 January 2027.',
    fields: { apply_url: HOU, url_status: 'unchecked', deadline: '2027-01-18', next_open_date: '2026-09-28', amount_max: 1500, max_org_income: 50000,
      grant_sources: [{ url: HOU_SMALL_PDF, label: 'Small Grant Guidance 2026/27 (who can apply, amounts, round dates)', added_at: TODAY }] },
    citations: {
      apply_url: { snippet: 'Round 3 - 28 September 2026 to 18 January 2027', confidence: 'high' },
      amount_max: { snippet: 'Up to £1500 Activities for residents that will be delivered over a period of several months to a year', confidence: 'high' },
      max_org_income: { snippet: 'Organisations with an annual turnover of more than £50,000.', confidence: 'high' },
    } },
  // The second copy, 8a1411a2, stays archived as a duplicate of this one.
  { id: 'ff10a2e7-c5cf-439b-890f-3365510e7481', expect_title: /Thamesmead Community Fund/,
    why: 'Archived with url_status dead, but the London Community Foundation page works and shows round 18 open until 19 October 2026. Thamesmead spans Greenwich and Bexley; the old tag read London.',
    fields: { apply_url: 'https://londoncf.org.uk/grants/thamesmead-community-fund', url_status: 'unchecked', deadline: '2026-10-19', is_rolling: false,
      location_tag: 'Greenwich, Bexley', amount_max: 3000, max_org_income: 100000 },
    citations: {
      deadline: { snippet: 'Applications close on Monday 19th October 2026 at 12 noon.', confidence: 'high' },
      location_tag: { snippet: 'Borough: Bexley, Greenwich', confidence: 'high' },
      amount_max: { snippet: 'Grants of up to £3,000 are available covering costs relating to the proposed project.', confidence: 'high' },
      max_org_income: { snippet: 'Applicant organisations must have an annual income of £100,000 or less.', confidence: 'high' },
    } },
  { id: '85c87c9b-f4b8-4d2e-af95-10f92b074125', expect_title: /Sutton Community Fund/,
    why: 'Archived with url_status dead; Community Action Sutton now runs the September 2026 round on its own page, open until 12 noon on 23 October 2026.',
    fields: { apply_url: 'https://www.communityactionsutton.org.uk/funding/sutton-community-fund/sutton-community-fund-sept-26/', url_status: 'unchecked',
      deadline: '2026-10-23', is_rolling: false, amount_min: 500, amount_max: 5000, max_org_income: 150000 },
    citations: {
      deadline: { snippet: 'The closing date for applications is 12 noon on Friday 23rd October 2026', confidence: 'high' },
      amount_max: { snippet: 'Applications for grants from £500 to a maximum of £5,000 will be accepted.', confidence: 'high' },
      max_org_income: { snippet: 'Only voluntary and community groups and organisations with an income of less than £150,000 can apply.', confidence: 'high' },
    } },
]

