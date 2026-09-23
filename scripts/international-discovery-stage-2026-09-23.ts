// International development funders, brief docs/handoffs/international-discovery-2026-09-23.md,
// commissioned by Paul on 23 Sept 2026 after Julia Krepska of Our Sansar reported
// that every result she saw was a UK funder.
//
// Every page quoted below was fetched in this session by direct curl; no model
// call was made and nothing was billed to the Anthropic key. Dedup by funder
// name AND apply URL was run against a full read of scraped_grants (2,169 rows)
// before a single brief was written; the funders held under a near name
// (Waterloo's whole-foundation row, Hilden, Charles Hayward, Souter, Comic
// Relief, Jephcott, Sigrid Rausing, Ferguson, Maypole) are recorded in
// docs/handoffs/international-discovery-results-2026-09-23.json.
//
// Staged hidden at system: trust so the Needs Review re-enrich path still works.
//
//   npx tsx --env-file=.env.local scripts/international-discovery-stage-2026-09-23.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:international-discovery-2026-09-23'
const TODAY = '2026-09-23'

const WF = 'https://waterloofoundation.org.uk'
const OAK_LOE = 'https://oakfnd.org/grant-making/'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string; pipeline_state?: string }

const WF_SMALL_WHO =
  'UK-based organisations only: at present the Foundation does not accept unsolicited applications to the Small Grants Programme from organisations based outside the UK, but will consider applications by UK-based organisations working in close partnership with local in-country organisations. Small UK charities led by committed individuals, especially those based in Wales, are prioritised. Organisations with annual income under £20,000, or newly established within the last two years, can only be considered for grants below £5,000.'
const WF_SMALL_AWARD =
  'Up to £10,000 in total, for work delivered over one to two years. Requests should be in keeping with the organisation’s annual income: the Foundation does not usually give grants totalling more than 25% of it. Organisations with income under £20,000 or under two years old are capped at £5,000.'
const WF_SMALL_EXCL =
  'Organisations based outside the UK applying unsolicited; applicants who had a grant application rejected less than 24 months ago; requests over £10,000 under the Small Grants Programme; requests worth more than about 25% of the applicant’s annual income.'
const WF_STRUCTURES = ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated']
const wfCite = (url: string) => ({
  typical_award: { snippet: 'We do not accept applications for over £10,000 under our Small Grants Programme. The majority of our grants will be delivered over a one to two year period.', confidence: 'high' as const, source_url: url },
  who_can_apply: { snippet: 'At present, we do not accept unsolicited applications to our Small Grants Programme from organisations based outside the UK. We will, however, consider applications by UK-based organisations working in close partnership with local in-country organisations.', confidence: 'high' as const, source_url: url },
  exclusions: { snippet: 'If you have previously had a grant application rejected, please wait at least 24 months before submitting another application.', confidence: 'high' as const, source_url: url },
})

const OAK_WHO =
  'Not-for-profit organisations anywhere in the world, including UK-registered charities delivering work overseas. Organisations that have not been invited by a programme officer may submit an unsolicited letter of enquiry; Oak invites a full application only where it finds alignment with its priorities and has budget available.'
const OAK_HOW =
  'Apply through https://oakfnd.org/grant-making/ . Two entry routes: a direct invitation from an Oak programme officer, or an unsolicited letter of enquiry submitted through the form on the grant-making page. An invited organisation then submits a concept note and/or a formal application, followed by due diligence that may include discussions with staff, a review of financial information and site visits.'
const OAK_CITE = {
  who_can_apply: { snippet: 'Not-for-profit organisations that have not been invited to apply by a programme officer can submit unsolicited requests for funding through our letter of enquiry process.', confidence: 'high' as const, source_url: OAK_LOE },
  how_to_apply: { snippet: 'Oak’s application process begins with entry through one of two pathways: an invitation from Oak; and the submission of a Letter of Enquiry.', confidence: 'high' as const, source_url: OAK_LOE },
}
const OAK_STRUCTURES = ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'ltd_guarantee']

const NEW: Row[] = [
  // ── The Waterloo Foundation, World Development strands ───────────────────────
  // The catalogue holds "Waterloo Foundation Grant Programmes" (the whole
  // foundation) and a separate "Waterloo Foundation Wales Fund" row, so a row
  // per World Development strand follows the precedent already set.
  { title: 'Waterloo Foundation — World Development: Education Small Grants', funder: 'The Waterloo Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: `${WF}/worlddevelopmentapplicationseducationsmall/`, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: 10000, deadline: null, is_rolling: true,
    eligible_structures: WF_STRUCTURES, impact_sectors: ['international', 'education'], target_beneficiaries: ['children', 'people_in_poverty'],
    niche_tags: ['development_aid', 'literacy_numeracy'],
    description: 'Grants of up to £10,000 from The Waterloo Foundation for UK-based organisations delivering education projects in developing countries. Priority goes to literacy, numeracy and STEM, to improving the safety and experience of learners, and to building long-term capacity in the education system. Grants are prioritised for small UK charities led by committed individuals, especially those based in Wales, working to deliver projects in developing countries. Work is funded over one to two years; longer durations are considered for bursaries supporting students through a stage of education. There is no formal form and no deadline: a proposal of two to three sides of A4 is sent in the body of an email.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: WF_SMALL_WHO,
      what_they_fund: 'Education projects delivered in developing countries: improving access to learning and education, improving the quality of teaching and learning, and building capacity within the education system. Bursaries supporting students through a specific stage of education can run longer than the usual one to two years.',
      typical_award: WF_SMALL_AWARD,
      exclusions: WF_SMALL_EXCL,
      priorities: 'Small UK charities led by committed individuals, especially those based in Wales, delivering projects in developing countries.',
      geographic_focus: 'Developing countries. The applicant organisation must be UK-based; the work is delivered overseas, usually in close partnership with a local in-country organisation.',
      decision_timeline: 'Rolling, with no published deadline. Applications are acknowledged within seven days; if nothing arrives within fourteen days the Foundation asks to be contacted.',
      how_to_apply: 'No formal application form. Send a proposal of approximately two to three sides of A4 in the body of an email, following the guidelines on the Education Small Grants page, with the key organisational information listed at the top.',
      _citations: wfCite(`${WF}/worlddevelopmentapplicationseducationsmall/`) } },

  { title: 'Waterloo Foundation — World Development: WASH Small Grants', funder: 'The Waterloo Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: `${WF}/worlddevelopmentapplicationswashsmall/`, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: 10000, deadline: null, is_rolling: true,
    eligible_structures: WF_STRUCTURES, impact_sectors: ['international', 'health'], target_beneficiaries: ['people_in_poverty', 'children'],
    niche_tags: ['development_aid'],
    description: 'Grants of up to £10,000 from The Waterloo Foundation for UK-based organisations delivering water, sanitation and hygiene projects in developing countries. Work is funded over one to two years and a grant can be a contribution towards a larger programme budget. Applications start with a concept note; successful candidates are invited to a phone call and/or a full proposal. Organisations with income under £20,000, or newly established within the last two years, are considered only for grants below £5,000. Rolling, with no published deadline.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: WF_SMALL_WHO,
      what_they_fund: 'Water, sanitation and hygiene work delivered in developing countries. A grant is happily made as a contribution towards a larger programme budget.',
      typical_award: WF_SMALL_AWARD,
      exclusions: WF_SMALL_EXCL,
      geographic_focus: 'Developing countries, with the applicant organisation UK-based and usually working in close partnership with a local in-country organisation.',
      decision_timeline: 'Rolling, with no published deadline. The first stage is a concept note; successful candidates are then invited to a phone call and/or a full proposal.',
      how_to_apply: 'Check the WASH programme page and the eligibility checklist first, then submit a concept note following the WASH Small Grants application guidelines.',
      _citations: wfCite(`${WF}/worlddevelopmentapplicationswashsmall/`) } },

  { title: 'Waterloo Foundation — World Development: Nutrition Small Grants', funder: 'The Waterloo Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: `${WF}/worlddevelopmentapplicationsnutritionsmall/`, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: 10000, deadline: null, is_rolling: true,
    eligible_structures: WF_STRUCTURES, impact_sectors: ['international', 'food'], target_beneficiaries: ['children', 'people_in_poverty'],
    niche_tags: ['development_aid'],
    description: 'Grants of up to £10,000 from The Waterloo Foundation for UK-based organisations delivering nutrition work in developing countries. Work is funded over one to two years and a grant can be a contribution towards a larger programme budget. Applications start with a concept note; successful candidates are invited to a phone call and/or a full proposal. Organisations with income under £20,000, or newly established within the last two years, are considered only for grants below £5,000. Rolling, with no published deadline.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: WF_SMALL_WHO,
      what_they_fund: 'Nutrition work delivered in developing countries. A grant is happily made as a contribution towards a larger programme budget.',
      typical_award: WF_SMALL_AWARD,
      exclusions: WF_SMALL_EXCL,
      geographic_focus: 'Developing countries, with the applicant organisation UK-based and usually working in close partnership with a local in-country organisation.',
      decision_timeline: 'Rolling, with no published deadline. The first stage is a concept note; successful candidates are then invited to a phone call and/or a full proposal.',
      how_to_apply: 'Check the Nutrition programme page and the eligibility checklist first, then submit a concept note following the Nutrition Small Grants application guidelines.',
      _citations: wfCite(`${WF}/worlddevelopmentapplicationsnutritionsmall/`) } },

  { title: 'Waterloo Foundation — World Development: Sexual and Reproductive Health Small Grants', funder: 'The Waterloo Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: `${WF}/worlddevelopmentapplicationssrhsmall/`, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: 10000, deadline: null, is_rolling: true,
    eligible_structures: WF_STRUCTURES, impact_sectors: ['international', 'health', 'women'], target_beneficiaries: ['women_girls', 'people_in_poverty'],
    niche_tags: ['development_aid', 'girls_empowerment'],
    description: 'Grants of up to £10,000 from The Waterloo Foundation for UK-based organisations working on sexual and reproductive health and family planning in developing countries. An initiative fitting the general goal of improving access to and use of modern contraceptive methods and wider sexual and reproductive health services is enough to apply; addressing one of the Foundation’s three named pillars directly is not required. Stronger proposals set out a sustainable model of project delivery. There is no formal form and no deadline: a proposal of two to three sides of A4 is sent in the body of an email.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: WF_SMALL_WHO,
      what_they_fund: 'Initiatives improving access to and use of a range of modern contraceptive methods and wider sexual health and reproductive services in developing countries. Directly addressing one of the three named pillars is not required at the small grants stage.',
      typical_award: WF_SMALL_AWARD,
      exclusions: WF_SMALL_EXCL,
      priorities: 'Proposals that directly address creating or delivering a sustainable model of project delivery.',
      geographic_focus: 'Developing countries, with the applicant organisation UK-based and usually working in close partnership with a local in-country organisation.',
      decision_timeline: 'Rolling, with no published deadline. Applications are acknowledged within seven days.',
      how_to_apply: 'No formal application form. Send a proposal of approximately two to three sides of A4 in the body of an email, following the SRH Small Grants guidelines.',
      _citations: wfCite(`${WF}/worlddevelopmentapplicationssrhsmall/`) } },

  { title: 'Waterloo Foundation — World Development: Sexual and Reproductive Health Main Grants', funder: 'The Waterloo Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'core_costs'],
    apply_url: `${WF}/worlddevelopmentapplicationssrhmain/`, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['international', 'health', 'women'], target_beneficiaries: ['women_girls', 'people_in_poverty'],
    niche_tags: ['development_aid', 'girls_empowerment'],
    description: 'The Waterloo Foundation’s main grants strand for sexual and reproductive health and family planning in developing countries. The first step is a one-page concept note emailed to applications@waterloofoundation.org.uk, describing the organisation rather than a specific project: the unique added value it brings to world development, how that niche relates to improving access to and use of sexual and reproductive health services, and which of the Foundation’s three priorities it plans to address. Organisations funded through this fund in the past five years contact the fund manager directly instead. No per-applicant award figure is published. Rolling, with no deadline.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations working on sexual and reproductive health and family planning in developing countries. Groups new to the Foundation follow the concept note route; anyone funded through the SRH Main Grant fund within the past five years emails the fund manager directly to discuss follow-on funding.',
      what_they_fund: 'Organisational support for work improving use of and access to sexual and reproductive health services in developing countries, against the Foundation’s three SRH priorities. The initial submission is about the organisation and its niche rather than a single project.',
      typical_award: 'No per-applicant figure is stated on the application guidelines page.',
      exclusions: 'Submissions longer than one page are not accepted. Applications sent to any address other than applications@waterloofoundation.org.uk cannot be assessed.',
      geographic_focus: 'Developing countries.',
      decision_timeline: 'Rolling, with no published deadline. Concept notes are acknowledged within seven days.',
      how_to_apply: 'Email a one-page concept note (one-inch margins, 11-point font, in the body of the email) to applications@waterloofoundation.org.uk, headed with name, contact, title, organisation and organisational income versus expenditure, and stating that you are applying to the TWF World Development Main Grant SRH Fund.',
      _citations: {
        how_to_apply: { snippet: 'Please email your concept note to applications@waterloofoundation.org.uk . We are unable to assess applications sent to any other email address.', confidence: 'high', source_url: `${WF}/worlddevelopmentapplicationssrhmain/` },
        who_can_apply: { snippet: 'If you have been funded by TWF through our SRH Main Grant fund within the past five years please email the fund manager directly to discuss potential follow-on funding. For groups new to TWF please follow the guidelines below.', confidence: 'high', source_url: `${WF}/worlddevelopmentapplicationssrhmain/` },
        exclusions: { snippet: 'submissions longer than one page will not be accepted', confidence: 'high', source_url: `${WF}/worlddevelopmentapplicationssrhmain/` },
      } } },

  // ── Oak Foundation ──────────────────────────────────────────────────────────
  // Not held in any form. Three programmes, one shared application route: an
  // unsolicited letter of enquiry. Staged as three rows because the funding
  // priorities, and therefore the tags, differ completely.
  { title: 'Oak Foundation — Prevent Child Sexual Abuse Programme', funder: 'Oak Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'core_costs', 'multi_year'],
    apply_url: 'https://oakfnd.org/programmes/prevent-child-sexual-abuse/', funding_index_url: OAK_LOE, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: OAK_STRUCTURES, impact_sectors: ['international', 'justice', 'young_people'], target_beneficiaries: ['children', 'young_people'],
    niche_tags: ['development_aid'],
    description: 'Oak Foundation’s Prevent Child Sexual Abuse Programme funds work to end child sexual abuse online and offline, through six connected priorities: generating evidence for solutions that work, building healthy relationships and working with men and boys, safe digital environments, safeguarding child elite athletes, justice for survivors, and survivor-led organisations. The programme has no priority countries, though safe digital environments work is concentrated in the UK, EU and USA and justice for survivors mostly in the Americas. Applications open all year through an unsolicited letter of enquiry; no award range is published.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: OAK_WHO,
      what_they_fund: 'Work to prevent child sexual abuse online and offline: evidence and solutions research, healthy relationships work with men and boys, safe digital environments including removing child sexual abuse material from platforms, safeguarding child elite athletes, justice for survivors, and survivor-led organisations. Core, project and seed funding, in multi-year grants.',
      typical_award: 'No per-applicant figure is published. The size of the grant, and whether it is project or core support, is discussed once Oak formally invites an organisation to apply.',
      exclusions: 'None stated on the grant-making page. An invitation to submit application materials does not guarantee a grant, and a grant may be declined at any stage.',
      priorities: 'Solutions and research; men and boys; safe digital environments; safe sports; justice for survivors; survivor-led organisations.',
      geographic_focus: 'Worldwide, with no priority countries across the programme. Safe digital environments grant-making is concentrated in the UK, EU and USA; justice for survivors is currently focused in the Americas.',
      decision_timeline: 'Rolling. A letter of enquiry may be submitted at any time; Oak invites a concept note and/or application where it finds alignment and has budget, then runs due diligence before a decision.',
      how_to_apply: OAK_HOW,
      _citations: OAK_CITE } },

  { title: 'Oak Foundation — International Human Rights Programme', funder: 'Oak Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'core_costs', 'multi_year'],
    apply_url: 'https://oakfnd.org/programmes/international-human-rights/', funding_index_url: OAK_LOE, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: OAK_STRUCTURES, impact_sectors: ['international', 'justice'], target_beneficiaries: ['general_public', 'refugees_migrants'],
    niche_tags: ['development_aid', 'refugee_rights'],
    description: 'Oak Foundation’s International Human Rights Programme funds work that closes the gap between human rights law and people’s lived experience, across five funding priorities, with core, project and seed funding in multi-year grants. It works at global, regional and national levels and remains committed to the EU, USA, UK, Brazil and various geographies in the global East, with limited capacity to expand its geographic coverage; exceptionally it works through intermediary organisations elsewhere. Current partner work includes information integrity, a healthy information sphere, and the effect of surveillance, censorship and information controls on journalists and human rights activists. Applications open all year through an unsolicited letter of enquiry; no award range is published.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: OAK_WHO,
      what_they_fund: 'Efforts that close the gap between human rights law and lived experience, across five funding priorities, including information integrity and the openness and security of the internet for journalists and human rights activists. Core, project and seed funding, in multi-year grants.',
      typical_award: 'No per-applicant figure is published. Grant size, and whether it is project or core support, is discussed once Oak formally invites an organisation to apply.',
      exclusions: 'Limited capacity to expand geographic coverage beyond the EU, USA, UK, Brazil and the global East; work elsewhere is exceptional and usually runs through an intermediary organisation.',
      geographic_focus: 'International, at global, regional and national levels. Committed to the EU, USA, UK, Brazil and various geographies in the global East.',
      decision_timeline: 'Rolling. A letter of enquiry may be submitted at any time; Oak invites a concept note and/or application where it finds alignment and has budget.',
      how_to_apply: OAK_HOW,
      _citations: { ...OAK_CITE,
        geographic_focus: { snippet: 'We work internationally at the global, regional, and national levels. We remain committed to the EU, USA, UK, Brazil, and various geographies in the global East.', confidence: 'high', source_url: 'https://oakfnd.org/programmes/international-human-rights/' } } } },

  { title: 'Oak Foundation — Issues Affecting Women Programme', funder: 'Oak Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'core_costs', 'multi_year'],
    apply_url: 'https://oakfnd.org/programmes/issues-affecting-women/', funding_index_url: OAK_LOE, url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: OAK_STRUCTURES, impact_sectors: ['international', 'women'], target_beneficiaries: ['women_girls'],
    niche_tags: ['vawg', 'girls_empowerment', 'development_aid'],
    description: 'Oak Foundation’s Issues Affecting Women Programme has funded organisations and movements around the world for more than twenty years, backing organisations built and led by women. It funds five things: strengthening women’s movements, resourcing women’s funds, ending domestic violence, stopping psychological violence, and preventing trafficking and exploitation, including access to services and justice for women who have experienced trafficking, community organising and leadership development, corporate accountability across supply chains, and safe and informed migration. Applications open all year through an unsolicited letter of enquiry; no award range is published.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: OAK_WHO,
      what_they_fund: 'Strengthening women’s movements; resourcing women’s funds; ending domestic violence; stopping psychological violence; and preventing trafficking and exploitation, including access to services and justice for women who have experienced trafficking, community organising and leadership development, corporate accountability across supply chains, and safe and informed migration. Core, project and seed funding, in multi-year grants.',
      typical_award: 'No per-applicant figure is published. Grant size, and whether it is project or core support, is discussed once Oak formally invites an organisation to apply.',
      exclusions: 'None stated on the grant-making page.',
      priorities: 'Organisations and movements built and led by women.',
      geographic_focus: 'Worldwide.',
      decision_timeline: 'Rolling. A letter of enquiry may be submitted at any time.',
      how_to_apply: OAK_HOW,
      _citations: { ...OAK_CITE,
        what_they_fund: { snippet: 'We also support specific issues that aim to end domestic violence, stop psychological violence, and prevent trafficking and exploitation.', confidence: 'high', source_url: 'https://oakfnd.org/programmes/issues-affecting-women/' } } } },

  // ── Help for Nepal ──────────────────────────────────────────────────────────
  { title: 'Help for Nepal — Grants for charitable projects in Nepal', funder: 'Help for Nepal', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: 'https://www.help4nepal.org.uk/funding/', url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: null, impact_sectors: ['international', 'education', 'health'], target_beneficiaries: ['people_in_poverty', 'children'],
    niche_tags: ['development_aid', 'humanitarian'],
    description: 'Help for Nepal, a UK charity run by the Nepalese community in Britain, makes grants to charitable projects in Nepal. Its three priority areas are the relief of poverty, the advancement of health and the advancement of education. It welcomes applications for small project funding that meet its criteria, and applications are open all year: a form can be downloaded and emailed to help4nepalese@gmail.com with a project narrative, or completed online, in both cases after reading the grant making policy. No award figure is published. Applicants who have not heard within four weeks should take it that the application was unsuccessful.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Anyone with a suitable charitable project in Nepal that meets the funding criteria set out in the grant making policy. The page does not restrict the legal form of the applicant, and does not state an income limit.',
      what_they_fund: 'Charitable projects in Nepal under three priority areas: relief of poverty, advancement of health and advancement of education. Small project funding is explicitly welcomed.',
      typical_award: 'No per-applicant figure is stated. The page says small project funding is welcomed.',
      exclusions: 'None stated on the funding page; the grant making policy is a separate document that must be read before applying.',
      geographic_focus: 'Nepal.',
      decision_timeline: 'Rolling, with no deadline. If no reply arrives within four weeks of the application date, the application has not been successful.',
      how_to_apply: 'Read the grant making policy first, then either download the grant application form and email it with a proposed project narrative to help4nepalese@gmail.com, or submit the online grant application, uploading all supporting documents before sending.',
      _citations: {
        what_they_fund: { snippet: 'Help for Nepal will support charitable projects in Nepal. Our main priority areas are as follows: Relief of poverty. Advancement of Health. Advancement of education.', confidence: 'high', source_url: 'https://www.help4nepal.org.uk/funding/' },
        typical_award: { snippet: 'We welcome applications for small project funding, provided they meet our funding criteria.', confidence: 'med', source_url: 'https://www.help4nepal.org.uk/funding/' },
        decision_timeline: { snippet: 'If you do not receive a reply within four weeks of your application date, please understand that your application has not been successful this time.', confidence: 'high', source_url: 'https://www.help4nepal.org.uk/funding/' },
      } } },

  // ── Postcode International Trust (invitation only) ──────────────────────────
  { title: 'Postcode International Trust — Grants', funder: 'Postcode International Trust', funder_type: 'lottery',
    funding_type: 'grant', funding_subtypes: ['project', 'core_costs'],
    apply_url: 'https://www.postcodeinternationaltrust.org.uk/about-us/how-to-apply', url_status: 'unchecked',
    location_tag: 'International', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: false,
    is_invite_only: true,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'ltd_guarantee'], impact_sectors: ['international'], target_beneficiaries: ['people_in_poverty'],
    niche_tags: ['development_aid', 'humanitarian'],
    description: 'Postcode International Trust, funded by players of People’s Postcode Lottery, funds international development and humanitarian work by charities. It is invitation only and there is no open application route: the Trust proactively identifies gaps in its funding portfolio, researches and carries out due diligence on potential beneficiaries, assesses shortlisted organisations in person, and only then asks approved charities to apply formally and present to the Board. Staged so the catalogue records it as a real international funder with a closed front door, rather than leaving a fundraiser to find that out for themselves.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'invite_only',
      who_can_apply: 'Charities selected by the Trust. There is no open application route: the Trust is proactive in approaching charities and, as funds grow, will research and select potential beneficiaries who will be invited to apply.',
      what_they_fund: 'International development and humanitarian work meeting the objectives of the Trust, funded by players of People’s Postcode Lottery.',
      typical_award: 'No per-applicant figure is published.',
      exclusions: 'Unsolicited applications. Only organisations the Trust has identified, researched and shortlisted are asked to apply.',
      geographic_focus: 'International.',
      decision_timeline: 'No rounds. Shortlisted beneficiaries are assessed by the Trust team in person and presented to the Board, which approves, rejects or asks for further information.',
      how_to_apply: 'There is no way to apply unprompted. Approved charities are asked to formally apply and to present their application in person to the Board.',
      _citations: {
        who_can_apply: { snippet: 'The Trust currently funds a selection of charities meeting the objectives of the Trust. It is proactive in approaching charities and, as funds grow, will thoroughly research and select potential beneficiaries who will be invited to apply.', confidence: 'high', source_url: 'https://www.postcodeinternationaltrust.org.uk/about-us/how-to-apply' },
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

  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  let staged = 0
  let skipped = 0
  for (const row of NEW) {
    const exact = all.filter(d => d.apply_url && norm(d.apply_url) === norm(row.apply_url))
    if (exact.length) { console.log(`  already_held (url), skipping: ${row.title}`); skipped++; continue }
    // A funder-name match is not on its own a reason to skip here: Waterloo and
    // Oak are deliberately staged as per-programme rows beside a whole-funder
    // row, the same shape as the Waterloo Wales Fund row already published.
    // Report the collision so Paul sees it at review, then stage.
    const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase())
    if (sameFunder.length) console.log(`  note: same funder already held -> ${sameFunder.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`)
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: row.pipeline_state ?? 'tagged_awaiting_review' }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id)
    staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length - skipped}, skipped ${skipped}`)
}
main().catch(e => { console.error(e); process.exit(1) })
