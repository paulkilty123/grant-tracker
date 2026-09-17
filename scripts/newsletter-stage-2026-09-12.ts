// Fifteen funds from a 9 September 2026 funding newsletter that the catalogue
// did not hold, staged on Paul's "go" (12 Sept 2026). Every page quoted was
// fetched in the session by WebFetch or curl with a browser user agent; no
// model call. Two pages could not be read (Britford Bridge Trust sits behind a
// verification wall; the Elmgrant "How to apply" page is a 404), and those
// rows carry only what the readable pages state. Dedup by funder and host ran
// in SQL before any row was written: siblings exist for Creative Scotland,
// Dorset CF, National Churches Trust and Arts Council NI, no exact duplicates.
//
//   npx tsx --env-file=.env.local scripts/newsletter-stage-2026-09-12.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:newsletter-2026-09-09'
const TODAY = '2026-09-12'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string; pipeline_state?: string }
const NEW: Row[] = [
  { title: 'ECB County Grants Fund 2026', funder: 'England and Wales Cricket Board', funder_type: 'other',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: 'https://www.ecb.co.uk/play/club-support/club-funding/county-grant-fund', url_status: 'unchecked',
    location_tag: 'England and Wales', is_local: false, amount_min: 1000, amount_max: 15000, deadline: '2026-09-30', is_rolling: false,
    eligible_structures: ['unincorporated', 'registered_charity', 'cio', 'ltd_guarantee'], impact_sectors: ['sport', 'community'], target_beneficiaries: ['general_public', 'women_girls', 'disabled_people'],
    description: 'Capital grants of £1,000 to £15,000 per application from the England and Wales Cricket Board for ECB-affiliated cricket clubs, for welcoming environments (social spaces, toilets, catering, access), non-turf pitches and practice areas, and changing facilities. Larger changing facility projects over £30,000 can receive up to £50,000. Priority to clubs with women\'s, girls\' or disability cricket. Open 1 February to 30 September 2026, or until funds are allocated.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'England and Wales', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'All ECB affiliated cricket clubs in England and Wales. Priority goes to clubs with women\'s sections, girls\' sections or disability cricket programmes, or taking part in named ECB programmes in 2025/2026.',
      what_they_fund: 'Three categories: creating welcoming environments (social spaces, toilets, catering, access, digitising), enhanced playing facilities (non-turf pitches and practice areas), and enhanced changing facilities (refurbishment, showers, lockers).',
      typical_award: '£1,000 minimum to £15,000 maximum per application; changing facility projects over £30,000 can receive grants of up to £50,000.',
      exclusions: 'Non-turf pitch projects must come with a full warranty from the supplier for a named ECB Approved NTP System. Clubs not affiliated to the ECB.',
      decision_timeline: 'The scheme is open to applications from 1 February to 30 September 2026, or until the fund is allocated.',
      how_to_apply: 'Download and read the 2026 County Grants Fund guidance notes, then register and apply through ECB IMS.',
      _citations: {
        typical_award: { snippet: 'Clubs can typically apply for between £1,000 (minimum) and £15,000 (maximum) per application', confidence: 'high', source_url: 'https://www.ecb.co.uk/play/club-support/club-funding/county-grant-fund' },
        who_can_apply: { snippet: 'The scheme is open to all ECB affiliated cricket clubs in England and Wales.', confidence: 'high', source_url: 'https://www.ecb.co.uk/play/club-support/club-funding/county-grant-fund' },
        decision_timeline: { snippet: 'The scheme will be open to applications from 1 February - 30 September 2026', confidence: 'high', source_url: 'https://resources.ecb.co.uk/ecb/document/2026/01/29/2214fc21-bf31-4f0c-a03e-51974d259860/P1046_2026-County-Grants-Updates_V4.pdf' },
      } } },

  { title: 'National Churches Trust — Medium Grants', funder: 'National Churches Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['capital', 'restricted'],
    apply_url: 'https://www.nationalchurchestrust.org/get-support/grants/medium-grants', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: 10000, deadline: '2026-12-15', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'scio'], impact_sectors: ['heritage', 'community'], target_beneficiaries: ['general_public'],
    description: 'Grants of up to £10,000, average around £6,000, from the National Churches Trust for urgent and essential maintenance and repair projects costing up to £80,000, and for project development and investigative work, at Christian places of worship across the UK, Isle of Man and Channel Islands. Buildings must be more than 30 years old and open for at least six public services a year. Next deadline Tuesday 15 December 2026.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Christian places of worship in England, Northern Ireland, Scotland, Wales, the Isle of Man or the Channel Islands, originally built as a place of worship more than 30 years ago and open for a minimum of six public services a year. Applicants must own the building or have the right to carry out the work. Local Churches Trusts can apply for organisational development projects.',
      what_they_fund: 'Urgent and essential maintenance and repair projects costing up to £80,000, and project development and investigative works such as condition surveys, governance advice, business planning and conservation statements.',
      typical_award: 'Up to £10,000; the average award is usually in the region of £6,000.',
      exclusions: 'Buildings not originally built as places of worship; new build or stand-alone structures, with limited Grade I or A listed exceptions; projects lacking professional oversight, permissions or two contractor quotes; organisations with annual income over £100,000 that are not registered with the Charity Commission.',
      decision_timeline: 'Next deadline Tuesday 15 December 2026. Open for new applications.',
      how_to_apply: 'Through the online grant portal, Benefactor. Free online training sessions are offered.',
      _citations: {
        typical_award: { snippet: 'our average award is usually in the region of £6,000 due to the competition in the programme', confidence: 'high', source_url: 'https://www.nationalchurchestrust.org/get-support/grants/medium-grants' },
        who_can_apply: { snippet: 'Is your building a Christian place of worship in England, Northern Ireland, Scotland, Wales, the Isle of Man or the Channel Islands?', confidence: 'high', source_url: 'https://www.nationalchurchestrust.org/get-support/grants/medium-grants' },
        decision_timeline: { snippet: 'Next Deadline: Tuesday 15 December', confidence: 'high', source_url: 'https://www.nationalchurchestrust.org/get-support/grants/medium-grants' },
      } } },

  { title: 'The Elmgrant Trust Grants', funder: 'The Elmgrant Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'core_costs'],
    apply_url: 'https://elmgrant.org.uk/eligibility/', url_status: 'unchecked',
    location_tag: 'South West England', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['education', 'creative', 'community'], target_beneficiaries: ['general_public'],
    description: 'Small grants, average around £550, from the Elmgrant Trust for core running costs or project costs of small established organisations with a proven record, in a restricted South West England area, especially Devon and Cornwall, and also Somerset and Dorset. Not Bristol, Bath or North East Somerset. Applications close one calendar month before each Trustees\' meeting; check the site for the next date.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'South West England', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Small established organisations, and individuals, from the South West area of England, especially Devon and Cornwall, within a restricted geographic area covering Cornwall, Devon, Somerset and Dorset. Not NE Somerset, Bath or Bristol.',
      what_they_fund: 'Core running costs or project costs of small established organisations with a proven record of making a significant difference, for charitable purposes through education, the arts and social sciences.',
      typical_award: 'Average grants are in the region of £550 for organisations.',
      exclusions: 'Large-scale national organisations; retrospective funding; a repeat application within two years of an award (the Trustees are reviewing whether this becomes three or four years). Email applications are not accepted.',
      decision_timeline: 'The application deadline is one calendar month before each Trustees\' meeting; shortlisted applicants are emailed just after the deadline and outcomes follow the meeting, with payment within three weeks.',
      how_to_apply: 'By post to The Elmgrant Trust, The Elmhirst Centre, Dartington Hall, Totnes, Devon TQ9 6EL, after reading the Eligibility and How to Apply pages. No email applications.',
      _citations: {
        typical_award: { snippet: 'Average grants are in the region of £550 for organisations', confidence: 'high', source_url: 'https://elmgrant.org.uk/eligibility/' },
        who_can_apply: { snippet: 'From the South West area of England, especially Devon and Cornwall. There is a geographic criterion, and it is a restricted South West area', confidence: 'high', source_url: 'https://elmgrant.org.uk/eligibility/' },
        decision_timeline: { snippet: 'the application deadline which is one calendar month before the Trustees Meeting', confidence: 'high', source_url: 'https://elmgrant.org.uk/after-you-apply/' },
      },
      _walk_note: 'The newsletter gives 24 September 2026 as the next deadline; the site\'s How to Apply page was a 404 when read, so no deadline is set. Confirm the meeting date before publishing.' } },

  { title: 'Riverhorse Trust Grants', funder: 'Riverhorse Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'small_grant'],
    apply_url: 'https://riverhorse.org.uk/make-an-application/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 1000, amount_max: 5000, deadline: '2026-09-30', is_rolling: false, max_org_income: 100000,
    eligible_structures: ['registered_charity', 'cio', 'scio'], impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    description: 'Flexible grants of £1,000 to £5,000 from the Riverhorse Trust for UK registered charities with annual income under £100,000 whose services directly benefit people or community groups in the UK. The Trust treats grants as investments and does not dictate their use; it looks for impact and a commitment to the charity\'s own resilience. Two rounds a year: autumn closes at the end of September, spring at the end of February.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities with an annual income of under £100,000 that provide services directly benefiting people or community groups in the UK. CICs and other not-for-profit organisations that are not registered charities cannot be funded.',
      what_they_fund: 'Flexible support treated as an investment rather than a donation; the Trust does not dictate how it is used. It looks for organisations that are impactful and committed to investing in their own resilience, whether their focus is relief or change.',
      typical_award: 'Grants can be between £1,000 and £5,000.',
      exclusions: 'CICs and not-for-profit organisations that are not registered charities; charities with income of £100,000 or more.',
      decision_timeline: 'The spring round closes at the end of February and the autumn round closes at the end of September.',
      how_to_apply: 'Download the grant application form (Word or PDF) from the Make an Application page and return it; enquiries to enquiries@riverhorse.org.uk.',
      _citations: {
        typical_award: { snippet: 'Grants provided can be between £1000 and £5000.', confidence: 'high', source_url: 'https://riverhorse.org.uk/what-we-invest-in/' },
        who_can_apply: { snippet: 'We invest in UK-registered charities with an annual income of under £100,000.', confidence: 'high', source_url: 'https://riverhorse.org.uk/what-we-invest-in/' },
        decision_timeline: { snippet: 'The Spring round closes at the end of February and the Autumn round closes at the end of September.', confidence: 'high', source_url: 'https://riverhorse.org.uk/make-an-application/' },
      } } },

  { title: 'The Supporting Act Foundation — Impact Grant 2026', funder: 'The Supporting Act Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'multi_year'],
    apply_url: 'https://thesupportingact.org/programs/impact-grant/2026', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2026-10-01', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['creative', 'social_innovation'], target_beneficiaries: ['ethnic_minorities', 'young_people', 'social_impact_orgs'],
    description: 'Ten unrestricted grants of €25,000 a year over two years, €50,000 in total, from The Supporting Act Foundation for nonprofit arts organisations registered between 2016 and 2024 in the UK or nine other European countries, with annual expenditure between €50,000 and €300,000, that give non-financial support to emerging artists from underrepresented groups. Closes 1 October 2026 at 11am CET.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Nonprofits based in Belgium, France, Germany, Greece, Ireland, Italy, the Netherlands, Portugal, Spain or the United Kingdom, or working with a fiscal host in one of those countries, registered as a nonprofit arts organisation between 2016 and 2024, with total annual expenditure between €50,000 and €300,000 and an updated website with publicly available evidence of active projects.',
      what_they_fund: 'Organisations providing non-financial support to emerging artists from underrepresented groups.',
      typical_award: 'Ten unrestricted grants of €25,000 per year over two years, €50,000 per organisation.',
      exclusions: 'Individuals, commercial organisations, ongoing projects or project proposals, and current or past TSAF grantees.',
      decision_timeline: 'Closes 1 October 2026 at 11.00am CET.',
      how_to_apply: 'Read the open call guide, then apply on the open call platform linked from the programme page.',
      _citations: {
        typical_award: { snippet: '10 unrestricted grants comprising €25,000- per year over two years, totalling €50,000- per organization', confidence: 'high', source_url: 'https://thesupportingact.org/programs/impact-grant/2026' },
        who_can_apply: { snippet: 'Have registered as a nonprofit arts organization between 2016 and 2024', confidence: 'high', source_url: 'https://thesupportingact.org/programs/impact-grant/2026' },
        decision_timeline: { snippet: 'October 1, 2026 (11.00 AM CET)', confidence: 'high', source_url: 'https://thesupportingact.org/programs/impact-grant/2026' },
      },
      _walk_note: 'Award is in euros (€50,000 over two years, roughly £43,000); amount fields left empty rather than hold a converted figure.' } },

  { title: 'BCP Homelessness Prevention Fund', funder: 'Dorset Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted', 'multi_year'],
    apply_url: 'https://www.dorsetcommunityfoundation.org/funds/bcp_homelessness_prevention_fund/', url_status: 'unchecked',
    location_tag: 'Bournemouth, Christchurch and Poole', is_local: true, amount_min: null, amount_max: 30000, deadline: '2026-10-01', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee', 'cooperative'], impact_sectors: ['housing', 'community'], target_beneficiaries: ['homeless', 'people_in_poverty'],
    description: 'Grants of up to £30,000 over six to 24 months from Dorset Community Foundation for interventions that stop routes to homelessness in Bournemouth, Christchurch and Poole: preventing homelessness upstream, shortening stays in temporary accommodation, and preventing returns to homelessness. Registered charities, constituted community groups, community benefit societies and CICs or companies limited by guarantee. Closes midday Thursday 1 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Bournemouth, Christchurch and Poole', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, constituted community and voluntary organisations, community benefit societies, community interest companies limited by guarantee, and companies limited by guarantee with a clear not-for-profit clause. Priority to organisations local to Dorset and based in Bournemouth, Christchurch and Poole. At least three unrelated people running the organisation, a written constitution, a bank account with two unrelated signatories, and safeguarding and EDI policies.',
      what_they_fund: 'Interventions that stop routes to homelessness: preventing homelessness (upstream prevention), reducing homelessness (shortening temporary accommodation stays), and preventing returns to homelessness. Grant periods of six to 24 months.',
      typical_award: 'Grants of up to £30,000; applications for smaller amounts are welcome.',
      exclusions: 'Schools; promotion of religion or political causes; public bodies carrying out statutory obligations; animal welfare organisations; retrospective funding. Organisations with more than 12 months of unrestricted reserves are usually not funded.',
      decision_timeline: 'Closes midday, Thursday 1 October 2026.',
      how_to_apply: 'Online form linked from the fund page, with constitution, bank statements, annual accounts, safeguarding and EDI policies.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £30,000 are available (applications for smaller amounts are welcome).', confidence: 'high', source_url: 'https://www.dorsetcommunityfoundation.org/funds/bcp_homelessness_prevention_fund/' },
        who_can_apply: { snippet: 'We will prioritise organisations that are local to Dorset and based in Bournemouth, Christchurch and Poole.', confidence: 'high', source_url: 'https://www.dorsetcommunityfoundation.org/funds/bcp_homelessness_prevention_fund/' },
        decision_timeline: { snippet: 'midday, Thursday October 1, 2026', confidence: 'high', source_url: 'https://www.dorsetcommunityfoundation.org/funds/bcp_homelessness_prevention_fund/' },
      } } },

  { title: 'easyfundraising Impact Fund, autumn 2026', funder: 'easyfundraising', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'small_grant'], pipeline_state: 'between_rounds_scheduled',
    apply_url: 'https://www.easyfundraising.org.uk/impact-fund/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 1000, amount_max: 1000, deadline: '2026-11-08', is_rolling: false,
    next_open_date: 'Applications open Thursday 24 September 2026',
    eligible_structures: ['registered_charity', 'cio', 'scio', 'unincorporated', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'], impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    description: 'Fifteen unrestricted grants of £1,000 from easyfundraising for UK not-for-profit organisations of any size: registered charities, other not-for-profits, sports clubs, schools, social enterprises and CICs, youth groups and churches. Core and running costs welcome if the application says what the £1,000 will do and who benefits. Opens Thursday 24 September 2026 and closes midnight Sunday 8 November 2026.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'UK organisations only: registered charities, other not-for-profit organisations, sports clubs and teams, schools and education settings, social enterprises and CICs, after-school and youth groups, churches and religious organisations. No need to be registered with easyfundraising.',
      what_they_fund: 'A specific item or equipment, a defined activity or project, an improvement to a space or facility, or a clearly identified contribution to essential core or running costs. Assessed on community impact, reach and lasting benefit.',
      typical_award: 'Each grant is £1,000; 15 grants, £15,000 in total for the autumn 2026 round.',
      exclusions: 'Organisations outside the UK. Vague requests for general running costs are difficult to assess.',
      decision_timeline: 'Applications open Thursday 24 September 2026 and must be submitted by midnight on Sunday 8 November 2026. Successful organisations are notified by email within 28 days of the closing date.',
      how_to_apply: 'Online application from the Impact Fund page once the round opens; read the application guide first.',
      _citations: {
        typical_award: { snippet: 'Our Impact Fund offers 15 grants of £1,000 to UK not-for-profit organisations', confidence: 'high', source_url: 'https://www.easyfundraising.org.uk/impact-fund/' },
        who_can_apply: { snippet: 'The fund is open to UK organisations only', confidence: 'high', source_url: 'https://www.easyfundraising.org.uk/impact-fund/' },
        decision_timeline: { snippet: 'Applications must be submitted by midnight on Sunday 8th November 2026.', confidence: 'high', source_url: 'https://www.easyfundraising.org.uk/impact-fund/' },
      } } },

  { title: 'Michael Tippett Musical Foundation Grants', funder: 'Michael Tippett Musical Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted', 'small_grant'],
    apply_url: 'https://www.tippettfoundation.org.uk/grants', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 500, amount_max: 3000, deadline: '2026-09-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['creative', 'young_people', 'education'], target_beneficiaries: ['young_people', 'children'],
    description: 'Grants of £500 to £3,000, average around £2,000, from the Michael Tippett Musical Foundation for UK organisations running group music-making projects, especially with young people, with composing central to the project. One-off grants for projects starting January 2027 or later. Closes midnight 30 September 2026.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK-based organisations applying for group projects working with young composers, in or out of school, college or university.',
      what_they_fund: 'The development of group music-making, especially involving young people, with composing central to the project.',
      typical_award: 'Grants are likely to be between £500 and £3,000, with the average grant in the region of £2,000. All grants are one-off.',
      exclusions: 'Purchase of musical instruments or equipment; individual study, research or maintenance costs; computer hardware or software; general performance costs; recording projects; commissions for solely professional performance; capital purchase or development; general appeals; projects already completed. Composing competitions are not a priority.',
      decision_timeline: 'Deadline midnight on 30 September 2026; projects should not start earlier than January 2027.',
      how_to_apply: 'Download the guidelines from the Grants page and email the application, with a covering email identifying the organisation and the sum requested, to admin@tippettfoundation.org.uk.',
      _citations: {
        typical_award: { snippet: 'Grants are likely to be between £500 and £3,000, with the average grant in the region', confidence: 'high', source_url: 'https://www.tippettfoundation.org.uk/s/MTMF-GRANT-GUIDELINES-January-2026.pdf' },
        who_can_apply: { snippet: 'applications for grants towards projects that support group music-making, especially those that involve young people', confidence: 'high', source_url: 'https://www.tippettfoundation.org.uk/grants' },
        decision_timeline: { snippet: 'The deadline for applications is midnight on 30 September 2026', confidence: 'high', source_url: 'https://www.tippettfoundation.org.uk/grants' },
      } } },

  { title: 'The Britford Bridge Trust Grants', funder: 'The Britford Bridge Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://thebritfordbridgetrust.org/about/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'scio'], impact_sectors: ['community', 'education', 'health', 'creative'], target_beneficiaries: ['people_in_poverty', 'general_public'],
    description: 'Grants from the Britford Bridge Trust for UK registered charities with national or international reach working in poverty relief, education, health or the arts. The Trust\'s site sits behind a verification wall and could not be read; quarterly deadlines were reported as 30 September, 31 December, 30 March and 30 June. Read the page before publishing.' },

  { title: 'Creative Scotland — Touring Fund for Theatre and Dance', funder: 'Creative Scotland', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://www.creativescotland.com/funding/funding-programmes/targeted-funding/touring-fund', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2026-09-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'scio', 'cic_guarantee', 'ltd_guarantee', 'ltd_shares', 'sole_trader', 'individual'], impact_sectors: ['creative'], target_beneficiaries: ['general_public'],
    description: 'Creative Scotland\'s Touring Fund for Theatre and Dance supports professional theatre and dance productions of varying scales to tour across Scotland, including outdoor, circus, interdisciplinary and site-specific work. No set limit on the amount requested; the budget for previous rounds was £2 million. Scotland-based artists, producers, companies, venue consortia and organisations. Deadline 2pm Wednesday 30 September 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Individual dance and theatre artists, producers, companies, consortia of venues presenting a shared touring programme and organisations based in Scotland and involved in the production and/or touring of professional live theatre and dance. Independent producers can apply on their own or on behalf of artists. All applicants must have a UK bank account.',
      what_they_fund: 'The creation and touring of live professional theatre and dance in Scotland: brand-new productions, works-in-progress that have completed R&D, and restaging or remounts of successful productions. Tours are offered to venues on a no-fee basis with a favourable box office split.',
      typical_award: 'There are no set limits on how much you can apply for; request the full amount needed to produce and tour the work. The budget for previous rounds was £2,000,000 and a similar level is anticipated.',
      exclusions: 'Applicants who do not work in the production or touring of professional live theatre and dance; Multi-Year Funded Organisations whose agreement includes making and touring theatre or dance; non-theatre or dance touring work.',
      decision_timeline: 'Application deadline 2pm, Wednesday 30 September 2026. Late submissions cannot be accepted.',
      how_to_apply: 'Online through Creative Scotland\'s application portal; read the Your Application guidance first.',
      _citations: {
        typical_award: { snippet: 'There are no set limits on how much you can apply for.', confidence: 'high', source_url: 'https://www.creativescotland.com/funding/funding-programmes/targeted-funding/touring-fund' },
        who_can_apply: { snippet: 'Individual dance and theatre artists, producers, companies, consortia of venues presenting a shared touring programme and organisations who are based in Scotland', confidence: 'high', source_url: 'https://www.creativescotland.com/funding/funding-programmes/targeted-funding/touring-fund' },
        decision_timeline: { snippet: 'Application deadline: 2pm, Wednesday 30 September 2026', confidence: 'high', source_url: 'https://www.creativescotland.com/funding/funding-programmes/targeted-funding/touring-fund' },
      } } },

  { title: 'The Gwendoline and Margaret Davies Charity', funder: 'The Gwendoline and Margaret Davies Charity', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted', 'small_grant'],
    apply_url: 'https://daviescharity.org.uk/', url_status: 'unchecked',
    location_tag: 'Wales', is_local: true, amount_min: null, amount_max: 10000, deadline: '2026-09-30', is_rolling: false, max_org_income: 1000000,
    eligible_structures: ['registered_charity', 'cio'], impact_sectors: ['creative', 'education', 'health', 'community'], target_beneficiaries: ['general_public', 'rural_communities'],
    description: 'Main Grants of £2,000 to £10,000 and Small Grants of up to £2,000 from the Gwendoline and Margaret Davies Charity for registered charities with a presence in Wales whose beneficiaries are in Wales, supporting the arts, education, health and society, especially music and the arts, remote and disadvantaged communities, and services to vulnerable people. Organisations with income over £1 million are not usually funded. Main Grants close at the end of January, May and September; Small Grants at the end of every even month.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Wales', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities with a presence in Wales whose primary beneficiaries are based in Wales. The charity tends not to fund organisations with incomes over £1 million a year.',
      what_they_fund: 'Organisations and projects in Wales that benefit the arts, education, health and society, including organisations that promote music and the arts, projects in remote and disadvantaged communities, and services to vulnerable individuals.',
      typical_award: 'Main Grants £2,000 to £10,000; Small Grants up to £2,000.',
      exclusions: 'Organisations without a presence in Wales or whose beneficiaries are outside Wales; organisations with income over £1 million a year are not usually funded.',
      decision_timeline: 'Main Grants close at the end of January, end of May and end of September. Small Grants close at the end of February, April, June, August, October and December.',
      how_to_apply: 'Main Grants: email a completed application form with a budget and annual accounts to applications@daviescharity.org.uk. Small Grants: email a letter of application, budget and annual accounts to the Director at the same address.',
      _citations: {
        typical_award: { snippet: '£2,000-£10,000', confidence: 'high', source_url: 'https://daviescharity.org.uk/' },
        who_can_apply: { snippet: 'In order to be eligible for a grant you must be a registered charity with a presence in Wales', confidence: 'high', source_url: 'https://daviescharity.org.uk/' },
        decision_timeline: { snippet: 'the end of January, end of May, and end of September', confidence: 'high', source_url: 'https://daviescharity.org.uk/' },
      } } },

  { title: 'Baptist Insurance Grants', funder: 'Baptist Insurance', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://www.baptist-insurance.co.uk/grants', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 2000, amount_max: 20000, deadline: '2026-10-02', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'scio'], impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    description: 'Grants usually of £2,000 to £20,000, average under £10,000, from Baptist Insurance for Baptist churches in the UK for evangelism and outreach in their local communities, including church planting. Not building projects, routine ministry or overseas work. Latest 2026 deadline Friday 2 October.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Baptist churches in the UK whose work has a primary focus on evangelism and outreach in their local communities.',
      what_they_fund: 'Evangelism and outreach in local communities, including church planting.',
      typical_award: 'The size of grants usually ranges from £2,000 to £20,000, but the average is less than £10,000. Multi-year grants are not usually offered.',
      exclusions: 'Regular pastoral ministry and routine activities such as Sunday Schools or small groups; building projects, routine maintenance or equipment; overseas projects; individuals and individuals\' studies.',
      decision_timeline: 'The latest deadline for 2026 applications is Friday 2 October.',
      how_to_apply: 'Read the grant application guidance, then apply through the Apply for a grant link on the Grants page.',
      _citations: {
        typical_award: { snippet: 'The size of our grants usually ranges from £2,000 to £20,000, but the average is less than £10,000', confidence: 'high', source_url: 'https://www.baptist-insurance.co.uk/media/13chlxbz/grant-application-guidance.pdf' },
        who_can_apply: { snippet: 'The money is used to provide funding to Baptist churches for evangelism and outreach in their local communities.', confidence: 'high', source_url: 'https://www.baptist-insurance.co.uk/grants' },
        decision_timeline: { snippet: 'The latest deadlines for 2026 applications are: Friday 2 October', confidence: 'high', source_url: 'https://www.baptist-insurance.co.uk/grants' },
      } } },

  { title: 'The Robert Clutterbuck Charitable Trust', funder: 'The Robert Clutterbuck Charitable Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['capital', 'small_grant'],
    apply_url: 'https://clutterbucktrust.org.uk/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 1000, amount_max: 3000, deadline: '2026-12-31', is_rolling: false, max_org_income: 500000,
    eligible_structures: ['registered_charity', 'cio', 'scio'], impact_sectors: ['community', 'sport', 'environment', 'health'], target_beneficiaries: ['veterans', 'young_people', 'general_public'],
    description: 'Grants of £1,000 to £3,000 from the Robert Clutterbuck Charitable Trust to charities for the purchase of specific items: Armed Forces and ex-service welfare, youth sport and recreation facilities, domestic animal welfare, natural history and wildlife, and hospices, churches, schools, health and social welfare charities in Cheshire and Hertfordshire, which take priority. Rounds close 30 June and 31 December each year.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities, with priority to Cheshire and Hertfordshire. Not individuals. Charities with turnover over £500,000 are generally not favoured, except Service welfare charities.',
      what_they_fund: 'Grants for the purchase of specific items supporting Armed Forces personnel and ex-service men and women, youth sport and recreation facilities, domestic animal welfare, natural history and wildlife, and hospices, churches, schools, health and social welfare charities associated with Cheshire and Hertfordshire.',
      typical_award: 'The Trustees do not generally pay grants below £1,000 or over £3,000.',
      exclusions: 'Payments to individuals; appeals within two years of a previous grant; running costs rather than capital items; charities with turnover over £500,000, except Service welfare charities.',
      decision_timeline: 'Deadlines for the rounds of applications are 30 June and 31 December each year.',
      how_to_apply: 'No application forms: write to the Secretary with what the charity proposes to do with a grant and its current financial position.',
      _citations: {
        typical_award: { snippet: 'do not generally pay grants below £1000 or over £3000', confidence: 'high', source_url: 'https://clutterbucktrust.org.uk/' },
        who_can_apply: { snippet: 'The Trust exists to help other charities by making grants to them.', confidence: 'high', source_url: 'https://clutterbucktrust.org.uk/' },
        decision_timeline: { snippet: 'deadlines for the rounds of applications are 30th June and 31st December in each year', confidence: 'high', source_url: 'https://clutterbucktrust.org.uk/' },
      } } },

  { title: 'Arts Council of Northern Ireland — Arts and Older People Programme', funder: 'Arts Council of Northern Ireland', funder_type: 'lottery',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://artscouncil-ni.org/funding-for-organisations/arts-and-older-people-programme', url_status: 'unchecked',
    location_tag: 'Northern Ireland', is_local: true, amount_min: 1000, amount_max: 10000, deadline: '2026-10-22', is_rolling: false,
    eligible_structures: ['registered_charity', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['creative', 'older_people', 'mental_health'], target_beneficiaries: ['older_people'],
    description: 'National Lottery grants of £1,000 to £10,000 from the Arts Council of Northern Ireland for constituted community and voluntary groups, arts organisations, NGOs and local authorities working in partnership with older people\'s groups, to strengthen the voice of older people and promote positive mental health and wellbeing through participation in the arts. Closes 12 noon Thursday 22 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Northern Ireland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Constituted community and voluntary groups working at a local level to support older people who can demonstrate strong partnership working with older people groups; also non-governmental organisations, local authorities and arts organisations that can clearly demonstrate partnership working. Partnership or consortia-based projects are sought.',
      what_they_fund: 'Projects that strengthen the voice of older people and promote positive mental health and emotional wellbeing through greater participation in the arts.',
      typical_award: 'Grants from £1,000 to £10,000.',
      exclusions: 'Individuals or sole traders; broadcasters other than community service broadcasters; central government departments; organisations in breach of previous Arts Council award conditions or with incomplete awards from 2024/25 or earlier.',
      decision_timeline: 'Deadline 12 noon Thursday 22 October 2026.',
      how_to_apply: 'Online only, with all mandatory enclosures submitted at the same time in Word, Excel or PDF, up to 25 Mb in total.',
      _citations: {
        typical_award: { snippet: 'Grants from £1,000 to £10,000 are available', confidence: 'high', source_url: 'https://artscouncil-ni.org/funding-for-organisations/arts-and-older-people-programme' },
        who_can_apply: { snippet: 'The programme is aimed at constituted community and voluntary groups who are working at a local level to support older people', confidence: 'high', source_url: 'https://artscouncil-ni.org/funding-for-organisations/arts-and-older-people-programme' },
        decision_timeline: { snippet: 'The deadline for applications is 12 noon Thursday 22 October 2026.', confidence: 'high', source_url: 'https://artscouncil-ni.org/funding-for-organisations/arts-and-older-people-programme' },
      } } },

  { title: 'Arts Award Access Fund', funder: 'Arts Award (Trinity College London)', funder_type: 'other',
    funding_type: 'grant', funding_subtypes: ['restricted', 'small_grant'],
    apply_url: 'https://www.artsaward.org.uk/site/?id=1975', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 100, amount_max: 1500, deadline: '2026-10-09', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['creative', 'young_people', 'education'], target_beneficiaries: ['young_people', 'disabled_people'],
    description: 'Grants of £100 to £1,500 from the Arts Award Access Fund for registered Arts Award centres in the UK working on Arts Award projects with young people who face barriers to access and inclusion. Covers arts logs, workshop fees, materials, travel, adviser time, qualification fees and access costs such as BSL. Only registered Arts Award centres can apply. Closes Friday 9 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered Arts Award centres in the UK only. Priority to centres working with young people who experience barriers to access and inclusion and using the grant to pilot, embed or develop their Arts Award work with these groups.',
      what_they_fund: 'Discover, Explore or Bronze arts logs; workshop fees with a professional; art materials and printing; event tickets; travel; Gold leadership project costs; specialist equipment or venue hire; adviser, project management or staff time; certificates and qualification fees; specific access requirements such as BSL or assistive technology.',
      typical_award: 'Grants of between £100 and £1,500.',
      exclusions: 'Organisations that are not registered Arts Award centres. Funding required less than six weeks after the deadline.',
      decision_timeline: 'Closing date Friday 9 October 2026. Decisions confirmed by email three to four weeks after the deadline.',
      how_to_apply: 'Submit a grant application through the Arts Award centre portal during an open round.',
      _citations: {
        typical_award: { snippet: 'The Access Fund provides grants of between £100-£1500 to Arts Award centres', confidence: 'high', source_url: 'https://www.artsaward.org.uk/site/?id=1975' },
        who_can_apply: { snippet: 'We welcome applications from all registered Arts Award centres in the UK', confidence: 'high', source_url: 'https://www.artsaward.org.uk/site/?id=1975' },
        decision_timeline: { snippet: 'Friday 9 October 2026', confidence: 'high', source_url: 'https://www.artsaward.org.uk/site/?id=1975' },
      } } },
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
