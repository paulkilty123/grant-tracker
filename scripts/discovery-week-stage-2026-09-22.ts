// Discovery week, 22 to 28 September 2026 (docs/handoffs/discovery-week-2026-09-22.md).
// Sixteen rows staged hidden for review. Every page read by curl with a browser
// user agent in this session; no model call, no Anthropic spend. The keyless
// reader proxy (r.jina.ai) refused anonymous queries from this network, so
// hosts that curl could not read are recorded as bot_walled in the results file.
//
//   set -a; . ./.env.local; set +a; npx tsx scripts/discovery-week-stage-2026-09-22.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:discovery-week-2026-09-22'
const TODAY = '2026-09-21'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }

const U = {
  golsoncott: 'https://www.golsoncott.org.uk/',
  sfkPort: 'https://suffolkcf.org.uk/grants/port-community-fund/',
  sfkStimulus: 'https://suffolkcf.org.uk/grants/stimulus-fund/',
  sfkAxter: 'https://suffolkcf.org.uk/grants/the-axter-climate-community-fund/',
  fnSwef: 'https://www.forevernotts.com/grant/swef-grant-programme/',
  fnRtc: 'https://www.forevernotts.com/grant/rtc-fund/',
  fnTreffry: 'https://www.forevernotts.com/grant/brian-treffry-and-joan-oliver-fund/',
  fnHartley: 'https://www.forevernotts.com/grant/dave-hartley-fund/',
  equity: 'https://www.equitycharitabletrust.org.uk/other-grants/theatre-grants/',
  february: 'https://www.thefebruaryfoundation.org/',
  savoy: 'https://savoyeducationaltrust.org.uk/how-to-apply/',
  savoyHome: 'https://savoyeducationaltrust.org.uk/',
  shanly: 'https://www.shanlyfoundation.com/grants/general-grants/',
  shanlyHome: 'https://www.shanlyfoundation.com/',
  laing: 'https://www.laingfamilytrusts.org.uk/how-to-apply/',
  laingKirby: 'https://www.laingfamilytrusts.org.uk/what-we-fund/kirby-laing-foundation/',
  laingHome: 'https://www.laingfamilytrusts.org.uk/',
  bbcf: 'https://www.ecb.co.uk/play/club-support/club-funding/building-belonging-cricket-fund',
  ecbIndex: 'https://www.ecb.co.uk/play/club-support/club-funding',
  fundingDifferently: 'https://communitysouthwark.org/exciting-grant-opportunity-funding-differently-2026-27-opens-september-9th/',
  ussc: 'https://www.ustsc.org.uk/community-investment/funding-differently/',
  bfiScreenHeritage: 'https://www.bfi.org.uk/get-funding-support/bfi-national-lottery-screen-heritage-fund',
}

const NEW: Row[] = [
  // ── 1. Arts, UK-wide. Mercury Theatre and Unicorn Theatre shape.
  {
    title: 'Golsoncott Foundation — Arts Grants', funder: 'The Golsoncott Foundation',
    funder_type: 'trust_foundation', funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    apply_url: U.golsoncott, url_status: 'unchecked',
    location_tag: 'UK', is_local: false,
    amount_min: null, amount_max: 3000, amount_undisclosed: false, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'unincorporated'],
    impact_sectors: ['creative', 'education'], target_beneficiaries: ['general_public'],
    niche_tags: ['performing_arts', 'music', 'visual_arts'],
    description: 'Grants of up to £3,000 from the Golsoncott Foundation to further artistic excellence and promote education in the arts. Recent support has gone to new writing, theatre, music, ballet and visual art. There is no application form; applications are emailed and considered at quarterly trustee meetings in late February, May, August and November, and should arrive at least three weeks beforehand. The window for the late November 2026 meeting opened in early September 2026. The Foundation asks applicants to state their status (charity, CIC, registered company). It does not fund individuals on academic or vocational courses, schools, or capital appeals by museums, galleries, theatres or arts complexes.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations working in the arts; the Foundation asks applicants to state their status as a charity, CIC or registered company. Institutions may apply for general bursary funds. Individuals seeking funding for academic or vocational courses, and schools, cannot apply.',
      what_they_fund: 'Artistic excellence and education in the arts. Recent grants have supported new writing, theatre, music, ballet and visual art. Applications should state whether the award sought is for a project as a whole or for a particular component, and must evidence clear public benefit against the trust purpose to promote, maintain, improve and advance the education of the public in the arts.',
      typical_award: 'Grants do not exceed £3,000 and are typically not given on a recurrent basis.',
      exclusions: 'Individuals seeking funding for academic or vocational courses (though institutions may apply for general bursary funds); schools; and museums, galleries, theatres, arts complexes or other projects running capital appeals. No further application is considered for at least 12 months after a previous outcome.',
      priorities: 'Artistic excellence and public education in the arts.',
      geographic_focus: 'United Kingdom.',
      decision_timeline: 'Trustees meet four times a year, typically late February, May, August and November. Applications should be submitted at least three weeks before a meeting, and the deadline may be brought forward if application volume is high. The window for the late November 2026 meeting opened in early September 2026.',
      how_to_apply: 'No set application form. Email a project statement, evidence of public benefit, the amount requested, details of other funders approached, and an annual report and accounts to admin@golsoncott.org.uk, ideally as a PDF.',
      _citations: {
        typical_award: { snippet: 'Grants do not exceed £3,000 and are typically not given on a recurrent basis.', confidence: 'high', source_url: U.golsoncott },
        who_can_apply: { snippet: 'state the status of the applicant or organisation (charity, CIC, registered company, etc)', confidence: 'high', source_url: U.golsoncott },
        decision_timeline: { snippet: 'The window for the following quarter’s meeting in late November 2026 will be open in early September', confidence: 'high', source_url: U.golsoncott },
        exclusions: { snippet: 'we cannot accept applications from : individuals seeking funding for academic or vocational courses, although we will consider applications from institutions for general bursary funds; schools; and museums, galleries, theatres, arts complexes, or other projects running capital appeals.', confidence: 'high', source_url: U.golsoncott },
      },
    },
  },

  // ── 2. Suffolk CF, Port Community Fund. GoStart shape (Suffolk place layer).
  {
    title: 'Suffolk Community Foundation — Port Community Fund', funder: 'Suffolk Community Foundation',
    funder_type: 'community_foundation', funding_type: 'grant', funding_subtypes: ['small_grant', 'unrestricted'],
    apply_url: U.sfkPort, url_status: 'unchecked',
    location_tag: 'Suffolk', is_local: true,
    amount_min: null, amount_max: 2000, amount_undisclosed: false, deadline: '2026-10-19', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'health'], target_beneficiaries: ['general_public', 'people_in_poverty'],
    niche_tags: ['felixstowe', 'ipswich', 'woodbridge'],
    description: 'Grants of up to £2,000 for grassroots Suffolk-based charitable and community organisations supporting people who live and work in Felixstowe and The Trimleys, and in areas of deprivation in Ipswich and Woodbridge. The fund supports local solutions to local needs, community cohesion, sustainable and supportive communities, tackling disadvantage, and health and wellbeing. Core costs and project costs are both eligible. The round opened on 7 September 2026 and closes on 19 October 2026, with decisions by early December. Applications from social enterprises are not accepted for this fund.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Suffolk', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Grassroots Suffolk-based charitable and community organisations supporting those who live and work in Felixstowe and The Trimleys, and areas of deprivation in Ipswich and Woodbridge. Suffolk Community Foundation records this fund as not accepting applications from social enterprises.',
      what_they_fund: 'Core costs and project costs. Local community issues and initiatives addressing priority needs: supporting local solutions to meet local needs, promoting community cohesion, developing sustainable and supportive communities, tackling disadvantage and promoting health and wellbeing.',
      typical_award: 'Standard grants up to £2,000.',
      exclusions: 'Applications from social enterprises are not accepted for this fund. Suffolk Community Foundation notes that only one grant can be awarded per fund per organisation per year.',
      priorities: 'Grassroots organisations in Felixstowe, The Trimleys, and deprived areas of Ipswich and Woodbridge.',
      geographic_focus: 'Felixstowe and The Trimleys, and areas of deprivation in Ipswich and Woodbridge, Suffolk.',
      decision_timeline: 'Opened 7 September 2026; deadline 19 October 2026 with decisions by early December.',
      how_to_apply: 'Online application through Suffolk Community Foundation’s funding portal, linked from the fund page.',
      _citations: {
        typical_award: { snippet: 'The Fund will offer standard grants up to £2,000.', confidence: 'high', source_url: U.sfkPort },
        who_can_apply: { snippet: 'Grants for grassroot Suffolk-based charitable and community organisations supporting those that live and work in Felixstowe and The Trimleys, and areas of deprivation in Ipswich and Woodbridge.', confidence: 'high', source_url: U.sfkPort },
        decision_timeline: { snippet: '19th October with decisions by early December', confidence: 'high', source_url: U.sfkPort },
      },
    },
  },

  // ── 3. Suffolk CF, Stimulus Fund. Sport, rolling.
  {
    title: 'Suffolk Community Foundation — Stimulus Fund (tennis)', funder: 'Suffolk Community Foundation',
    funder_type: 'community_foundation', funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    apply_url: U.sfkStimulus, url_status: 'unchecked',
    location_tag: 'Suffolk', is_local: true,
    amount_min: null, amount_max: 1000, amount_undisclosed: false, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['sport', 'community'], target_beneficiaries: ['young_people', 'people_in_poverty'],
    niche_tags: ['tennis', 'grassroots_sport'],
    description: 'Grants of up to £1,000 from the Suffolk Lawn Tennis Association fund held at Suffolk Community Foundation, for charitable, voluntary and community groups running grassroots projects that promote tennis in areas of deprivation, including rural areas, and help people who are disadvantaged or vulnerable. It encourages young people up to the age of 30 to take up or return to tennis, with the emphasis on increasing membership and making sessions sustainable. Activity camps that include other sports count where tennis is a major part with a qualified LTA coach. Project costs only. Open all year round with decisions made as demand dictates. Applications from social enterprises are not accepted for this fund.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Suffolk', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charitable, voluntary and community groups in Suffolk. Suffolk Community Foundation records this fund as not accepting applications from social enterprises.',
      what_they_fund: 'Project costs for local grassroots projects promoting tennis in areas of deprivation, including rural areas, and helping people who are disadvantaged or vulnerable. Encourages young people up to the age of 30 to enjoy or return to tennis, with the emphasis on increasing membership and making sessions sustainable. Activity camps including other sports are considered where tennis is a major part and an experienced tennis coach supports the sessions.',
      typical_award: 'Grants of up to £1,000.',
      exclusions: 'Applications from social enterprises are not accepted for this fund. Tennis coaching within a funded project must only be undertaken by qualified LTA coaches.',
      priorities: 'Tennis in areas of deprivation, including rural areas; young people up to 30.',
      geographic_focus: 'Suffolk.',
      decision_timeline: 'Open all year round. Decisions are made on a regular basis as demand dictates.',
      how_to_apply: 'Online application through Suffolk Community Foundation’s funding portal, linked from the fund page. Applicants are asked to contact a Grants Officer before submitting if they have questions.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £1,000 are available for charitable, voluntary and community groups', confidence: 'high', source_url: U.sfkStimulus },
        what_they_fund: { snippet: 'It looks to encourage young people up to the age of 30 to enjoy or return to the sport of tennis with the emphasis on increasing membership and making tennis sessions sustainable.', confidence: 'high', source_url: U.sfkStimulus },
        decision_timeline: { snippet: 'Open all year round. Decisions will be made on a regular basis as demand dictates.', confidence: 'high', source_url: U.sfkStimulus },
      },
    },
  },

  // ── 4. Suffolk CF, Axter Climate & Community Fund. Open to social enterprises.
  {
    title: 'Suffolk Community Foundation — Axter Climate & Community Fund', funder: 'Suffolk Community Foundation',
    funder_type: 'community_foundation', funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    apply_url: U.sfkAxter, url_status: 'unchecked',
    location_tag: 'Suffolk', is_local: true,
    amount_min: null, amount_max: 3000, amount_undisclosed: false, deadline: '2026-10-02', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['environment', 'health', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['green_social_prescribing', 'biodiversity', 'nature_recovery'],
    description: 'Grants of up to £3,000 to charities, community, voluntary and faith groups, and social enterprises based in and supporting people living in Suffolk, for climate action and community health and wellbeing projects that have a positive impact on people, the environment and nature. Priorities are improving community health and wellbeing and reducing health inequalities through better community access to green social prescribing activities, and promoting community biodiversity and nature recovery. Project costs only. One funding panel a year; the round opened on Monday 24 August 2026 and closes on Friday 2 October 2026.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Suffolk', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities, community, voluntary and faith groups, and social enterprises based in and supporting those living in Suffolk.',
      what_they_fund: 'Project costs for climate action and community health and wellbeing projects with a positive impact on people, the environment and nature: improving community health and wellbeing and reducing health inequalities through greater community access to green social prescribing activities and interventions, and promoting community biodiversity and nature recovery.',
      typical_award: 'Grants of up to £3,000.',
      exclusions: 'Project costs only; core costs are not funded through this fund. Suffolk Community Foundation’s general grantmaking guidelines also apply.',
      priorities: 'Green social prescribing; community biodiversity and nature recovery.',
      geographic_focus: 'Suffolk.',
      decision_timeline: 'One funding panel a year. The round opened Monday 24 August and closes Friday 2 October 2026.',
      how_to_apply: 'Online application through Suffolk Community Foundation’s funding portal, linked from the fund page.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £3,000 are available to charities, community, voluntary and faith groups, as well as social enterprises based in and supporting those living in Suffolk.', confidence: 'high', source_url: U.sfkAxter },
        who_can_apply: { snippet: 'Grants of up to £3,000 are available to charities, community, voluntary and faith groups, as well as social enterprises based in and supporting those living in Suffolk.', confidence: 'high', source_url: U.sfkAxter },
        decision_timeline: { snippet: 'Friday 2nd October', confidence: 'high', source_url: U.sfkAxter },
        what_they_fund: { snippet: 'Improve the health and wellbeing of our communities and reduce health inequalities through great community access to Green Social Prescribing activities and interventions', confidence: 'high', source_url: U.sfkAxter },
      },
    },
  },

  // ── 5. Forever Notts, SWEF. Open to companies. Redhill Fields shape.
  {
    title: 'Forever Notts — SWEF Grant Programme (young people’s businesses)', funder: 'Forever Notts (Nottinghamshire Community Foundation)',
    funder_type: 'community_foundation', funding_type: 'grant', funding_subtypes: ['small_grant', 'capital'],
    apply_url: U.fnSwef, url_status: 'unchecked',
    location_tag: 'Nottinghamshire', is_local: true,
    amount_min: 200, amount_max: 2000, amount_undisclosed: false, deadline: null, is_rolling: true,
    eligible_structures: ['sole_trader', 'ltd_shares', 'cic_shares', 'cic_guarantee'],
    impact_sectors: ['employment', 'social_economy'], target_beneficiaries: ['young_people', 'people_in_poverty'],
    niche_tags: ['enterprise', 'start_up', 'neet'],
    description: 'Grants of £200 to £2,000 for businesses run by people aged 18 to 30 who live and work in Nottingham City or Nottinghamshire County, particularly those not in education, employment or training, or from a low income household. A Start-Up Grant of up to £500 is available for pre-revenue or early-stage businesses, and a Business Grant of up to £2,000 for established businesses with trading income. The business must have been trading for under two years, including those about to start, and must have a sole trader or business bank account. The grant can pay for equipment, materials or stock for a new product line, prototypes, a website or booking system build, training or product development, but not salaries, living costs, rent, utilities, debt repayment or new computers, phones or tablets. Applications are cut off on the 7th of each month.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Nottinghamshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'People aged 18 to 30 running a business, who currently live and work in Nottingham City or Nottinghamshire County, are from a low income household or facing other challenges preventing them from developing their business, whose business has been trading for under two years (including those about to start), and who already have a sole trader or business bank account in the name of the business or are in the process of getting one. A reference from an unrelated referee is required.',
      what_they_fund: 'Equipment that brings in a second revenue stream or increases production where there is proven demand; materials and stock for a new product line; prototypes; website or booking system build; training; product development.',
      typical_award: 'Start-Up Grant: up to £500 for pre-revenue or early-stage businesses. Business Grant: up to £2,000 for established businesses with trading income. Grants range from £200 to £2,000.',
      exclusions: 'Salaries; debt repayment; app or software development costs; rent and utilities; stock for an existing product line; equipment for invasive beauty treatments such as botox, aesthetics, semi-permanent make-up, facial tattoos or dermal fillers; ongoing software subscriptions; new computers, phones or tablets (refurbished technology may be considered on a match funded basis). Living costs and the applicant’s own salary cannot be funded.',
      priorities: 'Young people not in education, employment or training.',
      geographic_focus: 'Nottingham City and Nottinghamshire County.',
      decision_timeline: 'Rolling, with an application cut-off on the 7th of each month. Applicants may be invited to an online meeting.',
      how_to_apply: 'Online application form via the Forever Notts Fundseeker portal, with an unrelated referee’s details and a recent business bank statement.',
      _citations: {
        typical_award: { snippet: 'Business Grant: Up to £2,000 for established businesses (with trading income)', confidence: 'high', source_url: U.fnSwef },
        who_can_apply: { snippet: 'are aged between 18 to 30 years old', confidence: 'high', source_url: U.fnSwef },
        decision_timeline: { snippet: 'Application cut off 7th of each month', confidence: 'high', source_url: U.fnSwef },
        exclusions: { snippet: 'Ineligible Use of Funds \n Salaries\n Debt repayment', confidence: 'med', source_url: U.fnSwef },
      },
    },
  },

  // ── 6. Forever Notts, RTC Fund. Rural older people.
  {
    title: 'Forever Notts — RTC Fund (rural older people)', funder: 'Forever Notts (Nottinghamshire Community Foundation)',
    funder_type: 'community_foundation', funding_type: 'grant', funding_subtypes: ['small_grant', 'capital'],
    apply_url: U.fnRtc, url_status: 'unchecked',
    location_tag: 'Nottinghamshire', is_local: true,
    amount_min: null, amount_max: 500, amount_undisclosed: false, deadline: '2027-05-22', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['older_people', 'community'], target_beneficiaries: ['older_people', 'rural_communities'],
    niche_tags: ['befriending', 'social_isolation'],
    description: 'Grants of up to £500 to community and voluntary groups serving senior citizens in Nottinghamshire’s rural areas, towards community activities that bring elderly people together, offer befriending or improve their lives in meaningful ways. Project and capital costs. The fund is available countywide excluding major urban areas. It is an annual grant awarded in autumn each year, with a closing date of 22 May each year; the current round is open and closes on 22 May 2027.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Nottinghamshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community and voluntary groups serving senior citizens in their communities in Nottinghamshire’s rural areas. The fund is available countywide excluding major urban areas.',
      what_they_fund: 'Project and capital costs for community activities that bring elderly people together, offer befriending or improve their lives in meaningful ways.',
      typical_award: 'Up to £500 per grant.',
      exclusions: 'Major urban areas of Nottinghamshire are excluded.',
      priorities: 'Rural older people; befriending and social connection.',
      geographic_focus: 'Nottinghamshire, countywide excluding major urban areas.',
      decision_timeline: 'An annual grant awarded in autumn each year. Closing date for applications is 22 May each year; the open round closes 22 May 2027. Monitoring is requested one year after award.',
      how_to_apply: 'Online application form through the Forever Notts Fundseeker portal, which requires a login.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £500 are available to towards community activities that bring elderly people together, offer befriending or improve their lives in meaningful ways.', confidence: 'high', source_url: U.fnRtc },
        who_can_apply: { snippet: 'making grants to community and voluntary groups serving senior citizens in their communities.', confidence: 'high', source_url: U.fnRtc },
        decision_timeline: { snippet: 'Closing date for applications is 22nd May each year.', confidence: 'high', source_url: U.fnRtc },
      },
    },
  },

  // ── 7. Forever Notts, Brian Treffry and Joan Oliver Fund. Arts.
  {
    title: 'Forever Notts — Brian Treffry and Joan Oliver Fund', funder: 'Forever Notts (Nottinghamshire Community Foundation)',
    funder_type: 'community_foundation', funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: U.fnTreffry, url_status: 'unchecked',
    location_tag: 'Nottinghamshire', is_local: true,
    amount_min: null, amount_max: 500, amount_undisclosed: false, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'unincorporated', 'individual'],
    impact_sectors: ['creative'], target_beneficiaries: ['young_people'],
    niche_tags: ['fine_art', 'art_therapy'],
    description: 'A small grant of up to £500 from Forever Notts for young people aged 16 to 25 in Nottinghamshire who show talent in fine art, and for community groups running art work or art therapy activities. The fund can pay for art materials, additional training, exhibition space or help towards higher education fees. Community groups apply by emailing a brief description of the group with a copy of its constitution and an indication of what the grant would be used for; the group must be based in the county of Nottinghamshire. The fund is open and has no stated deadline.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Nottinghamshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community groups based in the county of Nottinghamshire running art work or art therapy activities, and individuals aged 16 to 25 resident in Nottinghamshire who show talent in fine art. Community groups must supply a copy of their constitution.',
      what_they_fund: 'Art materials, additional training, exhibition space and help towards higher education fees.',
      typical_award: 'A small grant of up to £500.',
      exclusions: 'The page states no exclusions beyond the age range for individuals and the Nottinghamshire residence or base requirement.',
      priorities: 'Talented young artists in Nottinghamshire; community art and art therapy activity.',
      geographic_focus: 'Nottinghamshire.',
      decision_timeline: 'Open, with no deadline stated on the fund page.',
      how_to_apply: 'Community groups email a brief description of the group, a copy of the constitution and an indication of what the grant will be used for to Forever Notts. Individuals email a CV with photographs of their work plus a sponsor’s reference.',
      _citations: {
        typical_award: { snippet: 'A small grant of up to £500 is available for young people between the ages of 16 and 25', confidence: 'high', source_url: U.fnTreffry },
        who_can_apply: { snippet: 'Community groups please email a brief description of your group together with a copy of your constitution', confidence: 'high', source_url: U.fnTreffry },
        what_they_fund: { snippet: 'Art materials\n Additional training\n Exhibition space\n Help towards higher education fees, etc.', confidence: 'med', source_url: U.fnTreffry },
      },
    },
  },

  // ── 8. Forever Notts, Dave Hartley Fund. Music, rolling.
  {
    title: 'Forever Notts — Dave Hartley Fund (music)', funder: 'Forever Notts (Nottinghamshire Community Foundation)',
    funder_type: 'community_foundation', funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: U.fnHartley, url_status: 'unchecked',
    location_tag: 'Nottinghamshire', is_local: true,
    amount_min: null, amount_max: 250, amount_undisclosed: false, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'unincorporated', 'individual'],
    impact_sectors: ['creative', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['music', 'mansfield', 'ashfield'],
    description: 'Grants of up to £250 to community and voluntary groups and individuals in the Mansfield and Ashfield area of Nottinghamshire, to appreciate, learn and perform music to others. The funding can buy new instruments or supportive musical equipment and items that enable musical groups to develop and individuals to increase their musical ability and self esteem. Priority goes to groups and individuals that cannot be supported through other funds. It is a rolling programme and applications are assessed immediately for consideration. Monitoring is requested six months after award.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Nottinghamshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community and voluntary groups and individuals in the Mansfield and Ashfield area.',
      what_they_fund: 'Purchase of new instruments or supportive musical equipment and items that enable musical groups to develop and individuals to increase their musical ability and self esteem.',
      typical_award: 'Grants of up to £250.',
      exclusions: 'The page states no exclusions beyond the Mansfield and Ashfield geography. Priority is given to groups and individuals that cannot be supported through other funds.',
      priorities: 'Groups and individuals who cannot be supported through other funds.',
      geographic_focus: 'The Mansfield and Ashfield area of Nottinghamshire.',
      decision_timeline: 'Rolling programme; applications are assessed immediately for consideration. Monitoring is requested six months after award.',
      how_to_apply: 'Online application form through the Forever Notts portal, linked from the fund page.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £250 will be available to people of the Mansfield and Ashfield area.', confidence: 'high', source_url: U.fnHartley },
        who_can_apply: { snippet: 'The aim of the Dave Hartley Fund is to encourage community and voluntary groups and individuals, to appreciate, learn and perform music to others.', confidence: 'high', source_url: U.fnHartley },
        decision_timeline: { snippet: 'Grants are available for amounts up to £250 and applications will be assessed immediately for consideration', confidence: 'high', source_url: U.fnHartley },
      },
    },
  },

  // ── 9. Equity Charitable Trust theatre grants. Mercury and Unicorn shape.
  {
    title: 'Equity Charitable Trust — Theatre Grants', funder: 'Equity Charitable Trust',
    funder_type: 'trust_foundation', funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: U.equity, url_status: 'unchecked',
    location_tag: 'UK', is_local: false,
    amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee'],
    impact_sectors: ['creative'], target_beneficiaries: ['general_public'],
    niche_tags: ['theatre', 'capital_works', 'backstage'],
    description: 'Modest grants from the Equity Charitable Trust for capital building projects at theatres that benefit actors directly, such as green rooms or backstage facilities. The Trust says its spending threshold tends to be in the region of £5,000. Production costs are not funded. There is no published deadline or form: applicants email the Trust for further information. The Trust does not state a maximum grant, so amounts are left undisclosed here.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations running theatres with capital building projects that benefit actors directly. The page does not name legal structures; it describes the projects rather than the applicant type.',
      what_they_fund: 'Capital building projects that benefit actors directly, such as funding for green rooms or backstage facilities.',
      typical_award: 'The Trust states that its spending threshold tends to be in the region of £5,000. No maximum grant is published.',
      exclusions: 'The Trust does not fund any production costs.',
      priorities: 'Facilities that benefit actors directly.',
      geographic_focus: 'United Kingdom.',
      decision_timeline: 'No published round or deadline. The page directs applicants to email for further information.',
      how_to_apply: 'Email info@equitycharitabletrust.org.uk for further information; there is no online form on the page.',
      _citations: {
        what_they_fund: { snippet: 'We consider Capital building projects that benefit actors directly, such as funding for Green Rooms or backstage facilities.', confidence: 'high', source_url: U.equity },
        typical_award: { snippet: 'Our spending threshold tends to be in the region of £5K.', confidence: 'high', source_url: U.equity },
        exclusions: { snippet: 'We don’t fund any production costs.', confidence: 'high', source_url: U.equity },
      },
    },
  },

  // ── 10. The February Foundation. General addition, rolling monthly.
  {
    title: 'The February Foundation — Grants', funder: 'The February Foundation',
    funder_type: 'trust_foundation', funding_type: 'grant', funding_subtypes: ['unrestricted', 'capital'],
    apply_url: U.february, url_status: 'unchecked',
    location_tag: 'UK', is_local: false,
    amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio'],
    impact_sectors: ['health', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['hospice', 'end_of_life_care'],
    description: 'Grants from The February Foundation to UK registered charities for core, project or capital costs. Since 2006 its main focus has been end-of-life care in hospice and hospice-at-home settings, but it considers applications more widely. Its median award is £5,000 and it is happy to part-fund; around 20 per cent of applications succeed. There is no application form and no deadline: applications are emailed as a two or three page document and trustees decide monthly, normally within twelve weeks. Community interest companies, individuals, community centres, housing associations, education bodies and animal charities are among those not eligible.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities only. The Foundation says plainly: do not apply if you are not a registered charity.',
      what_they_fund: 'Core costs, project costs or capital costs. The main focus since 2006 has been end-of-life care in a hospice and hospice-at-home context, alongside other areas listed in the annual accounts. Re-applications can be for the continuation of previously funded projects.',
      typical_award: 'The median award is £5,000. The Foundation is happy to part-fund projects; around 20 per cent of applications are successful.',
      exclusions: 'Air ambulances; animal support charities; party-politically driven charities; charities with a commercial bias for a particular product or company; charities with an aggressive religious bias; child care; Citizens Advice Bureaux; community centres; Community Interest Companies; education including adult, further, higher, primary, secondary and special educational needs; housing associations; individuals.',
      priorities: 'End-of-life care in hospice and hospice-at-home settings.',
      geographic_focus: 'United Kingdom.',
      decision_timeline: 'No application deadlines; trustees normally make grant decisions monthly. It normally takes a maximum of twelve weeks from application to decision. Successful and unsuccessful applicants should not re-apply for at least twelve months.',
      how_to_apply: 'Email a two to three page application as a Word document or PDF to Richard Pierce-Saunderson, with a budget as a separate document, most recent audited accounts, reserves and cash position, headcount and beneficiary numbers. No application form and no links to documents.',
      _citations: {
        who_can_apply: { snippet: 'Please do not apply if you are not a registered charity.', confidence: 'high', source_url: U.february },
        typical_award: { snippet: 'Our median award is £5,000.', confidence: 'high', source_url: U.february },
        decision_timeline: { snippet: 'There are no application deadlines as trustees normally make grant decisions on a monthly basis.', confidence: 'high', source_url: U.february },
        exclusions: { snippet: 'Community Interest Companies (CICs);', confidence: 'high', source_url: U.february },
      },
    },
  },

  // ── 11. Savoy Educational Trust. Hospitality skills. Deadline 22 Oct 2026.
  {
    title: 'Savoy Educational Trust — Hospitality Education and Training Grants', funder: 'Savoy Educational Trust',
    funder_type: 'trust_foundation', funding_type: 'grant', funding_subtypes: ['restricted', 'capital'],
    apply_url: U.savoy, url_status: 'unchecked',
    location_tag: 'UK', is_local: false,
    amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2026-10-22', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    impact_sectors: ['education', 'employment'], target_beneficiaries: ['young_people'],
    niche_tags: ['hospitality', 'skills', 'qualifications'],
    description: 'Grants from the Savoy Educational Trust for the advancement and development of education, training and qualifications for the benefit of the UK hospitality industry. Applicants must be a UK registered or exempted charity, charitable incorporated organisation, community interest company, company limited by guarantee (non-profit), or recognised industry association, in existence for more than a year with accounts available. Grants of up to £10,000 use a single application form; above £10,000 there is a two-stage process starting with an expression of interest. Applications close at 5pm on 22 October 2026 for the 3 December 2026 meeting, with a further deadline of 21 January 2027. The Trust does not publish a maximum grant. It is generally not the sole funder and expects other sources to contribute at least 10 per cent on projects up to £10,000, rising to 50 per cent on grants of £50,000 or more.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered or exempted charities, charitable incorporated organisations, community interest companies, non-profit companies limited by guarantee, and recognised industry associations. The organisation must have existed for more than one year and be able to provide a certified copy of its most recent accounts, and must not have received a grant from the Trust in the last twelve months.',
      what_they_fund: 'Projects directly related to UK hospitality education, skills, training and qualifications, and for the benefit of those engaged in hospitality competitions. The Trust makes grants to educational establishments, charitable and not-for-profit organisations and relevant industry associations.',
      typical_award: 'No maximum grant is published. Grants of up to £10,000 use a single application form; grants exceeding £10,000 use a two-stage process beginning with an expression of interest.',
      exclusions: 'Retrospective funding and core cost funding are not covered by the standard route (the Trust asks applicants to contact it separately about core costs). The Trust generally does not act as the sole funder: it expects minimum contributions from other sources of 10 per cent for projects up to £10,000, 20 per cent between £10,000 and £20,000, 40 per cent over £20,000, and at least 50 per cent match funding for grants of £50,000 and above. The core costs of competitions are not covered.',
      priorities: 'Education, training and qualifications for the UK hospitality industry, and hospitality competitions.',
      geographic_focus: 'United Kingdom.',
      decision_timeline: 'Applications must be submitted by 5pm on the deadline date. The next deadline is Thursday 22 October 2026 for the Thursday 3 December 2026 meeting, followed by Thursday 21 January 2027 for the Thursday 4 March 2027 meeting. Project applications should have a start date at least two months after the meeting date.',
      how_to_apply: 'Complete the eligibility quiz on the How to Apply page, which releases a link to the application form or, for grants above £10,000, the expression of interest form.',
      _citations: {
        who_can_apply: { snippet: 'Is your organisation a UK registered charity/exempted charity, charitable incorporated organisation, Community Interest Company, Company Limited by Guarantee (non-profit), or recognised industry association?', confidence: 'high', source_url: U.savoy },
        decision_timeline: { snippet: 'Thursday 22nd October 2026 Thursday 3rd December 2026', confidence: 'high', source_url: U.savoy },
        typical_award: { snippet: 'For grants of up to £10,000 , you are required to complete an application form.', confidence: 'high', source_url: U.savoy },
        what_they_fund: { snippet: 'The Savoy Educational Trust makes grants to educational establishments, charitable and not-for-profit organisations and relevant industry associations.', confidence: 'high', source_url: U.savoyHome },
      },
    },
  },

  // ── 12. Shanly Foundation general grants. Rolling monthly, South East England.
  {
    title: 'Shanly Foundation — General Grants', funder: 'Shanly Foundation',
    funder_type: 'corporate_foundation', funding_type: 'grant', funding_subtypes: ['unrestricted', 'capital'],
    apply_url: U.shanly, url_status: 'unchecked',
    location_tag: 'South East England', is_local: true,
    amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares'],
    impact_sectors: ['community', 'disability', 'older_people'], target_beneficiaries: ['general_public', 'disabled_people', 'older_people'],
    niche_tags: ['local_sports_clubs', 'scouting_guiding', 'conservation'],
    description: 'General grants from the Shanly Foundation, funded by the Shanly Group, for single, project, capital, core and unrestricted costs. Applicants must be registered charities, community interest companies, charitable incorporated organisations, or exempt or excepted bodies under Charity Commission guidance, in existence for more than twelve months with a dedicated bank account. The Foundation supports organisations that assist physically and mentally disabled people, older people and disadvantaged members of local communities, organisations that help rehabilitate citizens back into local communities, local sports and social clubs, scouting, guiding and Rotary groups, outdoor activity centres for young people, woodland and environmental conservation organisations, and community fundraising events. Good causes are primarily in Buckinghamshire, Berkshire, Hertfordshire, South East Oxfordshire, West Sussex, Surrey, Kent and Hampshire. The board meets monthly. No grant amount is published.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'South East England', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, Community Interest Companies, Charitable Incorporated Organisations, and bodies exempt or excepted under Charity Commission guidance. The organisation must have been in existence for more than twelve months and have a dedicated bank account.',
      what_they_fund: 'Single, project, capital, core and unrestricted grants. Organisations assisting physically and mentally disabled people, the elderly and disadvantaged members of local communities; organisations helping rehabilitate citizens back into local communities; local sports and social clubs; local scouting, guiding, Rotary and similar community organisations; outdoor activity centres for young people; woodland and environmental conservation organisations; and social and community events that raise funds for local good causes.',
      typical_award: 'The Foundation does not publish a grant range on this page.',
      exclusions: 'Individuals; research; military charities; single faith charities; international awards except in response to international disasters; activities that have already taken place; organisations in existence for less than twelve months; organisations without a bank account; organisations that have received a grant in the last twelve months.',
      priorities: 'Disability, older people, local community disadvantage, rehabilitation, local sport, youth outdoor activity and conservation.',
      geographic_focus: 'Primarily Buckinghamshire, Berkshire, Hertfordshire, South East Oxfordshire, West Sussex, Surrey, Kent and Hampshire.',
      decision_timeline: 'The board meets monthly to consider requests and deliver decisions quickly. There is no application deadline.',
      how_to_apply: 'Online application through the Shanly Foundation website’s applicant portal.',
      _citations: {
        who_can_apply: { snippet: 'Registered charities, Community Interest Companies (CIC), Charitable Incorporated Organisations (CIO), Exempt or Excepted under Charity Commission guidance', confidence: 'high', source_url: U.shanly },
        decision_timeline: { snippet: 'the board meet monthly to consider requests and deliver speedy decisions', confidence: 'high', source_url: U.shanly },
        geographic_focus: { snippet: 'These good causes are primarily based within Buckinghamshire, Berkshire, Hertfordshire, Southeast Oxfordshire, West Sussex, Surrey, Kent, and Hampshire.', confidence: 'high', source_url: U.shanlyHome },
        exclusions: { snippet: 'Not eligible to apply: \n Individuals \n For research \n Military charities \n Single faith charities', confidence: 'med', source_url: U.shanly },
      },
    },
  },

  // ── 13. Laing Family Trusts, coordinated application. One front door, banked.
  {
    title: 'Laing Family Trusts — Grants (Kirby Laing, Martin Laing, Maurice & Hilda Laing)', funder: 'Laing Family Trusts',
    funder_type: 'trust_foundation', funding_type: 'grant', funding_subtypes: ['restricted', 'capital'],
    apply_url: U.laing, url_status: 'unchecked',
    location_tag: 'UK', is_local: false,
    amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio'],
    impact_sectors: ['community', 'creative', 'older_people'], target_beneficiaries: ['general_public', 'older_people', 'young_people'],
    niche_tags: ['christian', 'performing_arts', 'ageing'],
    description: 'A single coordinated application to the Laing Family Trusts, a group of four grant-making trusts with a Christian foundation. Applicants make one application and it is directed automatically to the most appropriate trust. The Beatrice Laing Trust is closed to new applications until further notice, so applications should fit the remit of the Kirby Laing Foundation, the Martin Laing Foundation or the Maurice & Hilda Laing Charitable Trust. The Kirby Laing Foundation’s five streams are promotion of the evangelical Christian faith; health and social care in ageing; developing talent in the performing arts (music and theatre), including programmes that identify and nurture talent in music or drama among children and young people from diverse backgrounds and capital projects that enhance the delivery of those programmes; overseas development in Nepal and Bangladesh; and science and engineering innovation. There is no application form and no deadline: a cover sheet, covering letter and three to four page proposal are posted to the Trusts. Grants are rarely made towards core costs, ongoing project delivery or individuals, and no grant amount is published.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities, which must supply their most recent annual report and audited or independently examined accounts with the application. Applicants complete an eligibility quiz before applying. Applications are made once and directed to whichever of the four trusts fits best; the Beatrice Laing Trust is closed to new applications until further notice.',
      what_they_fund: 'Across the group: promoting Christian faith and values, caring for those in need, and encouraging young people to realise their potential. The Kirby Laing Foundation funds theological education and training; projects nurturing Christian faith among teens to thirties; English cathedrals; research, care models and professional training in ageing and end of life care; programmes with a national or regional focus that identify and nurture talent in music or drama among children and young people from diverse backgrounds, with routes into the profession, including backstage roles, and capital projects that enhance those programmes; overseas development for women, girls and disabled people in Nepal and Bangladesh; and science and engineering innovation in the built environment.',
      typical_award: 'No grant range is published on the Trusts’ How to Apply or Kirby Laing Foundation pages.',
      exclusions: 'Across all areas of giving, grants are rarely made towards core costs, the delivery of ongoing projects or to individuals. Applications are not accepted by email except for the Innovation Leaders Programme and Warm Spaces Programme. The Beatrice Laing Trust is closed to new applications until further notice.',
      priorities: 'Christian faith and values; care for those in need; young people realising their potential, particularly in science and engineering and through Christian youth activities.',
      geographic_focus: 'Primarily the United Kingdom, with an overseas development stream in Nepal and Bangladesh.',
      decision_timeline: 'No published deadline. Applications are posted and, because of volume, receipt is not acknowledged.',
      how_to_apply: 'Complete the eligibility quiz, download the application cover sheet, and post the cover sheet, a covering letter, a three to four page project proposal, the most recent annual report and accounts, and a stamped addressed envelope to the Laing Family Trusts, Mill Hill, London.',
      _citations: {
        how_to_apply: { snippet: 'your application will automatically be directed to the most appropriate of the four Trusts.', confidence: 'high', source_url: U.laing },
        what_they_fund: { snippet: '3. Developing Talent in the Performing Arts (Music & Theatre):', confidence: 'high', source_url: U.laingKirby },
        exclusions: { snippet: 'Across all areas of giving, grants are rarely made towards core costs, the delivery of ongoing projects or to individuals.', confidence: 'high', source_url: U.laingKirby },
        who_can_apply: { snippet: 'The Beatrice Laing Trust is now closed to new applications until further notice.', confidence: 'high', source_url: U.laingHome },
      },
    },
  },

  // ── 14. ECB Building Belonging in Cricket Fund. Bridlington Cricket Foundation shape.
  {
    title: 'ECB Building Belonging in Cricket Fund', funder: 'England and Wales Cricket Board',
    funder_type: 'trust_foundation', funding_type: 'grant', funding_subtypes: ['capital', 'restricted'],
    apply_url: U.bbcf, url_status: 'unchecked',
    location_tag: 'England & Wales', is_local: false,
    amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'unincorporated'],
    impact_sectors: ['sport', 'community'], target_beneficiaries: ['women_girls', 'disabled_people', 'people_in_poverty', 'ethnic_minorities'],
    niche_tags: ['cricket', 'facilities', 'inclusion'],
    description: 'The Building Belonging in Cricket Fund supports projects across England and Wales that benefit women and girls, disabled participants, people with lower incomes or ethnically diverse communities, as part of the ECB’s aim to make cricket the most inclusive team sport. The fund is locally led: projects are developed out of needs identified in Recreational Cricket Board county facilities strategies and countywide strategic plans, and the Recreational Cricket Board identifies projects and instigates the application process. Clubs that believe their project could play a key role in their area are asked to contact their local Recreational Cricket Board first. The ECB’s club funding offer is open to affiliated cricket clubs and other organisations. The fund is £45 million in total, which is a pot rather than a per-applicant award, so amounts are left undisclosed here.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'England & Wales', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'The ECB states that its club funding offer is for affiliated cricket clubs and other organisations, and that eligibility for each scheme is determined by that scheme’s criteria set out in its guidance notes. For this fund, Recreational Cricket Boards identify projects and instigate the application process; a club that believes its project could play a key role in its area is asked to contact its local Recreational Cricket Board first.',
      what_they_fund: 'Projects across England and Wales that benefit women and girls, disabled participants, people with lower incomes or ethnically diverse communities. Projects must come out of needs identified in Recreational Cricket Board county facilities strategies and countywide strategic plans.',
      typical_award: 'The page gives a total fund size of £45 million and does not state a per-applicant grant range.',
      exclusions: 'The fund page states no exclusions; the guidance notes for applicants carry the detailed criteria.',
      priorities: 'Women and girls, disabled participants, people on lower incomes and ethnically diverse communities.',
      geographic_focus: 'England and Wales.',
      decision_timeline: 'No closing date is published. The process is locally led through Recreational Cricket Boards.',
      how_to_apply: 'Contact your local Recreational Cricket Board in the first instance, and read the Guidance Notes for Applicants linked from the fund page. Applications are made through the ECB Investment Management System.',
      _citations: {
        what_they_fund: { snippet: 'will support projects across England and Wales which benefit women and girls, disabled participants, people with lower incomes or ethnically diverse communities', confidence: 'high', source_url: U.bbcf },
        how_to_apply: { snippet: 'RCBs will identify projects and instigate the application process, if you believe your project has the potential to play a key role in your area, we encourage you to get in touch with your local RCB in the first instance', confidence: 'high', source_url: U.bbcf },
        who_can_apply: { snippet: 'ECB’s funding offer to affiliated cricket clubs and other organisations comprises an interest free loan scheme and grant schemes.', confidence: 'high', source_url: U.ecbIndex },
      },
    },
  },

  // ── 15. Funding Differently 2026/27, Southwark. Paws and Pause shape.
  {
    title: 'Funding Differently 2026/27 — Southwark participatory grants', funder: 'Community Southwark (Funding Differently partnership)',
    funder_type: 'trust_foundation', funding_type: 'grant', funding_subtypes: ['unrestricted'],
    apply_url: U.fundingDifferently, url_status: 'unchecked',
    location_tag: 'Southwark', is_local: true,
    amount_min: 5000, amount_max: 10000, amount_undisclosed: false, deadline: '2026-10-21', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['mental_health', 'disability', 'community'], target_beneficiaries: ['mental_health', 'disabled_people', 'general_public'],
    niche_tags: ['participatory_grantmaking', 'social_isolation', 'unrestricted'],
    description: 'Unrestricted multi-year grants of £5,000 or £10,000 for Southwark voluntary and community sector organisations, from a pooled fund run by Community Southwark with Partnership Southwark, United St Saviour’s Charity, Peter Minet Trust, Impact on Urban Health and PPL. £500,000 is available in total over two years: £5,000 each to 30 groups with an annual income under £50,000, and £10,000 each to 10 groups with an income between £40,000 and £150,000, paid in both 2026/27 and 2027/28. Applicants must be a not-for-profit organisation, including unincorporated groups, CICs and CIOs, operating in Southwark, and must support disabled people or promote positive mental health and wellbeing or address social isolation and loneliness; this does not need to be the organisation’s main focus. A safeguarding policy, a governing document, at least two unrelated trustees or directors and a bank account in the organisation’s name are required. The grant portal opened on 9 September 2026 and closes at 23:59 on 21 October 2026. Applicants must take part in peer scoring between 25 November and 9 December 2026 or the grant cannot be paid.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Southwark', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'A not-for-profit organisation, including unincorporated groups, CICs and CIOs, operating in Southwark, with an annual income of £50,000 or less for the £5,000 grants, or between £40,000 and £150,000 for the £10,000 grants. The group must support disabled people and/or promote positive mental health and wellbeing or address social isolation and loneliness, and this does not need to be its main focus. It must confirm it has a safeguarding policy, a governing document such as a constitution, at least two unrelated trustees, directors or committee members, and a bank account in the organisation’s name.',
      what_they_fund: 'Unrestricted funding over two years. Preventative work counts, such as activities that help maintain good mental health or improve social connections.',
      typical_award: '£5,000 to 30 groups with an annual income under £50,000, and £10,000 to 10 groups with an income between £40,000 and £150,000, each paid in 2026/27 and again in 2027/28. An organisation applies for one grant, either £5,000 or £10,000.',
      exclusions: 'Organisations outside Southwark, and organisations outside the stated income bands. Groups without a safeguarding policy, constitution or bank account are directed to Community Southwark for support before applying rather than being funded.',
      priorities: 'Disabled people, positive mental health and wellbeing, social isolation and loneliness.',
      geographic_focus: 'The London Borough of Southwark.',
      decision_timeline: 'The grant portal opened on Wednesday 9 September 2026 and closes at 23:59 on Wednesday 21 October 2026. Applicants must complete peer scoring between Wednesday 25 November and Wednesday 9 December 2026; groups that do not score cannot receive a grant. Groups receive £100 for taking part in the scoring.',
      how_to_apply: 'Two online application links, one for the £5,000 grant and one for the £10,000 grant, on the Community Southwark page. One-to-one application support is available from Community Southwark.',
      _citations: {
        who_can_apply: { snippet: 'A not-for-profit organisation (including unincorporated groups, CICs, CIOs and more) operating in Southwark', confidence: 'high', source_url: U.fundingDifferently },
        typical_award: { snippet: '£5,000 will go to 30 VCS groups (for organisations with an annual income of less than £50,000).', confidence: 'high', source_url: U.fundingDifferently },
        decision_timeline: { snippet: 'The Grant Portal is open from Wednesday 9th September 2026 and closes at 23:59 on Wednesday 21st October.', confidence: 'high', source_url: U.fundingDifferently },
        priorities: { snippet: 'A group that supports disabled people and/or promotes positive mental health and wellbeing or addresses social isolation and loneliness.', confidence: 'high', source_url: U.fundingDifferently },
        what_they_fund: { snippet: 'Flexible, multi-year funding available — apply for a £5,000 or £10,000 grant.', confidence: 'high', source_url: U.fundingDifferently },
      },
    },
  },

  // ── 16. BFI National Lottery Screen Heritage Fund, project funding. Film tranche.
  {
    title: 'BFI National Lottery Screen Heritage Fund — Project funding', funder: 'British Film Institute',
    funder_type: 'lottery', funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: U.bfiScreenHeritage, url_status: 'unchecked',
    location_tag: 'UK', is_local: false,
    amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'unincorporated'],
    impact_sectors: ['heritage', 'creative'], target_beneficiaries: ['general_public'],
    niche_tags: ['screen_archive', 'film_heritage', 'collections'],
    description: 'National Lottery project funding from the BFI to support the UK’s public screen heritage sector. Available to legally constituted organisations that operate a screen archive, collection network or similar and have the remit to collect and preserve screen heritage collections, not sound, paper or other static formats, and make them accessible to the general public on a not-for-profit basis, either as the sole or partial activity of the organisation. Applications can include workforce development programmes, training and skills for staff. Project funding applications are accepted all year round and must be made at least sixteen weeks before the planned start of any funded activity; all funded activity must be completed by 31 March 2029. An optional expression of interest gets eligibility feedback within ten working days. The separate Resilience funding strand for 2026-29 closed on 31 March 2026, and there is a separate Individual Skills strand for people working in the sector. No grant range is published on the fund page.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Legally constituted organisations that operate a screen archive, collection network or similar, and have the remit to collect and preserve screen heritage collections (not sound, paper or other static format) and make them accessible to the general public on a not-for-profit basis, either as the sole or partial activity of the organisation.',
      what_they_fund: 'Projects supporting the UK’s public screen heritage sector, including workforce development programmes, training and skills for staff.',
      typical_award: 'No grant range is published on the fund page.',
      exclusions: 'Organisations whose collections are sound, paper or other static formats rather than screen heritage. Applications made less than sixteen weeks before the planned start of activity. All Resilience and Project funded activity must be completed by 31 March 2029. Individual Skills funding is a separate strand for people rather than organisations.',
      priorities: 'Ensuring more people can engage with heritage collections that better reflect the diversity of the UK.',
      geographic_focus: 'United Kingdom.',
      decision_timeline: 'Project funding applications are accepted all year round. Apply at least sixteen weeks before the planned start of any funded activity. Online Q&A sessions were listed for 24 September and 5 November.',
      how_to_apply: 'Apply online after reading the project funding guidelines in full, which carry the application link. An optional expression of interest is available first, answered within about ten working days.',
      _citations: {
        who_can_apply: { snippet: 'Project funding and Resilience funding are available to legally constituted organisations that:\n operate a screen archive, collection network or similar', confidence: 'high', source_url: U.bfiScreenHeritage },
        decision_timeline: { snippet: 'Applications for Project funding are accepted all year round.', confidence: 'high', source_url: U.bfiScreenHeritage },
        exclusions: { snippet: 'You need to apply at least 16 weeks before the planned start of any funded activity.', confidence: 'high', source_url: U.bfiScreenHeritage },
      },
    },
  },
]

const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').toLowerCase()

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

  let staged = 0, skipped = 0
  for (const row of NEW) {
    const byUrl = all.filter(d => d.apply_url && norm(d.apply_url) === norm(row.apply_url))
    if (byUrl.length) {
      console.log(`  already_held (url), skipping: ${row.title} -> ${byUrl.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`)
      skipped++; continue
    }
    const byFunderTitle = all.filter(d =>
      (d.funder ?? '').toLowerCase() === row.funder.toLowerCase() &&
      d.title.toLowerCase() === row.title.toLowerCase())
    if (byFunderTitle.length) {
      console.log(`  already_held (funder+title), skipping: ${row.title}`)
      skipped++; continue
    }
    const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase())
    if (sameFunder.length) console.log(`  note: funder already has ${sameFunder.length} row(s) — different fund, staging anyway: ${row.title}`)
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id)
    staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length - skipped}, skipped ${skipped}, of ${NEW.length} candidates`)
}

main().catch(e => { console.error(e); process.exit(1) })
