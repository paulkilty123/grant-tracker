// Row data for the mid-size trusts batch, brief docs/handoffs/mid-size-trusts-2026-09-24.md,
// commissioned by Paul on 24 Sept 2026 after the gap review found only 73 live rows
// with a ceiling of £25,000 to £100,000, the band the £100k to £1m income orgs want.
//
// Read by scripts/mid-size-trusts-stage-2026-09-24.ts (writes) and
// scripts/mid-size-trusts-score-2026-09-24.ts (scores against the six heartland
// orgs), so both work from exactly the same rows.
//
// Every page quoted below was fetched on 25 Sept 2026 by direct curl or, where a
// host refused curl, the keyless reader proxy; no model call was made and nothing
// was billed to the Anthropic key. Multi-year awards record the TOTAL in
// amount_max and say so in typical_award, per the brief.
export const SRC = 'system:mid-size-trusts-2026-09-24'
export const TODAY = '2026-09-25'

export type Cite = { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }
export type Row = Record<string, unknown> & {
  title: string; funder: string; apply_url: string
  // Two funds that live on one page share its URL; say so explicitly.
  shares_url_with?: string
}

// ── Clore Duffield Foundation ───────────────────────────────────────────────
const CLORE = 'https://www.cloreduffield.org.uk/clore-school-choirs-and-singing-programme'
const CLORE_GUIDE = 'https://www.cloreduffield.org.uk/userfiles/Clore%20School%20Choirs%20and%20Singing%20-%20grant%20guidance.pdf'

// ── Trust for London ────────────────────────────────────────────────────────
const TFL_DJF = 'https://trustforlondon.org.uk/funding/social-justice/disability-justice/'
const TFL_RJF = 'https://trustforlondon.org.uk/funding/social-justice/racial-justice/'
const TFL_RJF_PDF = 'https://trustforlondon.org.uk/documents/909/RJF_Guidelines_FINAL.pdf'
const TFL_GUIDE = 'https://trustforlondon.org.uk/documents/948/Trust_for_London_funding_guidelines_47P0Rpp.docx'

// ── Ballinger Charitable Trust ──────────────────────────────────────────────
const BAL = 'https://www.ballingercharitabletrust.org.uk/funding-eligibility/'
const BAL_WHAT = 'https://www.ballingercharitabletrust.org.uk/what-we-do/'
const BAL_HOME = 'https://www.ballingercharitabletrust.org.uk/'

// ── Liz and Terry Bramall Foundation ────────────────────────────────────────
const BRAMALL = 'https://www.bramallfoundation.org/'

// ── Barrow Cadbury Trust ────────────────────────────────────────────────────
const BCT_EJ = 'https://barrowcadbury.org.uk/our-work/economic-justice/'
const BCT_BAE_PDF = 'https://barrowcadbury.org.uk/wp-content/uploads/2025/09/Applying-for-funding-Building-Alternative-Economic-Models-in.pdf'
const BCT_APPLY = 'https://barrowcadbury.org.uk/our-work/applying-for-funding/'

// ── National Lottery Community Fund ─────────────────────────────────────────
const NLCF_GCC = 'https://www.tnlcommunityfund.org.uk/funding/funding-programmes/sustainable-steps-wales-green-careers-cardiff'

// ── Landfill Communities Fund distributors ──────────────────────────────────
const FCC_CAF = 'https://fcccommunitiesfoundation.org.uk/funds/fcc-community-action-fund'
const FCC_CAF_PDF = 'https://fcccommunitiesfoundation.org.uk/uploads/misc/FCC-CAF-Guide-for-Applicants-2026-4.pdf'
const FCC_SWS = 'https://fcccommunitiesfoundation.org.uk/funds/severn-waste-services-community-action-fund'
const FCC_SWS_PDF = 'https://fcccommunitiesfoundation.org.uk/uploads/misc/SWS-CAF-Guide-for-Applicants-2026-4.pdf'
const BIFFA = 'https://www.biffa-award.org/home-page/am-i-eligible-can-i-apply'
const BIFFA_FAQ = 'https://www.biffa-award.org/faqs/'
const SUEZ = 'https://grantscape.org.uk/fund/suez-communities-fund-england/'
const SUEZ_ELIG = 'https://grantscape.org.uk/fund/suez-communities-fund-england/suez-communities-fund-england-eligibility-criteria/'
const ENOVERT = 'https://www.enovert.co.uk/enovert-community-trust/funding/apply-for-funding/'
const ENOVERT_FUND = 'https://www.enovert.co.uk/enovert-community-trust/funding/'
const ENOVERT_FAQ = 'https://www.enovert.co.uk/enovert-community-trust/funding/frequently-asked-funding-questions/'
const TARMAC = 'https://www.derbyshire.gov.uk/community/lottery-funding/environmental-trust/derbyshire-environmental-trust.aspx'
const TARMAC_PDF = 'https://www.derbyshire.gov.uk/site-elements/documents/pdf/community/lottery-funding/environmental-trust/tarmac-lcf-brochure.pdf'

// ── Pilgrim Trust, Vinehill Trust, bulletin finds ───────────────────────────
const PILGRIM = 'https://www.thepilgrimtrust.org.uk/preservation-and-conservation-grants'
const PILGRIM_GLANCE = 'https://www.thepilgrimtrust.org.uk/grants-at-a-glance/'
const VINEHILL = 'https://vinehilltrust.uk'
const RIDDELL = 'https://www.davidriddell.org/grants'
const TOW = 'https://treecouncil.org.uk/grants-and-guidance/our-grants/trees-outside-woodland-fund/'

// ── GrantScape-administered community funds ─────────────────────────────────
const GS = 'https://grantscape.org.uk/fund'
// GrantScape's standard list: voluntary and community groups, charities,
// councils, and social enterprises and CICs that do not distribute profit.
const GS_STRUCTURES = ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated', 'cooperative']

// Shared text for the landfill (LCF) rows: the rules come from the Landfill Tax
// Regulations, so every distributor repeats them.
const LCF_CTP = 'A Contributing Third Party must pay about 10% of the grant value to the landfill operator before the grant is released; it cannot come from the applicant if it is a registered Environmental Body, from other landfill money, or from anyone who benefits directly from the project.'

const BIFFA_WHO = 'Fully constituted charitable or not-for-profit organisations with no share capital. Not local authorities, councils, hospices, hospitals, day-care centres, activity centres, rehabilitation units, residential care facilities, allotments, nurseries, food banks or schools and colleges. The organisation must own the site or hold a fully signed lease with at least 10 years remaining.'
const BIFFA_AWARD = 'Between £10,000 and £75,000, towards a project whose total cost (or phase) does not exceed £200,000 including VAT. A Third Party Contributor funds 10% of the application value, and 75% of any shortfall must be secured if Biffa Award is not asked to fund the whole project.'
const BIFFA_TIMELINE = 'Rolling. Expressions of Interest can be submitted at any time and applicants hear within a week whether they are invited to a full application. The Board meets four times a year; it can take up to six months to hear the final outcome.'
const BIFFA_HOW = 'Check the project postcode against both distance tests (a significant Biffa operation, and a licensed landfill site) using the checkers on the theme page, then submit an Expression of Interest online. Invited projects complete a full application.'
const BIFFA_STRUCTURES = ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated']
const biffaCite = (url: string) => ({
  typical_award: { snippet: 'Application value must be between £10,000 and £75,000', confidence: 'high' as const, source_url: url },
  who_can_apply: { snippet: 'Your organisation must be fully constituted, charitable or not-for-profit with no share capital.', confidence: 'high' as const, source_url: url },
  decision_timeline: { snippet: 'Submissions of Expression of Interest for our Main Grants Scheme are on a rolling basis, so you can submit at any time.', confidence: 'high' as const, source_url: BIFFA_FAQ },
})

export const NEW: Row[] = [
  // ── Clore Duffield Foundation ─────────────────────────────────────────────
  // Not held: the one "Clore" row in the catalogue is Clore Social Leadership,
  // a different body. The Foundation otherwise takes no unsolicited
  // applications, so this dated programme is its only open route.
  { title: 'Clore Duffield Foundation — School Choirs and Singing Programme', funder: 'Clore Duffield Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'multi_year'],
    apply_url: CLORE, url_status: 'unchecked',
    location_tag: 'England', is_local: false, amount_min: 150000, amount_max: 300000, deadline: '2026-10-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    impact_sectors: ['creative', 'education', 'young_people'], target_beneficiaries: ['children', 'young_people'],
    niche_tags: ['music'],
    description: 'A new three-year programme from the Clore Duffield Foundation for organisations with expertise and a track record in choirs and group vocal work, working alongside groups of state-funded schools in England to make school singing effective, inclusive and lasting. Grants of £50,000 to £100,000 a year for three years, to five to ten projects that will form a national cohort and contribute to a published resource for the sector. Each project works with at least three state-funded schools, with at least one lead partner school whose headteacher or a senior leader the applicant has met. The grant pays practitioner fees, teacher development and cover, coordination (up to 10%), resources, performance and travel; not capital or core running costs. Applications open 21 September and close at midday on 30 October 2026; delivery starts in autumn 2027.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'England', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations working on a not-for-profit basis with expertise and a track record in supporting choirs and group vocal work in schools: typically choirs with outreach programmes, community music organisations, local authority music services and music education hubs. Most will be registered charities; CICs, companies limited by guarantee and local authority services are also accepted. Schools, school groups and multi-academy trusts may lead where they have the choral expertise. The applicant must have experience of working in schools, plan to work with at least three state-funded schools in England, and have met or spoken substantively with a headteacher or senior leader at a lead partner school.',
      what_they_fund: 'Three-year projects building sustainable, inclusive and musically ambitious school singing with groups of state-funded schools: practitioner fees and expenses, teacher and practitioner development, teacher release and cover, project coordination (up to 10% of the grant), resources and essential equipment, performance and sharing including venue hire, and travel including pupil transport and cohort meetings.',
      typical_award: '£50,000 to £100,000 a year for three years, so £150,000 to £300,000 in total. Five to ten projects will be funded. Grants are paid annually in advance.',
      exclusions: 'Capital expenditure; core organisational running costs not attributable to the programme (rent, utilities, insurance, governance, fundraising, general marketing); activity already fully funded from another source; projects, travel or activity outside England. Fee-paying schools cannot be one of the three partner schools.',
      priorities: 'Need specific to these schools and area (little or no singing, singing for the few, disadvantage, rural isolation), a genuine relationship with school leaders, teachers developing alongside practitioners, and a credible route to the singing lasting beyond the funding. A proposal for the same work in more places is unlikely to succeed.',
      geographic_focus: 'England. The applicant can be based anywhere in the UK but all work must take place in state-funded schools in England.',
      decision_timeline: 'Applications open 21 September 2026 and close at midday on 30 October 2026. Stage one outcomes in December 2026, interviews on 2 and 9 February 2027, awards confirmed in spring 2027, delivery from autumn 2027. An information webinar runs on 29 September 2026.',
      how_to_apply: 'Read the grant guidance, FAQs and schools information sheet on the programme page, prepare answers in the Word version of the form (the online form cannot be saved part-way), then submit through the online application form linked from the page. Questions go to info@cloreduffield.org.uk.',
      _citations: {
        typical_award: { snippet: 'Grants of £50,000 to £100,000 a year, for three years.', confidence: 'high', source_url: CLORE },
        who_can_apply: { snippet: 'Most will be registered charities, although we can also accept CICs, companies limited by guarantee and local authority services.', confidence: 'high', source_url: CLORE_GUIDE },
        open_status: { snippet: 'Applications open 21 September 2026 and close at midday on 30 October 2026.', confidence: 'high', source_url: CLORE },
        exclusions: { snippet: 'The grant will not fund: Capital expenditure. Core organisational running costs not attributable to the programme', confidence: 'high', source_url: CLORE_GUIDE },
        geographic_focus: { snippet: 'Each project works with at least three state-funded schools in England, primary, secondary or both.', confidence: 'high', source_url: CLORE },
      } } },

  // ── Trust for London strands ──────────────────────────────────────────────
  // Held as one whole-funder row (60206220, live). These two strands have their
  // own pages, criteria and routes in; the London boroughs batch left them as a
  // lead for a London-wide pass. Same precedent as the Waterloo and Oak strands.
  { title: 'Trust for London — Disability Justice Fund', funder: 'Trust for London', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'multi_year'],
    apply_url: TFL_DJF, url_status: 'unchecked',
    location_tag: 'London', is_local: true, amount_min: 10000, amount_max: 180000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    impact_sectors: ['disability', 'justice'], target_beneficiaries: ['disabled_people'],
    niche_tags: ['campaigning', 'advocacy', 'systems_change'],
    description: 'Trust for London’s fund for a strong, sustainable and inclusive disability movement in London, led by Deaf and Disabled people’s organisations (DDPOs). It funds campaigning and advocacy that challenges injustice, new ways of organising and mobilising, and work that builds DDPOs’ capacity to campaign and influence. Most grants for established organisations are £30,000 to £180,000; development grants of £10,000 to £35,000 are available to smaller or newer groups. Projects can last up to four years. Applications are accepted on a rolling basis until the end of 2027, starting with an information session or a call with a grants manager and an expression of interest.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'London', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Deaf and Disabled People’s Organisations as defined by Inclusion London: at least 75% of the management committee or board are Deaf or Disabled people, at least 50% of paid staff are Deaf or Disabled people with representation at all levels, and the organisation provides services for or works on behalf of Deaf and Disabled people. Non-DDPOs are automatically rejected unless directly invited; partnerships between DDPOs and non-DDPOs must meet the Trust before applying. National organisations must show how the work benefits Deaf and Disabled Londoners. Trust for London accepts registered charities, CIOs, CICs, companies limited by guarantee, trusts, unincorporated associations, co-operative societies and trade unions.',
      what_they_fund: 'Long-term change for Deaf and Disabled Londoners: campaigning and advocacy challenging injustice at local, regional or national level; new or creative ways of organising, mobilising or campaigning; work that builds DDPOs’ capacity to campaign, influence and mobilise, particularly intersectional organisations; and campaigns led by coalitions of DDPOs. Development grants help smaller or newer groups campaign or strengthen their systems and skills.',
      typical_award: 'Most grants for established organisations are likely to be £30,000 to £180,000; development grants £10,000 to £35,000. Grants usually cover 12 months or longer, for projects of up to four years.',
      exclusions: 'Service delivery such as advocacy, advice services or care provision. Applications from non-DDPOs unless directly invited. One application per organisation in any 12-month period.',
      priorities: 'Intersectional organisations led by and for Disabled people with intersecting marginalised identities; organisations led by and for people with learning difficulties; organisations led by and for visually impaired people.',
      geographic_focus: 'London. National organisations can apply if the work specifically benefits Deaf and Disabled Londoners.',
      decision_timeline: 'Rolling until the end of 2027. Shortlisted applicants are asked for more information and invited to meet before a final decision.',
      how_to_apply: 'Read the guidelines, attend an online information session or book a call with a grants manager, complete the eligibility quiz and submit an expression of interest through the online form. Shortlisted organisations provide more information and meet the Trust.',
      _citations: {
        typical_award: { snippet: 'Most grants are likely to be between £30,000 and £180,000 for established organisations. Development grants are likely to be between £10,000-£35,000.', confidence: 'high', source_url: TFL_DJF },
        who_can_apply: { snippet: 'We welcome applications from organisations that meet Inclusion London’s definition of DDPOs.', confidence: 'high', source_url: TFL_DJF },
        open_status: { snippet: 'Applications are being accepted on a rolling basis till the end of 2027. You can apply at any time.', confidence: 'high', source_url: TFL_DJF },
        exclusions: { snippet: 'We\'re unable to fund service delivery, like advocacy, advice services or care provision.', confidence: 'high', source_url: TFL_DJF },
        eligible_structures: { snippet: 'We can only accept applications from: Registered Charities, Charitable Incorporated Organisations (CIO), Community Interest Companies (CIC), Companies Limited by Guarantee (CLG), Trusts, Unincorporated Associations, Cooperative Societies, Trade unions', confidence: 'high', source_url: TFL_GUIDE },
      } } },

  { title: 'Trust for London — Racial Justice Fund', funder: 'Trust for London', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: TFL_RJF, url_status: 'unchecked',
    location_tag: 'London', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    impact_sectors: ['justice', 'financial', 'housing'], target_beneficiaries: ['ethnic_minorities', 'people_in_poverty'],
    niche_tags: ['systems_change', 'campaigning', 'community_ownership'],
    description: 'A fund jointly backed by City Bridge Foundation, Lloyds Bank Foundation for England and Wales and Trust for London to tackle the causes of racial injustice by economically empowering Black and minoritised Londoners: increasing household incomes and household and community wealth. Funded work so far covers housing, regeneration and community assets (displacement, gentrification, Black-led community land trusts), pay and working conditions (such as ethnicity pay gap reporting), and alternative economic models that build wealth. It funds systems change rather than helping individuals navigate an unequal system. The fund’s guidelines state no per-grant figure. Rolling: book a call with the racial justice lead, then an expression of interest and a second-stage application if shortlisted.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'London', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, CIOs, community interest companies, companies limited by guarantee and trusts whose work is charitable and benefits Black and minoritised Londoners in poverty. National work can be funded where it benefits Londoners; organisations based outside the UK cannot apply. Newly formed organisations are considered, particularly if led by people directly affected and with a clear strategy for systemic change.',
      what_they_fund: 'Work that increases household income and household and community wealth in Black and minoritised communities in London: responses to displacement, gentrification and the loss of cultural assets; campaigning and research on pay and working conditions; and alternative economic models that combine income generation with long-term wealth building.',
      typical_award: 'The Racial Justice Fund guidelines do not state a per-grant figure. Trust for London’s general funding guidelines, which cover its racial justice priority, say its grants normally range from £40,000 to £80,000 a year for up to five years and do not typically exceed £300,000 in total; confirm the figure for this fund on the call.',
      exclusions: 'Work focused on helping individuals navigate an unequal system rather than changing the system, such as mentoring or leadership programmes with no link to systemic change, or diversity schemes without a focus on equity in pay. Organisations based outside the UK.',
      geographic_focus: 'London. National work is eligible if it benefits Londoners.',
      decision_timeline: 'Rolling. Applications are peer reviewed by Trust for London and Lloyds Bank Foundation.',
      how_to_apply: 'Read the Racial Justice Fund guidelines, take the short eligibility quiz and book a call with the racial justice lead, then complete the eligibility quiz and submit an expression of interest. Shortlisted organisations submit a second-stage application and meet the team.',
      _citations: {
        who_can_apply: { snippet: 'We can only accept applications from: Registered Charities, Charitable Incorporated Organisations (CIO), Community Interest Companies (CIC), Companies Limited by Guarantee (CLG), Trusts', confidence: 'high', source_url: TFL_RJF_PDF },
        what_they_fund: { snippet: 'The racial justice fund aims to change this by economically empowering Black and minority groups. It\'s jointly funded by the City Bridge Foundation, Lloyds Bank Foundation for England and Wales and Trust for London.', confidence: 'high', source_url: TFL_RJF },
        typical_award: { snippet: 'We can fund work for up to five years and normally our grants range from £40,000 to £80,000 a year. We don’t typically expect to make grants above £300,000 in total.', confidence: 'med', source_url: TFL_GUIDE },
        how_to_apply: { snippet: 'Book a call with Ugo, our racial justice lead. You\'ll be asked to take a short eligibility quiz, and then taken to a page to book a call.', confidence: 'high', source_url: TFL_RJF },
      } } },

  // ── Ballinger Charitable Trust ───────────────────────────────────────────
  { title: 'Ballinger Charitable Trust — Grants for Young and Older People in North East England', funder: 'Ballinger Charitable Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'core_costs', 'multi_year', 'project', 'capital'],
    apply_url: BAL, url_status: 'unchecked',
    location_tag: 'North East England', is_local: true, amount_min: null, amount_max: 60000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['young_people', 'older_people', 'community'], target_beneficiaries: ['young_people', 'children', 'older_people'],
    niche_tags: ['social_isolation'],
    description: 'Grants from the Ballinger Charitable Trust for charities, CICs and community groups with a permanent base in North East England supporting children and young people (0 to 19, or 25 with SEN) or older people (over 55). The typical award is £10,000 to £20,000 a year for an initial two to three years, and 95% of grants are unrestricted. Youth funding goes to organisations running a wide range of general youth activities with open-access, long-term relationships with young people, not to those with a narrower focus such as arts or sport. Two short online routes: Unrestricted or Core (about five minutes) and Project or Capital. Rolling; trustees meet quarterly. The success rate is currently about 1 in 50.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'North East England', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities, CICs and community groups with a permanent base in North East England whose work supports young people or older people in the region. CICs must have a credible enterprise model with a demonstrable income stream and strong, independent governance. Not individuals, uniformed groups or school-based projects.',
      what_they_fund: 'Young people (0 to 19, 25 with SEN): organisations delivering a wider range of general youth activities, with open-access, long-term, open-ended relationships with their young people, supporting health, development and wellbeing. Older people (over 55): organisations rooted in their community and focused on long-term relationships, from weekly activities to multi-year core funding or larger grants such as new dementia support. The Trust prefers unrestricted funding but will restrict to a project where the applicant prefers.',
      typical_award: 'Typically £10,000 to £20,000 a year for an initial two to three years, so up to about £60,000 in total; smaller grants for start-ups, and community micro-grant events for volunteer-led groups. 95% of grants are unrestricted.',
      exclusions: 'Uniformed groups, school-based projects, individuals, and youth organisations with a narrow focus such as arts or sport.',
      priorities: 'Funding is spread proportionally across the North East’s 12 local authority areas. Most of the annual budget maintains long-term grant relationships, so there is limited capacity for new ones.',
      geographic_focus: 'North East England; the organisation must have a permanent base in the region.',
      decision_timeline: 'Rolling. Trustees meet quarterly, usually in March, June, September and December. Shortlisted applicants are visited only when funding is in place.',
      how_to_apply: 'Check eligibility (organisation type and postcode) on the Check Eligibility & Apply page, then complete the online form for either the Unrestricted or Core route or the Project or Capital route. The Trust researches each applicant from published accounts and its website before any visit.',
      _citations: {
        typical_award: { snippet: 'Our typical grant award is £10,000 to £20,000 per annum for an initial period of 2 to 3 years', confidence: 'high', source_url: BAL_WHAT },
        who_can_apply: { snippet: 'Your organisation has a permanent base in North East England. The funding will be used to support young / older people in the region.', confidence: 'high', source_url: BAL },
        exclusions: { snippet: 'Please note that we do not support uniformed groups or school-based projects.', confidence: 'high', source_url: BAL },
        eligible_structures: { snippet: 'seeks to support charities, CICs and community groups in North-East England, through grants and funding.', confidence: 'high', source_url: BAL_HOME },
        spend: { snippet: '95% of our grants are offered as unrestricted funding', confidence: 'high', source_url: BAL_WHAT },
      } } },

  // ── Liz and Terry Bramall Foundation ─────────────────────────────────────
  { title: 'Liz and Terry Bramall Foundation — Grants', funder: 'The Liz and Terry Bramall Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'capital'],
    apply_url: BRAMALL, url_status: 'unchecked',
    location_tag: 'Yorkshire', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio'],
    impact_sectors: ['community', 'health', 'creative', 'heritage'], target_beneficiaries: ['general_public'],
    niche_tags: ['music', 'built_heritage'],
    description: 'A family foundation giving grants to charitable projects that further its objects, with an emphasis on the Yorkshire region: the Christian faith in accordance with the Church of England; regeneration in areas of social and economic deprivation (relief of hardship and unemployment, training, housing, public amenities, recreation, environment, heritage buildings); health; the arts; and education, particularly music and the arts. Applications by letter or email at any time, with a summary of no more than 120 words; no accounts needed. Trustees meet quarterly. The foundation’s own page states no grant range.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Yorkshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charitable organisations whose projects further the foundation’s objects, with an emphasis on the Yorkshire region.',
      what_they_fund: 'Projects furthering the foundation’s objects: advancing the Christian faith in accordance with the Church of England; urban or rural regeneration in deprived areas through relief of hardship and unemployment, education and training, housing, public amenities, historic buildings, recreational facilities, environmental protection, public health facilities and childcare, and crime prevention; relief of sickness and advancement of health; the arts, including museums, galleries and theatres; and education, including school facilities and the study of music and other arts.',
      typical_award: 'The foundation’s own page states no grant range; state the level of funding sought in the application.',
      geographic_focus: 'Emphasis on the Yorkshire region.',
      decision_timeline: 'Rolling. Applications are acknowledged within 10 working days; trustees meet quarterly in January, April, August and November; responses within six weeks of the meeting. No individual feedback.',
      how_to_apply: 'Write to the registered office (Eton House, 89 Station Parade, Harrogate HG1 1HF) or email bramallfoundation@raworths.co.uk with a summary of no more than 120 words, a short synopsis of the organisation’s aims and activities, details of the project, the level of funding sought, and other sources of funds that will make the project sustainable. Accounts are not needed.',
      _citations: {
        geographic_focus: { snippet: 'Grant support is given to projects furthering these aims, with an emphasis on the Yorkshire region.', confidence: 'high', source_url: BRAMALL },
        how_to_apply: { snippet: 'Applications can be made by letter sent to the registered office which is Eton House, 89 Station Parade, Harrogate HG1 1HF or by e-mail to bramallfoundation@raworths.co.uk.', confidence: 'high', source_url: BRAMALL },
        decision_timeline: { snippet: 'Trustees’ meetings are held quarterly in January, April, August and November, but can be subject to change.', confidence: 'high', source_url: BRAMALL },
      } } },

  // ── Barrow Cadbury Trust ─────────────────────────────────────────────────
  // Held as a whole-funder row (7e2f1cd7, live) plus social investment. The
  // Trust's funds are 'largely committed for the year ahead'; this Birmingham
  // strand is the one route it says is open.
  { title: 'Barrow Cadbury Trust — Building an Alternative Economic Model (Birmingham)', funder: 'Barrow Cadbury Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: BCT_EJ, url_status: 'unchecked',
    location_tag: 'Birmingham', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: [],
    impact_sectors: ['social_economy', 'financial', 'community'], target_beneficiaries: ['people_in_poverty', 'ethnic_minorities'],
    niche_tags: ['community_ownership', 'circular_economy', 'systems_change'],
    description: 'A strand of Barrow Cadbury Trust’s Economic Justice Programme for organisations in Birmingham testing or building alternative economic models that others might learn from or adopt: giving local people, particularly those further from power, more access to and control over assets; valuing unrecognised labour and social activity other than through money; distributing wealth, resources and wellbeing more fairly; and re-using and regenerating resources. It will support a small number of experiments with potential for deep, long-term change beyond the applicant. Enquiries at any time; the Trust responds within 10 working days and invites full applications. No grant figure is published.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Birmingham', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations working in Birmingham that are testing or building alternative economic models. The Trust funds organisations, not individuals. The guidance does not restrict legal form.',
      what_they_fund: 'A small number of experiments developing and demonstrating alternatives to the mainstream economy in Birmingham, in fields such as housing, food and money or currency: activities that give local people more control over assets, value unrecognised labour, distribute wealth more fairly, or help resources to be re-used and regenerated.',
      typical_award: 'No grant figure is stated in the guidance or on the programme page.',
      exclusions: 'Individuals. Unsolicited applications for work outside the UK.',
      geographic_focus: 'Birmingham.',
      decision_timeline: 'Rolling, with no deadlines. Enquiries answered within 10 working days; assessment of an invited full application can take up to four months.',
      how_to_apply: 'Read the Building an Alternative Economic Model guidance, then complete the short online enquiry form. If the Trust thinks the work fits, it invites a full application.',
      _citations: {
        open_status: { snippet: 'We are currently open to funding applications through our Building Alternatives funding stream, which is focused in Birmingham.', confidence: 'high', source_url: BCT_EJ },
        who_can_apply: { snippet: 'We are interested in hearing from organisations working in Birmingham that are testing or building alternative economic models that others might learn from or adopt.', confidence: 'high', source_url: BCT_BAE_PDF },
        decision_timeline: { snippet: 'You can apply at any time. We do not have set grant-making deadlines.', confidence: 'high', source_url: BCT_APPLY },
      } } },

  // ── National Lottery Community Fund ──────────────────────────────────────
  { title: 'Sustainable Steps Wales — Green Careers Cardiff', funder: 'National Lottery Community Fund', funder_type: 'lottery',
    funding_type: 'grant', funding_subtypes: ['project', 'multi_year'],
    apply_url: NLCF_GCC, url_status: 'unchecked',
    location_tag: 'Cardiff', is_local: true, amount_min: 300, amount_max: 25000, deadline: '2026-10-31', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cooperative', 'ltd_guarantee', 'cic_guarantee', 'cic_shares', 'unincorporated'],
    impact_sectors: ['employment', 'environment', 'young_people'], target_beneficiaries: ['young_people', 'ethnic_minorities', 'refugees_migrants'],
    niche_tags: ['climate', 'vocational'],
    description: 'A National Lottery Community Fund programme to help young people aged 16 to 25 from ethnically minoritised communities in Cardiff into green careers, meaning jobs that reduce carbon, restore nature or help adapt to climate change. Partnerships of organisations apply through one lead organisation. Development funding of £300 to £25,000 is open now to develop a project idea, until Saturday 31 October 2026; partnerships that receive it are then invited to apply for £100,000 to £1,800,000 of project funding over three years (one award planned), between 1 December 2026 and 28 February 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Cardiff', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Partnerships of organisations, led by one UK-based lead organisation that is a registered charity, voluntary or community organisation, CIO, co-operative society or company limited by guarantee with a not-for-profit clause, community interest company or community benefit society. The lead needs at least three unrelated board or committee members aged 18 or over. Partners can come from any sector and work locally, regionally or across Wales.',
      what_they_fund: 'Projects that help young people aged 16 to 25 from ethnically minoritised communities in Cardiff (including Gypsy, Roma and Traveller communities, refugees and people seeking asylum) develop confidence and skills and gain work experience and placements leading to green careers.',
      typical_award: 'Development funding: £300 to £25,000 to develop the project idea. Project funding: £100,000 to £1,800,000 over three years, by invitation only to partnerships that received development funding; one award is planned.',
      exclusions: 'Single organisations without a partnership. Project funding without first receiving development funding.',
      geographic_focus: 'Cardiff.',
      decision_timeline: 'Development funding applications from 1 August to Saturday 31 October 2026, decisions by the end of November 2026. Project funding applications by invitation from 1 December 2026 to 28 February 2027, decisions by the end of March 2027.',
      how_to_apply: 'Contact the fund to start: phone 0300 123 0735 (9am to 5pm, Monday to Friday) or email sustainablestepswales@tnlcommunityfund.org.uk. A funding officer takes the details and begins the application process. A partnership agreement template is provided.',
      _citations: {
        typical_award: { snippet: 'development funding: £300 to £25,000 to develop your project idea or plan for supporting young people from ethnically minoritised communities into green careers', confidence: 'high', source_url: NLCF_GCC },
        open_status: { snippet: 'You can apply for funding to develop your project idea between Saturday 1 August 2026 to Saturday 31 October 2026.', confidence: 'high', source_url: `${NLCF_GCC}/how-to-apply` },
        who_can_apply: { snippet: 'We’ll only fund projects where a partnership of organisations works together to plan and deliver a project.', confidence: 'high', source_url: `${NLCF_GCC}/who-can-apply` },
      } } },

  // ── FCC Communities Foundation ───────────────────────────────────────────
  { title: 'FCC Community Action Fund', funder: 'FCC Communities Foundation', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: FCC_CAF, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: 10000, amount_max: 100000, deadline: '2026-11-18', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio'],
    impact_sectors: ['community', 'environment', 'sport', 'heritage'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants of £10,000 to £100,000 from FCC Communities Foundation for capital improvements to public amenities (Object D) or for conserving biodiversity (Object DA), at sites within 10 miles of an eligible FCC Environment facility in England. The total project cost must not exceed £250,000. Eligible sites include village halls and community centres, play areas, skate parks and games areas, publicly accessible sports grounds and pavilions, church community spaces available for public hire, nature reserves, parks and woodlands, and museums. The 2026-4 round closes at 5pm on 18 November 2026, with decisions on 9 March 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, churches or parochial church councils, parish or town councils and committees acting for them, local authorities, and CASC-registered sports clubs. The applicant must own, lease or hold a long-term written management agreement for the site with at least five years remaining. CICs are not listed.',
      what_they_fund: 'Physical improvements to an existing or new public amenity (repairs, refurbishment, access, landscaping, play equipment, paths, games surfaces, skate parks), and physical works that restore or enhance habitats and species. Costs directly linked to delivery: contractors, materials, capital items and small equipment.',
      typical_award: '£10,000 to £100,000 towards a project with a total cost of no more than £250,000 including VAT.',
      exclusions: 'Projects already started; routine maintenance or running costs; contingencies; land purchase; salaries, training or travel; vehicles; school, nursery, college or university sites; hospitals, hospices, day centres and residential homes; allotments; car parks; council-run leisure centres and pools; highways; bins and lampposts; members-only facilities; town centre enhancements; overnight accommodation; the structure of new buildings or substantial extensions. A contributing third party pays about 10% of the grant.',
      geographic_focus: 'England, within 10 miles of an eligible FCC Environment site; use the distance checker on the fund page. Herefordshire and Worcestershire projects near a Severn Waste Services site apply to that fund instead.',
      decision_timeline: 'Four rounds a year. The 2026-4 round opened 2 September and closes at 5pm on 18 November 2026; decisions on 9 March 2027.',
      how_to_apply: 'Complete the pre-application eligibility check via Apply on the fund page, read the Guide for Applicants for the round, then submit the online application with the required documents before the deadline.',
      _citations: {
        typical_award: { snippet: 'You may apply for £10,000 to £100,000 towards projects with a maximum total cost of £250,000, including VAT where applicable.', confidence: 'high', source_url: FCC_CAF_PDF },
        who_can_apply: { snippet: 'We will accept applications from the following types or organisations: Registered Charities, Churches or Parochial Church Councils, Parish or Town Councils', confidence: 'high', source_url: FCC_CAF_PDF },
        open_status: { snippet: '2026-4 Round - opens 2 September 2026 and closes at 5.00pm on 18 November 2026', confidence: 'high', source_url: FCC_CAF },
        geographic_focus: { snippet: 'Only applications for projects sited within 10 miles of an eligible FCC Environment waste facility can be accepted', confidence: 'high', source_url: FCC_CAF },
      } } },

  { title: 'FCC Communities Foundation — Severn Waste Services Community Action Fund', funder: 'FCC Communities Foundation', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: FCC_SWS, url_status: 'unchecked',
    location_tag: 'Herefordshire, Worcestershire', is_local: true, amount_min: 5000, amount_max: 40000, deadline: '2026-11-18', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio'],
    impact_sectors: ['community', 'environment', 'sport', 'heritage'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants of £5,000 to £40,000 from FCC Communities Foundation for capital improvements to public amenities and biodiversity projects in Herefordshire and Worcestershire, within 10 miles of the Severn Waste Services sites at Hill and Moor landfill (Pershore), Leominster household waste site, and the Hartlebury energy from waste site. Total project cost no more than £250,000. Same eligible sites and exclusions as the FCC Community Action Fund. The 2026-4 round closes at 5pm on 18 November 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Herefordshire, Worcestershire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, churches or parochial church councils, parish or town councils and committees acting for them, local authorities, and CASC-registered sports clubs, owning or leasing the site with at least five years remaining.',
      what_they_fund: 'Improvements to public amenities such as village halls, community centres, play areas, sports grounds, church community spaces, parks, nature reserves and museums, and physical works for biodiversity.',
      typical_award: '£5,000 to £40,000 towards a project with a total cost of no more than £250,000 including VAT.',
      exclusions: 'As the FCC Community Action Fund: no running costs, salaries, land purchase, vehicles, school or health-care sites, allotments, car parks, highways, members-only facilities, or the structure of new buildings. A contributing third party pays about 10% of the grant.',
      geographic_focus: 'Herefordshire and Worcestershire, within 10 miles of an eligible Severn Waste Services site.',
      decision_timeline: 'Four rounds a year. The 2026-4 round closes at 5pm on 18 November 2026; the Board decides about 16 weeks after a round closes.',
      how_to_apply: 'Complete the pre-application eligibility check via Apply on the fund page, read the SWS Guide for Applicants for the round, then submit online.',
      _citations: {
        typical_award: { snippet: 'You may apply for £5,000 to £40,000 towards projects with a maximum total cost of £250,000, including VAT where applicable.', confidence: 'high', source_url: FCC_SWS_PDF },
        geographic_focus: { snippet: 'Only applications for projects sited in Herefordshire or Worcestershire, within 10 miles of the eligible Severn Waste Services waste facilities listed below can be accepted.', confidence: 'high', source_url: FCC_SWS },
        open_status: { snippet: '2026-4 Round - opens 2 September 2026 and closes at 5.00pm on 18 November 2026', confidence: 'high', source_url: FCC_SWS },
      } } },

  // ── Biffa Award Main Grants Scheme, one row per theme ────────────────────
  // Held as ba48807d (archived, url_status dead: /main-grants-scheme/ no longer
  // exists). The scheme now presents four themes, each with its own page,
  // criteria and distance rule; staged one row per theme.
  { title: 'Biffa Award — Community Buildings', funder: 'Biffa Award', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${BIFFA}/community-buildings/`, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: 10000, amount_max: 75000, deadline: null, is_rolling: true,
    eligible_structures: BIFFA_STRUCTURES,
    impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Biffa Award Main Grants of £10,000 to £75,000 to improve buildings at the heart of their communities, such as village halls, community centres and church halls: renovating community rooms, refurbishing toilets and kitchens, replacing doors, windows, floors and roofs, new heating, and extensions that add space for community groups. The building should be used by many groups each week. Total project cost no more than £200,000. The site must be within five miles of a significant Biffa operation (10 miles of an active Biffa landfill) and within 10 miles of a licensed landfill site. Expressions of Interest are rolling.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: BIFFA_WHO,
      what_they_fund: 'Improvements to community buildings used by many groups each week: renovations of community rooms, refurbished toilets and kitchens, replacement doors and windows, extensions creating space for community groups, replacement floors and roofs, and new central heating. Places of worship must show they serve the wider community like a village hall.',
      typical_award: BIFFA_AWARD,
      exclusions: 'Fabric repairs or repairs to church windows, spires, steeples or bell towers, or any area not publicly available as community space. Projects focused solely on cost-cutting or energy saving. Standalone elements of a wider project costing over £200,000. Retrospective work. Sporting clubhouses apply under Recreation.',
      geographic_focus: 'Within five miles of a significant Biffa operation, or 10 miles of an active Biffa landfill site, and also within 10 miles of a licensed landfill site. Postcode checkers on the theme page.',
      decision_timeline: BIFFA_TIMELINE,
      how_to_apply: BIFFA_HOW,
      _citations: biffaCite(`${BIFFA}/community-buildings/`) } },

  { title: 'Biffa Award — Cultural Facilities', funder: 'Biffa Award', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${BIFFA}/community-buildings-2/`, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: 10000, amount_max: 75000, deadline: null, is_rolling: true,
    eligible_structures: BIFFA_STRUCTURES,
    impact_sectors: ['creative', 'heritage', 'community', 'education'], target_beneficiaries: ['general_public'],
    niche_tags: ['museums_archives', 'theatre'],
    description: 'Biffa Award Main Grants of £10,000 to £75,000 to improve cultural facilities open to the public, such as theatres, galleries, museums, concert halls and arts or heritage centres: exhibition and interpretation improvements, interactive displays, outdoor amphitheatre spaces and auditorium seating. The site must attract tourists or day visitors and be used by many people each week. Total project cost no more than £200,000, and the site must meet Biffa Award’s two distance tests. Expressions of Interest are rolling.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: BIFFA_WHO,
      what_they_fund: 'Improvements within theatres, galleries, museums, concert halls and arts or heritage centres that are open to the public and inspire learning, creativity and participation: exhibition and interpretation, interactive displays, outdoor amphitheatres and auditorium seating.',
      typical_award: BIFFA_AWARD,
      exclusions: 'Sites that do not attract tourists or day visitors; standalone elements of a wider project costing over £200,000; retrospective work; projects crossing into another theme.',
      geographic_focus: 'Within five miles of a significant Biffa operation, or 10 miles of an active Biffa landfill site, and also within 10 miles of a licensed landfill site.',
      decision_timeline: BIFFA_TIMELINE,
      how_to_apply: BIFFA_HOW,
      _citations: biffaCite(`${BIFFA}/community-buildings-2/`) } },

  { title: 'Biffa Award — Recreation', funder: 'Biffa Award', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${BIFFA}/recreation/`, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: 10000, amount_max: 75000, deadline: null, is_rolling: true,
    eligible_structures: BIFFA_STRUCTURES,
    impact_sectors: ['sport', 'community', 'environment'], target_beneficiaries: ['general_public'],
    niche_tags: ['urban_greening'],
    description: 'Biffa Award Main Grants of £10,000 to £75,000 for projects that benefit people in their free time: play parks, boardwalks, skateparks, woodland walks, nature trails and outdoor gyms, and renovations of sporting clubhouses that serve the wider community like a village hall. Total project cost no more than £200,000, and the site must meet Biffa Award’s two distance tests. Expressions of Interest are rolling.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: BIFFA_WHO,
      what_they_fund: 'Recreation projects: play parks, boardwalks, skateparks, woodland walks, nature trails, outdoor gyms, and sporting clubhouses that attract significant wider weekly group use beyond sport.',
      typical_award: BIFFA_AWARD,
      exclusions: 'Standalone elements of a wider project costing over £200,000; retrospective work; projects crossing into another theme; facilities without at least 104 days of published full public access a year.',
      geographic_focus: 'Within five miles of a significant Biffa operation, or 10 miles of an active Biffa landfill site, and also within 10 miles of a licensed landfill site.',
      decision_timeline: BIFFA_TIMELINE,
      how_to_apply: BIFFA_HOW,
      _citations: biffaCite(`${BIFFA}/recreation/`) } },

  { title: 'Biffa Award — Nature Recovery', funder: 'Biffa Award', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${BIFFA}/rebuilding-biodiversity/`, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: 10000, amount_max: 75000, deadline: null, is_rolling: true,
    eligible_structures: BIFFA_STRUCTURES,
    impact_sectors: ['environment'], target_beneficiaries: ['general_public'],
    niche_tags: ['biodiversity', 'natural_heritage'],
    description: 'Biffa Award Main Grants of £10,000 to £75,000 for projects that directly reintroduce or improve a habitat or species, working towards the Environmental Improvement Plan, Environment Act 2021 targets or a Local Nature Recovery Strategy. Projects need the support of key agencies, experienced delivery partners, strong public access or volunteer involvement, and a full biodiversity management plan. The site must be within 15 miles of a significant Biffa operation and within 10 miles of a licensed landfill site. Expressions of Interest are rolling.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Fully constituted charitable or not-for-profit organisations with no share capital, with the support of key agencies and experienced partners. Not local authorities, councils, nurseries, food banks, hospices, hospitals, day-care centres, rehabilitation units, residential care facilities, allotments or schools and colleges. Owners, or holders of a 10-year lease or landowner agreement.',
      what_they_fund: 'Physical work that directly reintroduces or improves a habitat or species, meeting national environmental commitments or Local Nature Recovery Strategy priorities, with a strong element of public access or inclusion.',
      typical_award: BIFFA_AWARD,
      exclusions: 'Habitat work on land where the applicant plans to sell biodiversity units; research; retrospective work; projects crossing into another theme.',
      geographic_focus: 'Within 15 miles of a significant Biffa operation or active Biffa landfill, and also within 10 miles of a licensed landfill site.',
      decision_timeline: BIFFA_TIMELINE,
      how_to_apply: 'Check both distance tests using the checkers on the theme page, prepare a comprehensive biodiversity management plan (submitted with the Expression of Interest), then submit the Expression of Interest online.',
      _citations: biffaCite(`${BIFFA}/rebuilding-biodiversity/`) } },

  // ── SUEZ Communities Fund, England (GrantScape) ──────────────────────────
  // Held as 9353a0e5 (archived, the SUEZ trust homepage). The England fund has
  // its own GrantScape page and a dated round; the Scotland fund has closed.
  { title: 'SUEZ Communities Fund — England', funder: 'SUEZ Communities Fund (GrantScape)', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: SUEZ, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: 3000, amount_max: 50000, deadline: '2026-11-18', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    impact_sectors: ['community', 'environment', 'sport', 'heritage'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants of £3,000 to £50,000 administered by GrantScape for capital improvements to public amenities within SUEZ funding zones in England (now including sites in Lancashire). Smaller Projects: up to £20,000, total cost under £40,000. Primary Fund: up to £50,000, total cost under £250,000. Examples include village halls, community centres, nature reserves, village greens, playgrounds, cycle paths, sports facilities, country parks and listed historic buildings. The next closing date is midnight on 18 November 2026 (decisions early February 2027), then 10 February 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary organisations, community groups and associations, sports clubs open to the public, local and national charities, parish and town councils, local authorities, and social enterprises and CICs operating on a non-profit-distributing basis. Organisations need a governing document, a bank account in their name, at least three unrelated directors, to be run not for profit, own or hold a lease of at least five years on the site, all consents in place, and all other project funding secured.',
      what_they_fund: 'Capital improvements to public amenities open to the public at least 104 days a year: village halls, nature reserves and conservation, village greens, community centres, playgrounds, cycle paths, sports fields and facilities, country parks, and historic buildings (Grade I places of worship; other buildings Grade I, II* or II or scheduled).',
      typical_award: 'Smaller Projects up to £20,000 (total project cost under £40,000); Primary Fund up to £50,000 (total project cost under £250,000). Overall range £3,000 to £50,000. A Contributing Third Party donation of about £11.50 per £100 of grant releases the funding.',
      exclusions: 'Community shops; restricted-membership clubs; energy or cost saving schemes on their own; new buildings or extensions; core or revenue costs; retrospective work; schools, nurseries and colleges; vehicles; outdoor gyms; car parks; highways; hospitals, hospices and day care; public toilets; allotments and food growing; charity offices and advice centres; land and building purchase.',
      geographic_focus: 'Parts of England within SUEZ funding zones; check the postcode checker. Sites in Lancashire were added on 7 May 2026. The Scotland fund has closed.',
      decision_timeline: 'Normally four rounds a year. Closing midnight 18 November 2026 (decisions early February 2027); then 10 February 2027 (decisions end of April 2027). Late applications roll to the next round.',
      how_to_apply: 'Check the postcode checker and the eligibility criteria, then apply through the GrantScape online application form.',
      _citations: {
        typical_award: { snippet: 'Grants between £3,000 and £50,000 are available.', confidence: 'high', source_url: SUEZ_ELIG },
        open_status: { snippet: 'Closing Date: 18 November 2026, midnight', confidence: 'high', source_url: SUEZ },
        who_can_apply: { snippet: 'Social enterprises and Community Interest Companies operating on a non-profit-distributing basis.', confidence: 'high', source_url: SUEZ_ELIG },
        exclusions: { snippet: 'Applications to construct new buildings or extensions to existing buildings.', confidence: 'high', source_url: SUEZ_ELIG },
      } } },

  // ── Enovert Community Trust ──────────────────────────────────────────────
  { title: 'Enovert Community Trust — Landfill Communities Fund Grants', funder: 'Enovert Community Trust', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: ENOVERT, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: 5000, amount_max: 50000, deadline: '2026-12-04', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    impact_sectors: ['community', 'environment', 'sport', 'heritage'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants from Enovert Community Trust (formerly Cory Environmental Trust in Britain) for community and environmental projects within 10 miles of an Enovert landfill or waste facility in Billingham, Cheltenham, Cirencester, Colchester, Gloucester, Lydney, Middlesbrough or Walsall and North Birmingham: community halls, play areas, green spaces and habitats, sports and recreation facilities, and religious or historic buildings. Grants are usually £5,000 to about £30,000, up to £50,000 for exceptional projects; total project value generally no more than £250,000. Next deadline 4 December 2026 for the January 2027 meeting. Colchester (Bellhouse) closes to new applications in December 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Non-profit-distributing organisations: charity status is not required, but any surplus must further the organisation’s objects and not pay dividends. Sporting organisations must be CASC-registered, a limited company or a registered charity. The facility must be open to the general public at least four evenings or two days a week, or more than 104 days a year.',
      what_they_fund: 'Projects under the Landfill Communities Fund objects: opening up public access to closed land; cleaning up land polluted by past activity; improving, providing or maintaining land or buildings as public amenities (community halls, play areas, skate parks, green spaces, sports and recreation facilities); protecting the environment and biodiversity; and preserving religious buildings or buildings of historical or architectural interest. Energy-efficient designs are looked on favourably.',
      typical_award: 'Usually £5,000 to about £30,000; up to £50,000 for exceptional projects. Total project value generally no more than £250,000; larger projects need at least 60% of funding secured before applying. ' + LCF_CTP,
      exclusions: 'Sites more than 10 miles from an Enovert landfill or waste facility. Applications from areas around the closed Himley, Barling, Greatness and Shortwood sites.',
      geographic_focus: 'Within 10 miles of an Enovert site in Billingham, Cheltenham, Cirencester, Colchester, Gloucester, Lydney, Middlesbrough or Walsall and North Birmingham. Bellhouse (Colchester) closes to new applications in December 2026.',
      decision_timeline: 'Quarterly. Deadline 4 September 2026 for the 20 October meeting; deadline 4 December 2026 for the 19 January 2027 meeting.',
      how_to_apply: 'Download the application form from the Apply For Funding page and send it to the Trust Manager, Angela Haymonds (ahaymonds@enovertct.org, PO Box 3138, Slough SL3 9ZH). Discussing the project first is welcomed.',
      _citations: {
        typical_award: { snippet: 'Enovert’s maximum grant award is in the region of £30,000, with exceptional projects being considered for a grant of up to £50,000.', confidence: 'high', source_url: ENOVERT_FAQ },
        open_status: { snippet: 'Deadline 4 Dec 2026 for meeting on 19 Jan 2027', confidence: 'high', source_url: ENOVERT },
        who_can_apply: { snippet: 'Non-profit distributing You don’t need to be a charity, but any surplus you make must be used to further your organisation’s objects.', confidence: 'high', source_url: ENOVERT_FUND },
        geographic_focus: { snippet: 'Located within 10 miles of a landfill site or waste management facility operated by Enovert Management Limited in Billingham, Cheltenham, Cirencester, Colchester, Gloucester, Lydney, Middlesbrough or Walsall/North Birmingham.', confidence: 'high', source_url: ENOVERT_FUND },
      } } },

  // ── Tarmac Landfill Communities Fund (Derbyshire Environmental Trust) ────
  { title: 'Tarmac Landfill Communities Fund', funder: 'Tarmac (administered by Derbyshire Environmental Trust)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: TARMAC, url_status: 'unchecked',
    location_tag: 'Selected areas', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'environment', 'heritage'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants from Tarmac, administered nationally by Derbyshire Environmental Trust, for community and environmental projects near a Tarmac quarry, waste, cement or lime site that is also within 10 miles of a licensed landfill: reclamation, pollution reduction, public amenities such as play areas, village and community halls and tree planting, biodiversity, and historic buildings. A committee meets normally four times a year. No grant range is published; the Trust sends an application pack once it has confirmed the site is eligible.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Selected areas', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Local not-for-profit groups with a constitution, elected officers and a bank account, with all match funding in place, for projects close to a Tarmac waste, cement and lime or quarrying site and within 10 miles of a licensed landfill site.',
      what_they_fund: 'Reclaiming land, reducing pollution caused by a previous activity, providing or improving public parks and amenities (children’s play areas, village and community halls, tree planting), conserving biodiversity, and maintaining or repairing buildings of historic or architectural interest.',
      typical_award: 'No grant range is published. Successful applications may be funded at any amount up to the requested figure. ' + LCF_CTP,
      exclusions: 'Car parks, road improvements and footpaths beside roads; conferences; vehicles; school-based projects; feasibility studies; allotments; ongoing maintenance.',
      geographic_focus: 'Near a Tarmac quarry, waste, cement or lime site and within 10 miles of a licensed landfill site, anywhere in the UK where Tarmac operates.',
      decision_timeline: 'Rolling. The Tarmac Landfill Communities Fund Committee normally meets four times a year and applicants are told by letter.',
      how_to_apply: 'Email det@derbyshire.gov.uk (or phone 01629 539182 or 01629 538614) with the project site postcode and a couple of lines on the project. The Trust confirms eligibility and sends an application pack.',
      _citations: {
        who_can_apply: { snippet: 'applicants must have a constitution, elected officers and a bank account', confidence: 'high', source_url: TARMAC_PDF },
        what_they_fund: { snippet: 'If your project is near to a Tarmac quarry, waste, cement or lime site you may be eligible to apply for a grant.', confidence: 'high', source_url: TARMAC },
        decision_timeline: { snippet: 'Your application will be considered by the Tarmac Landfill Communities Fund Committee (normally four meetings per annum).', confidence: 'high', source_url: TARMAC_PDF },
      } } },

  // ── Pilgrim Trust strands ────────────────────────────────────────────────
  // Held as one live row (facf81cb, "Preservation & Scholarship", no amount,
  // pointing at /grants/, which now redirects to grants-awarded). Each strand
  // has its own page, grant size and criteria.
  { title: 'Pilgrim Trust — Historic Buildings and Structures', funder: 'Pilgrim Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['capital', 'project'],
    apply_url: `${PILGRIM}/historic-buildings-and-structures/`, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 1000, amount_max: 30000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'scio'],
    impact_sectors: ['heritage', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['built_heritage'],
    description: 'Pilgrim Trust grants to preserve and repair listed historic buildings, structures and architectural features, with special consideration for sustainable conservation and re-use of buildings at risk and of outstanding importance. Grants are generally £1,000 to £30,000 (average about £15,000), sometimes larger, for project costs, staff costs, fees, internships, exploratory work and capital works. The Trust often acts as a stepping-stone funder for early project development and typically funds smaller charities. Stage one is rolling; stage two applications over £5,000 go to quarterly board meetings (2026 cut-offs 9 January, 10 April, 31 July and 2 October).',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities, organisations with exempt charitable status, and recognised public bodies, for UK-based projects that are not complete. Typically smaller charities with less access to resources.',
      what_they_fund: 'Preservation and repair of listed historic buildings, structures and architectural features, especially sustainable conservation and re-use of buildings at risk: initial exploratory and project development work, professional surveys, project and staff costs, fees, internships and capital works. Redundant or closed places of worship seeking a new use apply here.',
      typical_award: 'Generally £1,000 to £30,000, average about £15,000; sometimes larger sums are considered. Grants of £5,000 or less are decided between meetings.',
      exclusions: 'General refurbishment, acquisition costs, renewal of services, new facilities such as kitchens, furniture and fittings, options appraisals and feasibility studies. Like-for-like repairs (roofs, windows) are a lower priority unless they add public benefit. Repair of places of worship open for regular worship. Retrospective grants.',
      geographic_focus: 'UK.',
      decision_timeline: 'Stage one on a rolling basis, response within four weeks. Stage two for grants over £5,000 at quarterly board meetings in March, June, September and November; 2026 cut-offs 9 January, 10 April, 31 July and 2 October. Grants of £5,000 or less decided within four weeks.',
      how_to_apply: 'Take the eligibility quiz, then apply through the Trust’s Flexigrant system: a short Stage one to check suitability, then a full Stage two within 12 months. Sample forms are on the page.',
      _citations: {
        typical_award: { snippet: 'Grant size: Generally, £1,000 to £30,000 (average approx. £15,000). Sometimes larger sums are considered.', confidence: 'high', source_url: `${PILGRIM}/historic-buildings-and-structures/` },
        who_can_apply: { snippet: 'UK registered charities, Organisations with exempt charitable status, Recognised public bodies', confidence: 'high', source_url: PILGRIM_GLANCE },
        decision_timeline: { snippet: 'You may apply at any time. Stage one applications are considered on a rolling basis.', confidence: 'high', source_url: `${PILGRIM}/historic-buildings-and-structures/` },
      } } },

  { title: 'Pilgrim Trust — Conservation of Cultural Heritage', funder: 'Pilgrim Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: `${PILGRIM}/conservation-of-cultural-heritage/`, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 1000, amount_max: 30000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'scio'],
    impact_sectors: ['heritage', 'creative'], target_beneficiaries: ['general_public'],
    niche_tags: ['museums_archives'],
    description: 'Pilgrim Trust grants for the care and conservation of culturally and historically significant collections and objects: works of art, books, ephemera, artefacts and archives. Grants are generally £1,000 to £30,000 (average about £15,000) for project costs including staff, fees, paid internships, exploratory work and conservation. Small and medium museums should first use the Association of Independent Museums scheme, and manuscripts the National Manuscripts Conservation Trust, both part-funded by Pilgrim; apply here only if not eligible for those. Stage one is rolling; stage two over £5,000 at quarterly board meetings.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities, organisations with exempt charitable status, and recognised public bodies, for UK-based work not yet complete, that are not eligible for the AIM or NMCT grant schemes.',
      what_they_fund: 'Conservation of significant collections and objects, including works of art, books, ephemera, artefacts and archives: staff costs, fees, paid internships, initial exploratory work and conservation costs.',
      typical_award: 'Generally £1,000 to £30,000, average about £15,000.',
      exclusions: 'General refurbishment, acquisition costs, renewal of services, interpretation, exhibition or display costs, options appraisals and feasibility studies. Applicants eligible for the AIM or NMCT schemes.',
      geographic_focus: 'UK.',
      decision_timeline: 'Stage one rolling; stage two for grants over £5,000 at quarterly board meetings (2026 cut-offs 9 January, 10 April, 31 July, 2 October). In 2024, 40% of stage one and 72% of stage two applications succeeded.',
      how_to_apply: 'Take the eligibility quiz, then apply through Flexigrant: Stage one first, then Stage two.',
      _citations: {
        typical_award: { snippet: 'Grant size: Generally, £1,000 to £30,000 (average approx. £15,000).', confidence: 'high', source_url: `${PILGRIM}/conservation-of-cultural-heritage/` },
        exclusions: { snippet: 'Grant applicants should only apply to the Pilgrim Trust if they are not eligible for AIM and NMCT’s grant schemes.', confidence: 'high', source_url: `${PILGRIM}/conservation-of-cultural-heritage/` },
      } } },

  // ── Vinehill Trust: three strands ────────────────────────────────────────
  { title: 'Vinehill Trust — Health', funder: 'The Vinehill Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: `${VINEHILL}/health/`, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 10000, amount_max: 100000, deadline: '2027-06-30', is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    impact_sectors: ['health', 'environment'], target_beneficiaries: ['people_in_poverty', 'disabled_people', 'rural_communities'],
    niche_tags: ['public_health', 'urban_greening'],
    description: 'One-off Vinehill Trust grants of typically £10,000 to £100,000 for UK projects delivering healthcare rather than general wellbeing. Permanent focus: acute conditions such as pre-hospital care, life-saving equipment and training, and suicide prevention. The 2027 cycle, open now until 30 June 2027, adds rehabilitation or aftercare after physical trauma or surgery; wellbeing through creating or enhancing green spaces and urban wildlife habitats; and oral and dental health outreach, particularly for homeless and vulnerable people and rural areas. Projects must benefit people with limited access to essential healthcare. The Trust funds specific projects, not core costs, and no more than 75% of a project.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK-registered charities, non-profits and CICs, for UK projects that directly benefit UK residents and focus on healthcare delivery. Public sector bodies such as the NHS only in partnership with a non-profit lead. New charities and CICs should wait until their first audited or independently examined accounts are available.',
      what_they_fund: 'Direct healthcare interventions with measurable clinical outcomes: pre-hospital care, life-saving equipment, training and interventions, suicide prevention; and in the 2027 cycle, rehabilitation and aftercare after trauma or surgery, health-promoting green spaces and urban wildlife habitats, and oral and dental outreach for homeless, vulnerable and rural people. Staff costs directly tied to frontline delivery are allowed.',
      typical_award: 'Typically one-off grants of £10,000 to £100,000, covering no more than 75% of the project cost excluding VAT.',
      exclusions: 'Entertainment, arts or general wellbeing projects; remote services with no in-person or clinical component; awareness-raising without direct intervention; academic research; management salaries and overheads; lobbying; capital building works not supporting a direct health intervention; core running costs; retrospective funding; organisations with more than 12 months of unrestricted reserves without good reason; beneficiaries selected by race or ethnicity without an evidenced medical rationale.',
      priorities: 'People affected by poverty, isolation, disability or serious health disadvantage; patients with rare or under-recognised conditions; children and older people with mobility limitations or post-discharge needs; underserved and rural communities.',
      geographic_focus: 'UK.',
      decision_timeline: '2027 cycle open now until 30 June 2027; projects must start within twelve months of receiving funding.',
      how_to_apply: 'Download the application form from the Health page and submit it with the latest audited or independently examined accounts, a clear budget and delivery plan.',
      _citations: {
        typical_award: { snippet: 'We typically award one-off grants of £10,000-£100,000.', confidence: 'high', source_url: VINEHILL },
        open_status: { snippet: '2027 cycle (applications now open – apply any time until 30 June 2027)', confidence: 'high', source_url: `${VINEHILL}/health/` },
        who_can_apply: { snippet: 'We accept applications from UK-registered charities, non-profits, or CICs.', confidence: 'high', source_url: `${VINEHILL}/health/` },
      } } },

  { title: 'Vinehill Trust — Music (Choral and Organ)', funder: 'The Vinehill Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: `${VINEHILL}/music/`, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 10000, amount_max: 100000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'scio'],
    impact_sectors: ['creative', 'young_people', 'education'], target_beneficiaries: ['children', 'young_people'],
    niche_tags: ['music'],
    description: 'Vinehill Trust grants, typically £10,000 to £100,000, to build the UK’s choral and organ traditions for children and young people, in schools, churches, cathedrals and the wider community: sustained choral programmes with pathways to further training, choral and organ scholarships, youth choir or organ programmes run by professional adult choirs or summer schools, self-organised cathedral residencies including young singers, bursaries for recognised choral courses, and keyboard instruments used for teaching. Also restoration of historically or musically valuable organs with a commitment to teaching students to play.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charitable, educational and ecclesiastical organisations across the UK, including schools, churches, cathedrals and community choirs.',
      what_they_fund: 'Choral singing programmes for children and young people, scholarship and bursary schemes, youth choir and organ programmes, cathedral residencies, keyboard instruments and teaching materials, and restoration of historic organs that will be used to teach students.',
      typical_award: 'Typically one-off grants of £10,000 to £100,000; the Trust does not generally expect to be the sole funder and funds no more than 75% of a project.',
      exclusions: 'Individual singing or instrumental lessons; choir tours and recordings; private choir school fees; long-term endowments; cosmetic, speculative or routine organ work; core running costs; retrospective funding.',
      geographic_focus: 'UK.',
      decision_timeline: 'Applications accepted at any time.',
      how_to_apply: 'Download the choral singing or organ application form from the Music page and submit it with the latest accounts. Organ applications need a statement of need and significance, faculty evidence, an organ adviser’s report and a signed contract with an accredited organ builder.',
      _citations: {
        typical_award: { snippet: 'We typically award one-off grants of £10,000-£100,000.', confidence: 'high', source_url: VINEHILL },
        what_they_fund: { snippet: 'support and build the United Kingdom’s choral and organ traditions, whether in the context of school, church, cathedral, or the wider community', confidence: 'high', source_url: `${VINEHILL}/music/` },
        who_can_apply: { snippet: 'The Vinehill Trust makes grants to charitable, educational and ecclesiastical organisations across the United Kingdom', confidence: 'high', source_url: VINEHILL },
      } } },

  { title: 'Vinehill Trust — Heritage (Building Crafts)', funder: 'The Vinehill Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'capital'],
    apply_url: `${VINEHILL}/heritage/`, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 10000, amount_max: 100000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'scio'],
    impact_sectors: ['heritage', 'employment'], target_beneficiaries: ['general_public'],
    niche_tags: ['built_heritage', 'crafts', 'vocational'],
    description: 'Vinehill Trust grants, typically £10,000 to £100,000, for historic building restoration projects that provide employment and training in building crafts, from stonemasonry, joinery and ornamental plasterwork to carving, graining, stucco, mural restoration, leadwork, thatching, gilding, stained glass and tile restoration. Also restoration of historic fixtures, curtilage structures and structures in designed landscapes, especially with heritage skills training. Particular interest in projects in less affluent areas that can catalyse socio-economic improvement. Twentieth-century buildings of distinction count as historic.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charitable, educational and ecclesiastical organisations across the UK restoring historic buildings with public access.',
      what_they_fund: 'Historic building restoration that provides employment and training in traditional building crafts, and restoration of historic fixtures, fittings, curtilage structures and designed-landscape structures, especially with heritage skills training.',
      typical_award: 'Typically one-off grants of £10,000 to £100,000, no more than 75% of the project cost.',
      exclusions: 'Movable heritage such as trains and boats; heritage crafts unconnected to buildings; privately owned buildings without public access; routine repair and maintenance; capital appeals for construction projects; feasibility studies; core running costs.',
      priorities: 'Projects in less affluent areas that can act as a catalyst for socio-economic improvement.',
      geographic_focus: 'UK.',
      decision_timeline: 'Applications accepted at any time. Before an offer the Trust needs the restoration methodology and evidence of planning and listed building consents.',
      how_to_apply: 'Download the application form from the Heritage page and submit it with the latest accounts.',
      _citations: {
        typical_award: { snippet: 'We typically award one-off grants of £10,000-£100,000.', confidence: 'high', source_url: VINEHILL },
        what_they_fund: { snippet: 'We help fund historic building restoration projects that provide employment and training in building crafts', confidence: 'high', source_url: `${VINEHILL}/heritage/` },
      } } },

  // ── Found through the Dudley CVS September 2026 funding bulletin ─────────
  { title: 'David Riddell Memorial CIO — Suicide Prevention Grants 2026/27', funder: 'David Riddell Memorial CIO', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'core_costs'],
    apply_url: RIDDELL, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 5000, amount_max: 25000, deadline: '2026-10-31', is_rolling: false,
    max_org_income: 1000000,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee'],
    impact_sectors: ['mental_health'], target_beneficiaries: ['mental_health'],
    niche_tags: [],
    description: 'Grants of £5,000 to £25,000 from the David Riddell Memorial CIO for suicide awareness and prevention programmes run for charitable purposes, where the grant will make a real difference. Applications can include full cost recovery, and core costs may be considered where the organisation’s mission fits. Smaller charities are particularly encouraged; charities with income over £1 million or more than 12 months’ unrestricted reserves are unlikely to succeed. Innovative projects are prioritised. The 2026/27 window runs from 1 September to 31 October 2026, with shortlisting by the end of November and awards in March 2027.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities, including CIOs, and community interest companies limited by guarantee registered in the UK. Smaller charities particularly encouraged; charities with income over £1 million, or unrestricted reserves over 12 months, are unlikely to be successful.',
      what_they_fund: 'Suicide awareness and prevention programmes run for charitable purposes, including full cost recovery; core costs where the organisation’s mission meets the criteria. Priority to innovative projects.',
      typical_award: '£5,000 to £25,000.',
      exclusions: 'Work that is not suicide awareness or prevention. Organisations that are not charities, CIOs or CICs limited by guarantee.',
      geographic_focus: 'UK.',
      decision_timeline: 'Applications 1 September to 31 October 2026, reviewed together. Shortlisted applicants told by the end of November 2026 and submit a second-round application by the end of December; outcomes by the end of February 2027, awards in March 2027.',
      how_to_apply: 'Complete the first-round online form on the Grants page in one sitting (it cannot be saved). Shortlisted applicants are contacted for more information and may have a visit or video call with a trustee.',
      _citations: {
        typical_award: { snippet: 'The trustees will make discretionary grants of between £5,000 and £25,000 where they believe that their contribution will make a real difference to suicide awareness or prevention.', confidence: 'high', source_url: RIDDELL },
        open_status: { snippet: 'The window for applications will be from 1 September to 31 October 2026.', confidence: 'high', source_url: RIDDELL },
        who_can_apply: { snippet: 'Applications will only be considered from charities, including CIOs, and Community Interest Companies limited by guarantee registered in the United Kingdom.', confidence: 'high', source_url: RIDDELL },
        max_org_income: { snippet: 'Charities with income of more than £1 million, or with unrestricted reserves of more than 12 months, are unlikely to be successful.', confidence: 'med', source_url: RIDDELL },
      } } },

  { title: 'Tree Council — Trees Outside Woodland Fund 2026/27', funder: 'The Tree Council (with Defra)', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: TOW, url_status: 'unchecked',
    location_tag: 'England', is_local: false, amount_min: 10000, amount_max: 40000, deadline: '2026-10-31', is_rolling: false,
    min_org_income: 100000,
    eligible_structures: ['registered_charity', 'cio'],
    impact_sectors: ['environment', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['urban_greening', 'biodiversity', 'climate'],
    description: 'Grants of £10,000 to £40,000 per application from The Tree Council and Defra to establish trees outside woodland in England, creating or enhancing green spaces with a range of tree sizes, species and planting types, for the 2026/27 planting season. Funding covers trees and capital items such as sustainable guards, non-plastic ties, stakes, biodegradable mulch, biochar and necessary fencing. Projects must show clear community benefit and participation, and biodiversity gain; trees must be from Plant Healthy certified nurseries or carry a Ready to Plant voucher. Open to registered charities with income over £100,000 and to local authorities, until 31 October 2026 or until the funding is allocated; applications are reviewed in the order received.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'England', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities delivering the project in England with an annual income or turnover of more than £100,000, and local authorities in England.',
      what_they_fund: 'Planting trees outside woodland to create or enhance green spaces: the trees and supporting capital items such as sustainable tree guards, non-plastic ties, stakes, organic or biodegradable mulch, biochar and fencing.',
      typical_award: '£10,000 to £40,000 per application.',
      exclusions: 'Projects outside England. Trees not sourced from Plant Healthy certified nurseries or without a Ready to Plant assessment voucher. Charities with income of £100,000 or less.',
      geographic_focus: 'England only.',
      decision_timeline: 'Open until 31 October 2026 or until all funding is allocated; applications are reviewed in the order received, so early applications are strongly encouraged. One-stage application.',
      how_to_apply: 'Read the Trees Outside Woodland Fund Application Guidance and FAQs, use the project budget template, then apply through the online application form on the fund page. Questions to grants@treecouncil.org.uk.',
      _citations: {
        typical_award: { snippet: 'Grants of between £10,000 and £40,000 for trees and supporting capital items are available, per application.', confidence: 'high', source_url: TOW },
        who_can_apply: { snippet: 'Registered charities planning to deliver the project in England, with an annual income or turnover of more than £100,000.', confidence: 'high', source_url: TOW },
        open_status: { snippet: 'The fund will remain open until 31 October 2026, or until all funding has been allocated.', confidence: 'high', source_url: TOW },
      } } },

  // ── GrantScape community funds (none held before this batch) ─────────────
  // Ørsted offshore wind funds: revenue and capital, up to two years, charities
  // and non-profit CICs. Each has its own criteria page quoted below.
  { title: 'Hornsea 3 Community Fund (Ørsted)', funder: 'Ørsted (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['project', 'capital', 'multi_year'],
    apply_url: `${GS}/hornsea-3-community-fund/`, url_status: 'unchecked',
    location_tag: 'Norfolk, Suffolk', is_local: true, amount_min: 500, amount_max: 75000, deadline: '2026-12-02', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment', 'sport', 'health'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Ørsted’s community fund for coastal and cable-route communities in Norfolk and Suffolk near the Hornsea 3 offshore wind farm, about £700,000 a year for ten years. Small grants of £500 to £5,000 and main grants of £5,001 to £75,000 for community buildings and facilities, community activities and services (health and wellbeing, isolation, cohesion, young and older people), environmental and green space projects, and sports, recreation and play. Revenue costs can be funded for up to two years alongside capital in one application. Main grants need at least 20% match funding (in-kind counts, need not be secured yet). Two rounds a year: next closing midnight 2 December 2026, then 2 June 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Norfolk, Suffolk', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary and community groups and local charities, parish and town councils, local authorities applying on behalf of a community, and social enterprises and CICs operating on a non-profit-distributing basis with at least three unrelated directors. Applicants need a governing document and a bank account in the organisation’s name.',
      what_they_fund: 'Community buildings and facilities (village halls, community centres, museums, heritage centres, community cafes, especially lower-carbon transitions); community activities and services; environmental, green and public open space projects; sports, recreation and play. Revenue for up to two years and capital in the same application.',
      typical_award: 'Small grants £500 to £5,000 (no match funding needed); main grants £5,001 to £75,000 (at least 20% match funding, in-kind allowed).',
      exclusions: 'Commercial organisations; statutory duties; religious or party-political projects; religious buildings unless for wider community use; schools unless applied for by a separate body for community use; restricted-membership clubs; kit and uniforms; projects benefiting individuals; vehicles and community transport; retrospective costs; toilets and car parks; one-off events and festivals; memorials and public art; building purchase; stand-alone feasibility and asset transfer costs.',
      geographic_focus: 'Coastal and cable-route communities in Norfolk and Suffolk within the fund boundary, including the tidal zones in line with them; check the interactive map.',
      decision_timeline: 'Two rounds a year. Closing midnight 2 December 2026 (decisions early March 2027); then 2 June 2027 (decisions end of August 2027). Unsuccessful applicants skip one deadline before reapplying.',
      how_to_apply: 'Check the project location on the fund map, read the full criteria, then apply through the GrantScape online application.',
      _citations: {
        typical_award: { snippet: 'Small grants between £500 and £5,000. Main grants between £5,001 and £75,000', confidence: 'high', source_url: `${GS}/hornsea-3-community-fund/hornsea-3-criteria/` },
        who_can_apply: { snippet: 'Social Enterprises and Community Interest Companies operating on a non-profit-distributing basis', confidence: 'high', source_url: `${GS}/hornsea-3-community-fund/hornsea-3-criteria/` },
        open_status: { snippet: 'Closing Date: 2 December 2026, midnight', confidence: 'high', source_url: `${GS}/hornsea-3-community-fund/` },
        spend: { snippet: 'For projects involving revenue costs, applicants can apply for funding for up to two years.', confidence: 'high', source_url: `${GS}/hornsea-3-community-fund/hornsea-3-criteria/` },
      } } },

  { title: 'Hornsea 3 Legacy Fund (Ørsted) — Inspired by Green', funder: 'Ørsted (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${GS}/hornsea-3-legacy-fund/`, url_status: 'unchecked',
    location_tag: 'Norfolk, Suffolk', is_local: true, amount_min: 100000, amount_max: 100000, deadline: '2026-12-02', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment'], target_beneficiaries: ['general_public'],
    niche_tags: ['climate', 'energy', 'biodiversity'],
    description: 'A single £100,000 grant each year from Ørsted’s Hornsea 3 fund for one flagship capital project in the Norfolk and Suffolk fund area that is ‘Inspired by Green’: reducing its carbon footprint and making a positive environmental impact. The project must be either a community building or facility (village halls, community centres, sports centres, museums, heritage centres; greener operations encouraged) or an environmental or public open space project. Total project cost more than £100,000 and no more than £1 million. The project should start within six months and finish within 24 months of award. One deadline a year: midnight 2 December 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Norfolk, Suffolk', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary and community groups and local charities, parish and town councils, local authorities applying on behalf of a community, and social enterprises and CICs operating on a non-profit-distributing basis, with a governing document and a bank account with at least two signatories.',
      what_they_fund: 'One flagship capital project a year that is ‘Inspired by Green’: community buildings and facilities, or environmental, green and public open space projects such as habitat and species conservation.',
      typical_award: 'A single grant of £100,000 a year. Total project cost must be over £100,000 and under £1 million; match funding is expected in practice.',
      exclusions: 'Projects costing £100,000 or less, or over £1 million; commercial organisations; projects outside the fund area. A successful Legacy application cannot also receive a Community Fund grant in the same round. Successful groups wait two years before reapplying.',
      geographic_focus: 'The Hornsea 3 fund area in Norfolk and Suffolk; check the interactive map.',
      decision_timeline: 'One deadline a year: midnight 2 December 2026, decisions early March 2027. Late applications cannot be considered.',
      how_to_apply: 'Check the fund map, then submit the Legacy Fund application through GrantScape. A separate Community Fund application can be made for the same project as a contingency.',
      _citations: {
        typical_award: { snippet: 'The Hornsea 3 Legacy Fund provides a single £100,000 grant each year for a flagship capital project that delivers long-term benefits under the theme Inspired by Green.', confidence: 'high', source_url: `${GS}/hornsea-3-legacy-fund/` },
        exclusions: { snippet: 'If your total project cost is less than £100,000 you are not eligible to apply.', confidence: 'high', source_url: `${GS}/hornsea-3-legacy-fund/` },
      } } },

  { title: 'East Coast Community Fund (Ørsted)', funder: 'Ørsted (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['project', 'capital', 'multi_year'],
    apply_url: `${GS}/eastcoastcommunityfund/`, url_status: 'unchecked',
    location_tag: 'Yorkshire, Lincolnshire', is_local: true, amount_min: 1000, amount_max: 50000, deadline: '2027-02-03', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment', 'sport', 'health'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Ørsted’s community fund for coastal communities on the Yorkshire and Lincolnshire coasts near the Hornsea 1 and Race Bank offshore wind farms, about £465,000 a year for 20 years. Small grants of £1,000 to £10,000 and main grants of £10,001 to £50,000 for community buildings and facilities (including energy efficiency), community activities and services, environmental and open space projects, and sports, recreation and play. Revenue for up to two years and capital in the same application; main grants need at least 20% match funding. Two rounds a year: next closing midnight 3 February 2027, then 4 August 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Yorkshire, Lincolnshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary and community groups and charities, parish and town councils, local authorities working with community organisations on community-led projects, and social enterprises and CICs operating on a non-profit-distributing basis with at least three unrelated directors.',
      what_they_fund: 'Community buildings and facilities, community activities and services (health and wellbeing, isolation, cohesion, young and older people, local clubs), environmental and public open space projects, and sports, recreation and play. Revenue for up to two years and capital.',
      typical_award: 'Small grants £1,000 to £10,000; main grants £10,001 to £50,000 with at least 20% match funding (in-kind allowed, need not be secured at application).',
      exclusions: 'Commercial organisations; statutory duties; religious or party-political projects; schools unless via a separate body; restricted-membership clubs; kit; individual benefit; retrospective costs; toilets and car parks; allotments; one-off events and festivals; memorials and public art; land and building purchase; stand-alone feasibility; asset transfer costs.',
      geographic_focus: 'Coastal communities on the Yorkshire and Lincolnshire coasts within the fund boundary; check the interactive map.',
      decision_timeline: 'Two rounds a year: closing midnight 3 February 2027 (decisions end of April 2027); 4 August 2027 (decisions end of October 2027).',
      how_to_apply: 'Check the location on the fund map, read the full criteria and decision process, then apply through the GrantScape online application.',
      _citations: {
        typical_award: { snippet: 'a) Small grants between £1,000 and £10,000 b) Main grants between £10,001 and £50,000', confidence: 'high', source_url: `${GS}/eastcoastcommunityfund/east-coast-community-fund-full-criteria/` },
        open_status: { snippet: 'Closing Date: 3 February 2027, midnight', confidence: 'high', source_url: `${GS}/eastcoastcommunityfund/` },
        who_can_apply: { snippet: 'Voluntary and community groups, and charities', confidence: 'high', source_url: `${GS}/eastcoastcommunityfund/east-coast-community-fund-full-criteria/` },
      } } },

  { title: 'Walney Extension Community Fund (Ørsted)', funder: 'Ørsted (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['project', 'capital', 'multi_year'],
    apply_url: `${GS}/walney-extension-community-fund/`, url_status: 'unchecked',
    location_tag: 'Cumbria, Lancashire', is_local: true, amount_min: 500, amount_max: 50000, deadline: '2027-01-08', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment', 'sport', 'health'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Ørsted’s community fund for coastal communities in Cumbria and Lancashire near the Walney Extension offshore wind farm, about £600,000 a year. Small grants of £500 to £10,000 and main grants of £10,001 to £50,000 for community facilities (including energy efficiency), nature conservation and green space, community activities and services (health and wellbeing, community arts, equipment for local clubs), and sports, recreation and play. Revenue for up to two years and capital in one application; main grants need 20% match funding. Two rounds a year: next closing midnight 8 January 2027, then 23 June 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Cumbria, Lancashire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary and community groups and local charities, parish and town councils, local authorities applying on behalf of a community group, and social enterprises and CICs operating on a non-profit-distributing basis with at least three unrelated directors.',
      what_they_fund: 'Community facilities and energy efficiency; nature conservation and public green space (parks, reserves, woodland, wildflowers, coastal habitat); community activities and services including health and wellbeing and community arts; sports, recreation and play. Collaborative working is looked on favourably.',
      typical_award: 'Small grants £500 to £10,000; main grants £10,001 to £50,000 with at least 20% match funding.',
      exclusions: 'Commercial organisations; statutory responsibilities; religious or party-political projects; schools unless via a separate body for community use; restricted-membership clubs; individual benefit; retrospective costs; vehicles and community transport; toilets and car parks; one-off events, festivals and trips; land and building purchase; stand-alone feasibility; sub-funds; consumables for core activities; utility bills; public art without clear community benefit.',
      geographic_focus: 'Coastal communities in Cumbria and Lancashire within the fund boundary, including tidal zones; check the interactive map.',
      decision_timeline: 'Two rounds a year: closing midnight 8 January 2027 (decisions end of March 2027); 23 June 2027 (decisions end of September 2027).',
      how_to_apply: 'Check the location on the fund map, read the full criteria, then apply through the GrantScape online application.',
      _citations: {
        typical_award: { snippet: 'a) Small grants between £500 and £10,000 b) Main grants between £10,001 and £50,000', confidence: 'high', source_url: `${GS}/walney-extension-community-fund/walney-extension-community-fund-criteria/` },
        open_status: { snippet: 'Closing Date: 8 January 2027, midnight', confidence: 'high', source_url: `${GS}/walney-extension-community-fund/` },
      } } },

  // Landfill Communities Fund distributors administered by GrantScape.
  { title: 'Augean North Community Fund', funder: 'Augean (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${GS}/augean-north-community-fund/`, url_status: 'unchecked',
    location_tag: 'Stockton-on-Tees', is_local: true, amount_min: 10000, amount_max: 100000, deadline: '2026-12-09', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment', 'sport'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants from Augean North, about £600,000 a year, for capital improvements to public amenities within five miles of the Port Clarence landfill site in Stockton-on-Tees (priority within 2.5 miles). Normally £10,000 minimum, up to £100,000. The amenity must be open to the public at least four evenings or two days a week, or 104 days a year. Two rounds a year: next closing midnight 9 December 2026, then 9 June 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Stockton-on-Tees', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary organisations, community groups and associations, sports clubs open to the public, local and national charities, parish, community and town councils, local authorities, and not-for-profit social enterprises and CICs. The organisation must own or lease the project site.',
      what_they_fund: 'Capital improvements to public amenities eligible under the Landfill Communities Fund, open to the public as ENTRUST defines.',
      typical_award: 'Normally a minimum of £10,000; the maximum is £100,000. ' + LCF_CTP,
      exclusions: 'Projects more than five miles from the Port Clarence landfill; amenities without the required public access. Groups must complete a funded project before applying again.',
      geographic_focus: 'Within five miles of the Port Clarence landfill site, Stockton-on-Tees; priority within 2.5 miles.',
      decision_timeline: 'Two rounds a year: closing midnight 9 December 2026 (decisions early March 2027); 9 June 2027 (decisions end of August 2027).',
      how_to_apply: 'Check the location on the fund map, then apply through the GrantScape online application.',
      _citations: {
        typical_award: { snippet: 'Normally the minimum grant is £10,000. The maximum you can apply for is £100,000.', confidence: 'high', source_url: `${GS}/augean-north-community-fund/` },
        geographic_focus: { snippet: 'Projects must be located within 5 miles of the Port Clarence landfill site', confidence: 'high', source_url: `${GS}/augean-north-community-fund/` },
      } } },

  { title: 'Augean South Community Fund', funder: 'Augean (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${GS}/augean-south-community-fund/`, url_status: 'unchecked',
    location_tag: 'Northamptonshire, Cambridgeshire', is_local: true, amount_min: null, amount_max: 50000, deadline: '2026-11-11', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment', 'sport'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants from Augean, about £500,000 a year, for capital improvements to public amenities within 10 miles of its King’s Cliffe (Northamptonshire) or Thornhaugh (near Peterborough) landfill sites. Maximum grant £50,000. The applicant must own or lease the site with at least five years remaining and have completed any earlier Augean-funded project. Two rounds a year: next closing midnight 11 November 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Northamptonshire, Cambridgeshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary organisations, community groups and associations, sports clubs open to the public, local and national charities, parish, community and town councils, local authorities, and not-for-profit social enterprises and CICs with at least three unrelated directors; with a governing document, a bank account, and a lease of at least five years on the site.',
      what_they_fund: 'Capital improvements to public amenities eligible under the Landfill Communities Fund.',
      typical_award: 'Up to £50,000. ' + LCF_CTP,
      exclusions: 'Projects more than 10 miles from King’s Cliffe or Thornhaugh landfill; applicants with an unfinished Augean-funded project.',
      geographic_focus: 'Within 10 miles of the King’s Cliffe landfill (Northamptonshire) or the Thornhaugh landfill (Cambridgeshire, near Peterborough).',
      decision_timeline: 'Two rounds a year. Closing midnight 11 November 2026, decisions early February 2027.',
      how_to_apply: 'Check the location on the fund map and the criteria, then apply through the GrantScape online application.',
      _citations: {
        typical_award: { snippet: 'The maximum grant available is £50,000.', confidence: 'high', source_url: `${GS}/augean-south-community-fund/` },
        open_status: { snippet: 'Closing Date: 11 November 2026, midnight', confidence: 'high', source_url: `${GS}/augean-south-community-fund/` },
      } } },

  { title: 'Mick George Community Fund', funder: 'Mick George Ltd (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${GS}/mick-george-community-fund/`, url_status: 'unchecked',
    location_tag: 'Bedfordshire, Cambridgeshire, Lincolnshire, Northamptonshire, Norfolk, Rutland', is_local: true, amount_min: 10000, amount_max: 30000, deadline: '2027-03-03', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment', 'sport'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants of £10,000 to £30,000 from Mick George Ltd, about £200,000 a year, for capital improvements to public amenities near its landfill and waste sites in parts of Bedfordshire, Cambridgeshire, Lincolnshire, Northamptonshire, Norfolk and Rutland. Total project cost must be under £100,000. The applicant must own or lease the site with at least five years remaining, have all consents and all other funding secured. Two rounds a year; next closing midnight 3 March 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Bedfordshire, Cambridgeshire, Lincolnshire, Northamptonshire, Norfolk, Rutland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary organisations, community groups and associations, sports clubs open to the public, local and national charities, parish, community and town councils, local authorities, and not-for-profit social enterprises and CICs with at least three unrelated directors; run not for profit, with a governing document, a bank account, a lease of at least five years, all consents and all other funding in place.',
      what_they_fund: 'Capital improvements to public amenities near Mick George landfill and waste treatment sites, eligible under the Landfill Communities Fund.',
      typical_award: '£10,000 to £30,000, for projects with a total cost under £100,000. ' + LCF_CTP,
      exclusions: 'Projects with a total cost of £100,000 or more; sites outside the eligible areas.',
      geographic_focus: 'Parts of Bedfordshire, Cambridgeshire, Lincolnshire, Northamptonshire, Norfolk and Rutland near Mick George sites; check the postcode checker.',
      decision_timeline: 'Two rounds a year. Next closing midnight 3 March 2027, decisions end of April 2027.',
      how_to_apply: 'Complete the pre-application questionnaire, check the criteria and postcode, then apply through GrantScape.',
      _citations: {
        typical_award: { snippet: 'The Mick George Community Fund provides grants of between £10,000 and £30,000.', confidence: 'high', source_url: `${GS}/mick-george-community-fund/` },
        exclusions: { snippet: 'Organisations can only apply for a grant if their total project cost is less than £100,000.', confidence: 'high', source_url: `${GS}/mick-george-community-fund/` },
      } } },

  { title: 'Transwaste Community Fund', funder: 'Transwaste Recycling and Aggregates (administered by GrantScape)', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: `${GS}/transwaste-community-fund/`, url_status: 'unchecked',
    location_tag: 'Fleetwood', is_local: true, amount_min: 10000, amount_max: 40000, deadline: '2027-01-08', is_rolling: false,
    eligible_structures: GS_STRUCTURES,
    impact_sectors: ['community', 'environment', 'sport'], target_beneficiaries: ['general_public'],
    niche_tags: ['neighbourhood'],
    description: 'Landfill Communities Fund grants of £10,000 to £40,000 from Transwaste Recycling and Aggregates for capital improvement projects at a single site within 2.5 miles of the Jameson Road landfill near Fleetwood, Lancashire (priority within 1.5 miles). About £200,000 to £250,000 a year. Two rounds a year: next closing midnight 8 January 2027, then 7 July 2027. The page also gives £50,000 as the most that can be requested; the headline range is £10,000 to £40,000.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Fleetwood', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary organisations, community groups and associations, sports clubs open to the public, local and national charities, parish, community and town councils, local authorities, and not-for-profit social enterprises and CICs with at least three unrelated directors; run not for profit, with a governing document, a bank account in the organisation’s name, and ownership or a lease of at least five years on the project site.',
      what_they_fund: 'Capital improvements to public amenities at one identified site, such as village halls, nature reserves and conservation, and village greens.',
      typical_award: '£10,000 to £40,000 per the fund summary (the body text says the maximum request is £50,000). ' + LCF_CTP,
      exclusions: 'Projects at multiple sites; sites more than 2.5 miles from the Jameson Road landfill.',
      geographic_focus: 'Within 2.5 miles of the Jameson Road landfill near Fleetwood; priority within 1.5 miles.',
      decision_timeline: 'Two rounds a year: closing midnight 8 January 2027 (decisions end of March 2027); 7 July 2027 (decisions end of September 2027).',
      how_to_apply: 'Check the eligibility map and criteria, then apply through the GrantScape online application.',
      _citations: {
        typical_award: { snippet: 'Transwaste Recycling and Aggregates Limited provides grants of £10,000 to £40,000, through the Landfill Communities Fund, for eligible projects located within 2.5 miles of Jameson Road Landfill Site.', confidence: 'high', source_url: `${GS}/transwaste-community-fund/` },
        open_status: { snippet: 'Closing Date: 8 January 2027, midnight', confidence: 'high', source_url: `${GS}/transwaste-community-fund/` },
      } } },
]

// Live rows found wrong while checking held funders. NOT applied by the stage
// script: changing a live row is user-visible, so these wait for Paul.
export const PROPOSED_LIVE_FIXES = [
  { id: '60206220-abaa-45e2-9534-bc6d41e94940', title: 'Trust for London — Poverty & Inequality Grants',
    why: 'Live with no amount and is_rolling false. The 2026 funding guidelines say grants normally £40,000 to £80,000 a year for up to five years, not typically above £300,000 in total, project or unrestricted, with no deadlines. funder_brief.typical_award reads "Not stated in current guidance". The brief sits at ai_enrich trust, so a system-source write would be refused; this needs a hand edit.',
    fields: { amount_min: 40000, amount_max: 300000, is_rolling: true, funding_subtypes: ['project', 'unrestricted', 'multi_year'] },
    citation: { snippet: 'We can fund work for up to five years and normally our grants range from £40,000 to £80,000 a year. We don’t typically expect to make grants above £300,000 in total.', source_url: TFL_GUIDE } },
  { id: '8f8bc717', title: 'JRCT — Rights & Justice Programme',
    why: 'Live with no deadline, but new applicants had to pass an expression of interest by 13 July 2026 and round two closed on 2 September 2026. The 2027 dates are not yet published. Should be between rounds, not live.',
    fields: { pipeline_state: 'between_rounds_scheduled', is_active: false },
    citation: { snippet: 'Round two ... Wednesday, September 2, 2026, 10am*', source_url: 'https://www.jrct.org.uk/when-to-apply' } },
]
