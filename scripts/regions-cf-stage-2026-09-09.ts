// Regions brief (docs/handoffs/regions-cf-2026-09-09.md), run by the
// orchestrating session on Paul's "go, start with cheshire", 9 Sept 2026.
// Every page quoted below was fetched in this session by direct fetch; no
// model call. Rows stage hidden at system: trust and land under "Needs
// reading" until the 01:00 engine reads them.
//
//   npx tsx --env-file=.env.local scripts/regions-cf-stage-2026-09-09.ts [--apply] [--region cheshire]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant, mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const REGION = process.argv[process.argv.indexOf('--region') + 1] || 'all'
const SRC = 'system:regions-cf-2026-09-09'
const TODAY = '2026-09-09'
const CF_STRUCTS = ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated']

type Row = Record<string, unknown> & { region: string; title: string; apply_url: string; reviveId?: string }

const CCF_X = 'Commercial profit-making organisations. Organisations with significant free reserves. Statutory and public sector bodies including schools, hospitals and parish and town councils. Endowments, deficit funding or loan repayments. Grant-making bodies. Retrospective grants. Regional offices of national bodies that do not benefit local people. Organisations whose beneficiaries are not people. Promotion of religious belief or political causes.'
const CCF_WHO = 'Not-for-profit community groups, charities, CICs and social enterprises benefiting people in Cornwall and the Isles of Scilly, with a governing document showing community benefit and reinvestment of any profits, at least three unrelated trustees or directors, a bank account with two signatories and a safeguarding policy with a named lead. Registered charity status is not required. New groups can apply for up to £10,000 in their first year.'
const CCF_MIN = 'A governing document with charitable objectives, a not-for-profit clause and an asset lock; at least three unrelated trustees or directors; accounts within 18 months or a financial plan if new; a bank account in the organisation\'s name with two unrelated signatories; a safeguarding policy with a named lead.'

const ROWS: Row[] = [
  { region: 'cheshire-revived',
    title: 'Cheshire Community Foundation Open Grants Programmes', funder: 'Cheshire Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    apply_url: 'https://cheshirecommunityfoundation.org.uk/grants/open-grants-programmes/', funding_index_url: 'https://cheshirecommunityfoundation.org.uk/grants-programmes/', url_status: 'unchecked',
    location_tag: 'Cheshire', is_local: true, amount_min: null, amount_max: 15000, deadline: '2026-10-14', is_rolling: true,
    deadline_cycle: [
      { day: 11, month: 3, label: 'Apply by, for a decision before 22 May' },
      { day: 20, month: 5, label: 'Apply by, for a decision before 31 July' },
      { day: 29, month: 7, label: 'Apply by, for a decision before 23 October' },
      { day: 14, month: 10, label: 'Apply by, for a decision before 8 January' },
    ],
    eligible_structures: CF_STRUCTS, impact_sectors: ['community', 'financial', 'mental_health', 'employment', 'education', 'food'],
    target_beneficiaries: ['people_in_poverty', 'mental_health', 'carers', 'young_people'],
    description: 'Three tiers of grant for community work across Cheshire and Warrington: micro grants up to £1,000, small grants up to £2,500, and main grants up to £15,000 where the grant supports a salary (£10,000 otherwise). Projects of up to 12 months tackling poverty, building resilient communities, improving mental health, developing skills and employment, or using nature for wellbeing. Rolling through 2026 with four deadlines; the next is Wednesday 14 October 2026.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Cheshire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: `Any not-for-profit organisation working with people in Cheshire East, Cheshire West and Chester, or Warrington that meets the Foundation's minimum requirements: ${CCF_MIN} Micro grants prioritise smaller organisations new to the Foundation, and are not expected to go to organisations with turnover over £50,000. Main grants go to established organisations with a track record.`,
      what_they_fund: 'Projects of up to 12 months that address issues most important to the community: financial skills and access to support, skills for work, affordable and emergency food, inclusion and equity, addiction, long-term health conditions, unpaid carers, mental health, school readiness and young people\'s aspiration, employment and entrepreneurship, and grassroots use of nature for wellbeing. Eligible costs include salaries, volunteer expenses, venue hire, transport and small equipment; main grants can include a contribution to core costs.',
      typical_award: 'Micro up to £1,000, small up to £2,500, main up to £15,000 if supporting a salary or £10,000 if not.',
      exclusions: 'Work benefiting people outside Cheshire East, Cheshire West and Chester or Warrington. Work already carried out. Statutory bodies. Capital projects except through small grants where at least half the cost is requested. Promotion of religion. Medical treatment. General awareness raising or lobbying. Bursaries and fundraising costs. Political activity. Work that cannot start within a year. Small contributions to much larger projects: for £10,000 or more the Foundation expects to fund at least half of the total cost.',
      priorities: 'Work in the more deprived areas of Cheshire and Warrington by the Index of Multiple Deprivation is often prioritised at panel. No additional priority areas are set at present.',
      decision_timeline: 'Rolling for the whole of 2026. Apply by 11 March for a decision before 22 May, 20 May for 31 July, 29 July for 23 October, or 14 October for 8 January 2027. October-round grants are paid in January, so Christmas-period relief should apply by the July deadline. Applications that fit poorly may be declined before full assessment.',
      how_to_apply: 'Choose the tier first, then complete that tier\'s online form from the programme page; a started form cannot be moved to another tier. Micro and small forms ask fewer questions than main.',
      funder_tips: 'The Foundation says it does not expect to make main grants to new organisations without evidence of capacity, and prefers to fund at least half of any project over £10,000. Name the programme area the work sits under and say how you will know it worked, which is the question the form leads with.',
      strong_application: 'A clear fit to one named area, involvement of the people the work is for in planning it, a proportionate budget, and for main grants a track record of delivery.',
      geographic_focus: 'Cheshire East, Cheshire West and Chester, and Warrington.',
      _citations: {
        typical_award: { snippet: 'Micro Grants: Up to a maximum of £1,000 Small Grants: Up to a maximum of £2,500 Main Grants: Up to a maximum of £15,000 if the grant is supporting a salary, or £10,000 if not.', confidence: 'high', source_url: 'https://cheshirecommunityfoundation.org.uk/grants/open-grants-programmes/' },
        decision_timeline: { snippet: 'Apply by: 14th October for a decision before 8th January', confidence: 'high', source_url: 'https://cheshirecommunityfoundation.org.uk/grants/open-grants-programmes/' },
        who_can_apply: { snippet: 'This programme is open to any organisation which meets our grantmaking principles and minimum requirements, and works with people in eligible areas.', confidence: 'high', source_url: 'https://cheshirecommunityfoundation.org.uk/grants/open-grants-programmes/' },
        exclusions: { snippet: 'Work which benefits people who live outside of Cheshire East, Cheshire West and Chester, or Warrington, unless the programme specifically says so.', confidence: 'high', source_url: 'https://cheshirecommunityfoundation.org.uk/policy/' },
      },
    },
  },

  { region: 'cheshire',
    title: 'Bentley Advancing Life Chances (Crewe)', funder: 'Cheshire Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://cheshirecommunityfoundation.org.uk/grants/bentley-advancing-life-chances/', funding_index_url: 'https://cheshirecommunityfoundation.org.uk/grants-programmes/', url_status: 'unchecked',
    location_tag: 'Crewe', is_local: true, amount_min: null, amount_max: 20000, deadline: '2026-09-18', is_rolling: false,
    deadline_cycle: [{ day: 18, month: 9, label: 'Applications close, 5pm' }],
    eligible_structures: CF_STRUCTS, impact_sectors: ['community', 'employment', 'education', 'health', 'environment'],
    target_beneficiaries: ['people_in_poverty', 'ethnic_minorities', 'young_people'],
    description: 'Grants of up to £20,000 from Bentley, through Cheshire Community Foundation, for 12-month projects that improve life chances in Crewe: removing barriers to services, employment or education; building life skills and confidence; supporting healthier lives; or improving the local environment. For charitable organisations based in Crewe, or best placed to deliver there. Closes 5pm, 18 September 2026.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Crewe', last_enriched: TODAY, open_status: 'open',
      who_can_apply: `Charitable organisations based in Crewe that meet Cheshire Community Foundation's minimum requirements (${CCF_MIN}). An organisation based outside the town must show it is the best placed to deliver the project in Crewe. Previous Advancing Life Chances grant holders may reapply with evidence their earlier work completed, but not for a fourth consecutive year.`,
      what_they_fund: 'Projects of up to 12 months delivering outcomes under one of four pillars: access (removing real or perceived barriers to services, employment or education), empowerment (life skills and confidence), quality of life (physical and mental health and wellbeing), or a better future (safeguarding the local environment and nature-deprived areas). The programme prefers to fund projects in their entirety and is keen on collaboration between organisations.',
      typical_award: 'Up to £20,000 for a 12-month project. Seed funding above £20,000 for a new service can be discussed by email before applying.',
      exclusions: 'Work outside Crewe. Organisations funded for three consecutive years. Everything on the Foundation\'s general exclusions list: statutory bodies, retrospective work, promotion of religion, medical treatment, lobbying, bursaries, political activity.',
      priorities: 'Vulnerable people, disadvantaged and under-represented communities in Crewe. Each project must say how it will measure progress under its pillar.',
      decision_timeline: 'Applications close at 5pm on 18 September 2026. Decisions expected mid to late November 2026. Funded projects run for 12 months from about December 2026 or January 2027, with monitoring due two weeks after the end.',
      how_to_apply: 'Online application form linked from the programme page. Programme guidance and key questions are downloadable there. The Foundation offers alternative formats and support on 01606 330607.',
      funder_tips: 'Pick one pillar and build the measurement around it; the funder says each project only needs to deliver outcomes under one. Partnership bids are explicitly welcomed.',
      strong_application: 'A whole project the grant can fund in full, a clear pillar, measurable outcomes, and evidence the organisation is the best placed to deliver in Crewe.',
      geographic_focus: 'Crewe only.',
      _citations: {
        typical_award: { snippet: 'The maximum grant size available is £20,000 for projects of up to 12 months in duration.', confidence: 'high', source_url: 'https://cheshirecommunityfoundation.org.uk/grants/bentley-advancing-life-chances/' },
        deadline: { snippet: 'Applications must be submitted by 5pm on 18th of September', confidence: 'high', source_url: 'https://cheshirecommunityfoundation.org.uk/grants/bentley-advancing-life-chances/' },
        who_can_apply: { snippet: 'Grants will be awarded to charitable organisations based in Crewe or, if an organisation based outside of the town wishes to deliver a project in Crewe, they will need to demonstrate that they are the best-placed organisation to do so.', confidence: 'high', source_url: 'https://cheshirecommunityfoundation.org.uk/grants/bentley-advancing-life-chances/' },
      },
    },
  },

  { region: 'cheshire',
    title: 'The Halton Foundation Grants', funder: 'Community Foundation for Merseyside', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    apply_url: 'https://cfmerseyside.org.uk/grants/the-halton-foundation', funding_index_url: 'https://cfmerseyside.org.uk/our-grants', url_status: 'unchecked',
    location_tag: 'Halton', is_local: true, amount_min: null, amount_max: 1500, deadline: '2026-09-14', is_rolling: false,
    deadline_cycle: [{ day: 3, month: 8, label: 'Opens' }, { day: 14, month: 9, label: 'Closes' }],
    eligible_structures: CF_STRUCTS, impact_sectors: ['community', 'health', 'mental_health', 'financial', 'food', 'disability'],
    target_beneficiaries: ['people_in_poverty', 'disabled_people', 'young_people', 'older_people'],
    description: 'Grants of up to £1,500 for voluntary and community groups working in Halton (Runcorn and Widnes) with people in need, hardship or distress: activities for disabled people, food banks, self-help groups, luncheon clubs, isolation, debt advice, domestic violence and mental health projects. Four extra £1,500 grants are ring-fenced for education projects with under-25s in Widnes. Opened 3 August 2026, closes Monday 14 September 2026.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Halton', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary and community groups working in the borough of Halton whose beneficiaries come from Halton, with at least three unrelated trustees, directors or committee members. National organisations must show local governance and control of local finances. CICs must show at Companies House that all directors have equal powers. Companies limited by shares, private companies and commercial ventures cannot apply. A group without a bank account may nominate another organisation to hold the funds.',
      what_they_fund: 'Charitable projects for people in Halton in conditions of need, hardship or distress, including activities for people with disabilities, food banks, self-help groups, luncheon clubs, projects reducing social isolation, debt advice, domestic violence work and mental health initiatives. Sessional worker costs and an element of full cost recovery within a specific project are allowed.',
      typical_award: 'Up to £1,500. Four additional £1,500 grants are ring-fenced for education projects supporting young people under 25 in Widnes.',
      exclusions: 'Core salaries and general running costs. Statutory organisations or their responsibilities. Vehicles. Activities already taken place. Political or exclusively religious activity. Organisations for the benefit of animals or plants. Groups made up of one family. Debts, reclaimable VAT, travel outside the UK, and purely social entertainment.',
      priorities: 'Need, hardship and distress in Halton. The Foundation is a Real Living Wage employer and encourages staff costs at £13.45 an hour or more.',
      decision_timeline: 'Opened 3 August 2026 and closes Monday 14 September 2026. Decisions in mid November.',
      how_to_apply: 'Online form through the Apply Now button on the fund page, with governing document, latest accounts or income and expenditure, a recent bank statement and a list of trustees or committee members attached or emailed to applications@cflm.org.uk.',
      funder_tips: 'The fund will not pay core salaries, so cost the project as sessional work with a full-cost-recovery element rather than as a share of a post.',
      strong_application: 'A specific project for people in Halton in hardship, with the governance documents ready, three unrelated trustees, and local control of the money.',
      geographic_focus: 'Halton borough: Runcorn and Widnes.',
      _citations: {
        typical_award: { snippet: 'The maximum grant available is £1,500', confidence: 'high', source_url: 'https://cfmerseyside.org.uk/grants/the-halton-foundation' },
        deadline: { snippet: 'Deadline Monday 14th September Opening Date 3rd August 2026 Decision Date Mid- November', confidence: 'high', source_url: 'https://cfmerseyside.org.uk/grants/the-halton-foundation' },
        exclusions: { snippet: 'The fund will not support core salaries or general running costs but will consider sessional worker costs and an element of full cost recovery as part of a specific project.', confidence: 'high', source_url: 'https://cfmerseyside.org.uk/grants/the-halton-foundation' },
      },
    },
  },

  { region: 'cheshire',
    title: 'Pride in Place Runcorn Grow Grants', funder: 'Halton & St Helens VCA', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://www.haltonsthelensvca.org.uk/pride-place-runcorn-grants-programme', url_status: 'unchecked',
    location_tag: 'Runcorn', is_local: true, amount_min: 1000, amount_max: 5000, deadline: '2026-09-11', is_rolling: false,
    deadline_cycle: [{ day: 15, month: 3, label: 'Round one closes (mid March)' }, { day: 11, month: 9, label: 'Round two closes' }],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'unincorporated'], impact_sectors: ['community', 'creative', 'environment', 'health', 'young_people'],
    target_beneficiaries: ['general_public', 'young_people'],
    description: 'Grow grants of £1,000 to £5,000 for registered charities, CICs and voluntary or community groups to kick-start grassroots projects in Runcorn Old Town and the surrounding area, funded by the government\'s ten-year Pride in Place programme and managed by Halton & St Helens VCA. Events, environmental improvements, youth and intergenerational activity, arts and heritage, equipment, loneliness and wellbeing. Round two closes Friday 11 September 2026; one application per organisation across the two rounds.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Runcorn', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, CICs and voluntary or community organisations delivering projects that benefit Runcorn Old Town and the surrounding areas shown on the guidance map, with priority for smaller grassroots organisations. One application per organisation across the two 2026/27 rounds. Micro grants of up to £250 are a separate strand for individuals aged 14 to 25.',
      what_they_fund: 'Revenue and capital costs that kick-start grassroots projects, support new or emerging community groups, or enable community-led activity promoting pride in place, wellbeing and social inclusion: community events and celebrations, environmental improvements and planting, youth and intergenerational projects, arts, heritage and cultural projects, equipment for local groups, loneliness and wellbeing activity, and projects that help people feel safe.',
      typical_award: '£1,000 to £5,000 per project.',
      exclusions: 'Core funding. Projects that do not benefit Runcorn Old Town and the surrounding areas. Personal expenses unrelated to the project. Retrospective costs. Political or religious activity.',
      priorities: 'Empowering local people to act, inclusion, wellbeing, culture and local pride, participation and volunteering, stronger local networks, and the visibility and vitality of Runcorn Old Town.',
      decision_timeline: 'Two rounds a year. Round two opened 17 July 2026 and closes Friday 11 September 2026; the panel meets Monday 28 September and decisions are communicated within a week, with payments in October. Round one ran January to mid March with payments in May.',
      how_to_apply: 'Complete the Grow Grant application form linked from the programme page. The July 2026 funding pack with the area map is attached there. Jo Beech at Halton & St Helens VCA helps with applications.',
      funder_tips: 'The area is tight: Runcorn Old Town and its surroundings, not the whole borough, so check the map in the pack first. The programme runs for ten years, so a group that misses this round will see it again.',
      strong_application: 'A new or growing grassroots idea for the Old Town with residents involved, a small clear budget, and a link to one of the programme aims.',
      geographic_focus: 'Runcorn Old Town and the surrounding areas.',
      _citations: {
        typical_award: { snippet: 'Grow grants of £1k - £5k per project These are open to registered charities, CICs and voluntary / community organisations.', confidence: 'high', source_url: 'https://www.haltonsthelensvca.org.uk/pride-place-runcorn-grants-programme' },
        deadline: { snippet: 'Closing date for applications Friday 11 th September 2026 Grant panel meet on Monday 28 th September 2026', confidence: 'high', source_url: 'https://www.haltonsthelensvca.org.uk/pride-place-runcorn-grants-programme' },
        exclusions: { snippet: 'Core Funding Projects that do not benefit Runcorn Old Town and the surrounding areas', confidence: 'high', source_url: 'https://www.haltonsthelensvca.org.uk/pride-place-runcorn-grants-programme' },
      },
    },
  },
  // ── Wales ──────────────────────────────────────────────────────────────────
  // Community Foundation Wales's fund pages were scraped once as bare stubs
  // and archived; the Foundation's Grants Hub front door (cc5f93d2) is live.
  // The two dated funds open today are revived hidden with the page's facts.
  { region: 'wales-revived', reviveId: '48a06531',
    title: 'Fund for Wales', funder: 'Community Foundation Wales', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://communityfoundationwales.org.uk/grants/fund-for-wales/', funding_index_url: 'https://communityfoundationwales.org.uk/grants-overview/', url_status: 'unchecked',
    location_tag: 'Wales', is_local: true, amount_min: 500, amount_max: 2500, deadline: '2026-11-09', is_rolling: false, max_org_income: 100000,
    deadline_cycle: [{ day: 9, month: 11, label: 'Closes, midday (subject to change)' }],
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'unincorporated'], impact_sectors: ['community', 'health', 'environment', 'heritage', 'education'],
    target_beneficiaries: ['people_in_poverty', 'general_public'],
    description: 'Grants of £500 to £2,500 a year for up to three years from Community Foundation Wales\'s national endowment, for small, local, community-led constituted charities and voluntary organisations anywhere in Wales with an annual income under £100,000. Outcomes: life chances, stronger communities, better rural and urban environments, healthier and more active people, heritage and culture. Open now; closes midday on Monday 9 November 2026, with monthly panels and decisions within two months.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Wales', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Small, local, community-led constituted charities and voluntary organisations in Wales with an annual income under £100,000 in the last financial year: constituted groups, registered charities and CIOs, companies limited by guarantee, CICs and social enterprises. A CIC registered in the last 18 months is not eligible. Groups rejected in the last six months cannot reapply. Beneficiaries must be based in Wales. The Foundation welcomes organisations that have never had a grant from the Fund.',
      what_they_fund: 'Work that delivers one of the Fund\'s outcomes: improving people\'s chances in life, building stronger communities, improving rural and urban environments, encouraging healthier and more active people and communities, and preserving heritage and culture. Multi-year grants are possible, and at least six are expected this round.',
      typical_award: '£500 to £2,500 a year, for up to three years.',
      exclusions: 'Organisations with income over £100,000 (about a fifth of applications fail on this). CICs under 18 months old. Retrospective costs. Fundraising for other groups. Applicants rejected in the last six months.',
      priorities: 'A clear need for financial assistance, financial hardship or additional support needs, and organisations new to the Fund.',
      decision_timeline: 'Open now and closing at midday on Monday 9 November 2026, subject to change. Panels meet towards the end of each month and applicants hear within two months of submission.',
      how_to_apply: 'Online application through the Foundation\'s Grants Hub, which has how-to videos, step-by-step guides and FAQs. Read the minimum expected standard first.',
      funder_tips: 'The income ceiling is the first filter and the Foundation says a fifth of applicants fail it, so check the last accounts before anything else. Apply early: panels are monthly and decisions roll through to the closing date.',
      strong_application: 'A small, locally controlled group with a plain account of need, one named outcome, and a first-year budget the grant can cover.',
      geographic_focus: 'All 22 Welsh local authority areas.',
      _citations: {
        typical_award: { snippet: 'Grants of between £500 – £2,500 per annum for up to 3 years, are available to organisations whose applications best deliver against the outcomes above.', confidence: 'high', source_url: 'https://communityfoundationwales.org.uk/grants/fund-for-wales/' },
        deadline: { snippet: 'This fund is now open. This fund will be closing Monday 9th November 12pm - midday (subject to change).', confidence: 'high', source_url: 'https://communityfoundationwales.org.uk/grants/fund-for-wales/' },
        who_can_apply: { snippet: 'Fund for Wales is open to small, local, community led constituted charities and voluntary organisations (e.g. associations, social enterprises, Community Interest Companies and clubs), with an annual income of less than £100,000 in the last financial year.', confidence: 'high', source_url: 'https://communityfoundationwales.org.uk/grants/fund-for-wales/' },
      },
    },
  },

  { region: 'wales-revived', reviveId: 'c609350e',
    title: 'Principality Building Society Future Generations Fund', funder: 'Community Foundation Wales', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted'],
    apply_url: 'https://communityfoundationwales.org.uk/grants/the-principality-building-societys-future-generations-fund/', funding_index_url: 'https://communityfoundationwales.org.uk/grants-overview/', url_status: 'unchecked',
    location_tag: 'Wales', is_local: true, amount_min: null, amount_max: 12500, deadline: '2026-10-05', is_rolling: false, max_org_income: 500000,
    deadline_cycle: [{ day: 5, month: 10, label: 'Closes, midday' }],
    eligible_structures: ['registered_charity', 'cio', 'ltd_guarantee', 'cic_guarantee', 'unincorporated'], impact_sectors: ['young_people', 'mental_health', 'financial', 'employment', 'food', 'environment'],
    target_beneficiaries: ['children', 'young_people', 'people_in_poverty'],
    description: 'Core-cost grants of up to £12,500 for one year for third sector and community organisations in Wales whose work is solely focused on children and young people up to 25, with an annual income under £500,000: food and essentials, mental health and wellbeing, financial resilience and life skills, employability, environmental awareness, and engagement with school. About 15 grants expected. Closes midday, Monday 5 October 2026.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Wales', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Third sector and community organisations operating in Wales, or on the borders close to a Principality branch, that are solely focused on supporting children and young people up to 25, or protected-characteristic organisations applying for work exclusively with children and young people. Annual income under £500,000 in the last accounts. Not funded through this programme in either of the last two rounds. A CIC registered in the last 18 months is not eligible.',
      what_they_fund: 'Core costs solely related to children and young people that improve opportunities, wellbeing and resilience: access to healthy food and essentials including clothing, stationery and technology; positive mental health; financial resilience and life skills; employability, training and skills; environmental awareness; workshops on those themes; and help for pupils to engage with school and future opportunities.',
      typical_award: 'Up to £12,500 for one year. About 15 organisations will be supported.',
      exclusions: 'Organisations delivering wider all-age community work unless exclusively focused on a protected-characteristic community and applying for children and young people work only. Income over £500,000, unless a case is made. Funding from this programme in either of the last two rounds. Retrospective costs.',
      priorities: 'Children and young people who are underserved, vulnerable or experiencing disadvantage, including protected-characteristic backgrounds and the most deprived communities in Wales. A strong track record of delivery may be preferred.',
      decision_timeline: 'Open now; closes at 12 midday on Monday 5 October 2026. Outcomes within two months of the closing date.',
      how_to_apply: 'Online application through the Foundation\'s Grants Hub. Read the minimum expected standard first.',
      funder_tips: 'This is core funding, which is rare, but only for organisations that exist for children and young people: an all-age group applying for its youth strand will fail the first test. Say plainly which of the listed themes the core work delivers.',
      strong_application: 'An organisation wholly about young people, a clear line from core costs to continuity of support, measurable outcomes, and evidence of reaching those in the most deprived communities.',
      geographic_focus: 'Wales, all 22 local authority areas, and border areas close to a Principality Building Society branch.',
      _citations: {
        typical_award: { snippet: 'The fund will award grants of up to £12,500 for one year to third sector and community organisations supporting children and young people aged up to 25.', confidence: 'high', source_url: 'https://communityfoundationwales.org.uk/grants/the-principality-building-societys-future-generations-fund/' },
        deadline: { snippet: 'This fund is now open to applications. The closing date is 12 midday on Monday 5th October 2026.', confidence: 'high', source_url: 'https://communityfoundationwales.org.uk/grants/the-principality-building-societys-future-generations-fund/' },
        who_can_apply: { snippet: 'Have an annual income of under £500,000 in your last financial accounts.', confidence: 'high', source_url: 'https://communityfoundationwales.org.uk/grants/the-principality-building-societys-future-generations-fund/' },
      },
    },
  },

  { region: 'wales',
    title: 'Moondance Foundation General Funding', funder: 'Moondance Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://moondancefoundation.org.uk/general-howtoapply-1', url_status: 'unchecked',
    location_tag: 'Wales', is_local: true, amount_min: 500, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'], impact_sectors: ['community', 'young_people', 'education', 'environment', 'health', 'older_people', 'women'],
    target_beneficiaries: ['people_in_poverty', 'children', 'young_people', 'older_people', 'women_girls'],
    description: 'Rolling grants from £500 upwards, with no stated maximum, from one of Wales\'s largest independent funders, for registered charities, constituted community groups, CIOs, CICs and social enterprises operating in Wales for at least two years. Priorities: children and young people, community development, education and training, environment, health, older people, poverty and women. No deadlines; no answer within 12 weeks means no.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Wales', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, constituted community groups, social enterprises, CIOs, CICs and other not-for-profit organisations, mainly those operating in Wales, with at least two years of operation. Not individuals, not local or community councils, and not newly formed organisations.',
      what_they_fund: 'Work in Wales under the Foundation\'s categories: children and young people, community development and participation, education and training, environment and conservation, health (relief and support of illness), older people, prevention and relief of poverty, and women. The trustees ask applicants to request only essential needs.',
      typical_award: 'From £500 upwards; the amount depends on need, the scale of the project and what has already been raised, and trustees may award less than requested. Grants over £20,000 are listed in the annual report.',
      exclusions: 'Political and religious activity. Medical or social research. Primary and secondary schools and their PTAs. Sports clubs and sporting activity. Scouts, Guides and Cadet groups. Playgroups, nurseries, preschools and after-school clubs. Individuals. Local and community councils. Organisations under two years old. Organisations not operating in Wales are usually declined.',
      priorities: 'The most vulnerable people in Wales, and organisations that explain what they do, why it is needed and what difference it makes.',
      decision_timeline: 'No deadlines; applications are considered as they arrive, though the Foundation occasionally closes briefly. If nothing is heard within 12 weeks the application was unsuccessful. Unsuccessful applicants wait six months before reapplying.',
      how_to_apply: 'Online application form only, following the word counts; the form will not submit over the limit. The Foundation cannot discuss proposals before an application and gives no feedback on declines.',
      funder_tips: 'The Foundation only responds to the applications it funds, so the form has to carry the whole case: what you do, why it is needed and the difference it makes, with a costed breakdown. Ask for the essential amount, not the ambitious one.',
      strong_application: 'A Welsh organisation with two years of accounts, a clear need in one of the eight categories, a specific costed request, and other funding already sought.',
      geographic_focus: 'Wales, where the Foundation focuses most of its funding.',
      _citations: {
        who_can_apply: { snippet: 'We accept applications for funding from registered charities, constituted community groups, social enterprises, Community Interest Organisations (CIOs), Community Interest Companies (CICs) and other not-for-profit organisations.', confidence: 'high', source_url: 'https://moondancefoundation.org.uk/funding-faqs' },
        typical_award: { snippet: 'Grants are awarded from £500 upwards, the amount depends on several factors including: how much you need the scale of your project how much your organisation has raised already.', confidence: 'high', source_url: 'https://moondancefoundation.org.uk/funding-faqs' },
        decision_timeline: { snippet: 'No, Moondance generally does not have deadlines. In some circumstances, we have to close to applications, but try to keep this time to a minimum.', confidence: 'high', source_url: 'https://moondancefoundation.org.uk/general-howtoapply-1' },
        exclusions: { snippet: 'Moondance will not support applications from newly formed organisations or those in the process of setting up, as we require a minimum of 2 years\' operations.', confidence: 'high', source_url: 'https://moondancefoundation.org.uk/funding-faqs' },
      },
    },
  },
  // ── Wales, continued ───────────────────────────────────────────────────────
  // Waterloo's live row (05aa2cda) is the homepage; its Wales Fund is a
  // separately paged programme with its own criteria, so it gets its own row.
  { region: 'wales',
    title: 'Waterloo Foundation Wales Fund', funder: 'The Waterloo Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'restricted'],
    apply_url: 'https://waterloofoundation.org.uk/walesabouttheprogramme/', funding_index_url: 'https://waterloofoundation.org.uk/', url_status: 'unchecked',
    location_tag: 'Wales', is_local: true, amount_min: 5000, amount_max: 30000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated'], impact_sectors: ['community', 'education', 'financial', 'health'],
    target_beneficiaries: ['carers', 'children', 'young_people', 'people_in_poverty'],
    description: 'Grants typically of £5,000 to £30,000, restricted or unrestricted, from the Cardiff-based Waterloo Foundation for charities, CIOs, CICs and community organisations in Wales under three programmes: Unpaid Carers, Equity in Education, and Pathways out of Poverty. Rolling, by a three-page emailed proposal; the Foundation will not usually give more than 25 per cent of an organisation\'s annual income.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Wales', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charities, Charitable Incorporated Organisations, Community Interest Companies and other not-for-profit, community-based organisations working in Wales. Preference goes to charities deeply rooted in their communities with tangible, evidenced impact. Requests should be in keeping with annual income: the Foundation does not usually give grants totalling more than 25 per cent of it.',
      what_they_fund: 'Work under one of three Wales programmes: Unpaid Carers, Equity in Education, and Pathways out of Poverty. Project or unrestricted funding; multi-year awards only where there is an established relationship, and usually at a lower annual level.',
      typical_award: '£5,000 to £30,000, most commonly £10,000 to £30,000. A three-year grant of £30,000 a year would be unusual.',
      exclusions: 'Proposals that do not name one of the three programmes, exceed three sides of A4, arrive with attachments, or are sent anywhere other than the applications email address. Requests above about a quarter of annual income.',
      priorities: 'Local charities rooted in their communities, with compelling evidence of need, sustainability or long-term impact, significant reach, and potential to scale where impact is proven.',
      decision_timeline: 'Rolling, run on the calendar year. An acknowledgement on receipt, then an initial assessment decision roughly every four to eight weeks; proposals taken forward get a request for more information within a few weeks and possibly a visit.',
      how_to_apply: 'No form. Email a proposal of no more than three sides of A4 in the body of the message to applications@waterloofoundation.org.uk, naming the programme, how you heard of it, organisation details including income and expenditure, the project, evidence of need, and monitoring and evaluation plans. Say if your CVC helped.',
      funder_tips: 'The Foundation says its Wales Fund is far more oversubscribed than its main programmes and only the strongest, guideline-following proposals get through. Keep the ask proportionate to income and put figures in prose, not tables, because tables break in email.',
      strong_application: 'A named programme, statistics behind the need, a clear outcomes plan, previous evaluation or awards, and honesty about the funding gap.',
      geographic_focus: 'Wales.',
      _citations: {
        typical_award: { snippet: 'Grants made under our Wales funding programmes typically range from £5k – £30k however we expect organisations to be fully transparent about funding gaps.', confidence: 'high', source_url: 'https://waterloofoundation.org.uk/walesapplicationguidelines/' },
        who_can_apply: { snippet: 'We welcome applications for funding from registered charities, Community Interest Organisations (CIOs), Community Interest Companies (CICs) and other not-for-profit, community-based organisations.', confidence: 'high', source_url: 'https://waterloofoundation.org.uk/walesabouttheprogramme/' },
        decision_timeline: { snippet: 'Our Wales funding programmes are currently run on a rolling basis based on the calendar year.', confidence: 'high', source_url: 'https://waterloofoundation.org.uk/walesapplicationguidelines/' },
      },
    },
  },

  // ── Bristol ────────────────────────────────────────────────────────────────
  { region: 'bristol',
    title: 'Police and Crime Commissioner\'s Community Fund (Avon and Somerset)', funder: 'Quartet Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://quartetcf.org.uk/grants/police-and-crime-commissioners-community-fund/', funding_index_url: 'https://quartetcf.org.uk/apply-for-funding/apply-for-a-grant/', url_status: 'unchecked',
    location_tag: 'Bristol', is_local: true, amount_min: 1000, amount_max: 10000, deadline: '2026-10-16', is_rolling: false,
    deadline_cycle: [{ day: 7, month: 9, label: 'Opens, 8am' }, { day: 16, month: 10, label: 'Closes, 1pm' }],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated', 'ltd_guarantee'], impact_sectors: ['justice', 'community', 'young_people'],
    target_beneficiaries: ['young_people', 'women_girls', 'general_public'],
    description: 'Grants of £1,000 to £10,000 for voluntary, community, faith and social enterprise groups in Bristol, Bath and North East Somerset, North Somerset and South Gloucestershire running projects that prevent crime, serious violence or antisocial behaviour, or support people at higher risk as victims or perpetrators. Funded by the Avon and Somerset Police and Crime Commissioner through Quartet. Open 7 September to 1pm on 16 October 2026; decisions early December.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Bristol', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Constituted community or voluntary groups, registered charities, CIOs, CICs and similar not-for-profit bodies working for their community in Bristol, BANES, North Somerset or South Gloucestershire (Somerset applies through Somerset Community Foundation). A governing document, a bank account in the group\'s name with two unrelated authorisers, and safeguarding arrangements where relevant. Regional or national organisations only where no local group does the same work and the project is targeted within the Avon and Somerset policing area.',
      what_they_fund: 'Projects that make a real difference to safety in a neighbourhood or support people at higher risk of involvement in crime, under the Police and Crime Plan themes: community relationships and antisocial behaviour, reducing violent crime including violence against women and girls and serious youth violence, preventing crime, and supporting victims. Staff or volunteer time, a contribution to management and core costs where directly relevant, travel, small equipment, training.',
      typical_award: '£1,000 to £10,000.',
      exclusions: 'Contributions to national campaigns. Projects outside the Avon and Somerset policing area. Applicants that cannot say clearly how the project prevents crime or harm.',
      priorities: 'A clear line from the project to preventing crime or harm, in a named neighbourhood or for a named at-risk group.',
      decision_timeline: 'Opened 8am on 7 September 2026, closes 1pm on 16 October 2026. Decisions notified in early December 2026.',
      how_to_apply: 'Read the applicant guide, then apply through the online form linked from the fund page while the programme is open. Luke Boulton at Quartet helps applicants in Bristol, BANES, North Somerset and South Gloucestershire.',
      funder_tips: 'Whatever the activity, the application is judged on how plainly it prevents crime or harm, so frame a youth club or a women\'s group in those terms and cite the Police and Crime Plan theme it meets.',
      strong_application: 'A named place or group, a stated prevention mechanism, local evidence of the problem, and costs that are mostly delivery time.',
      geographic_focus: 'Bristol, Bath and North East Somerset, North Somerset and South Gloucestershire.',
      _citations: {
        typical_award: { snippet: 'This fund offers grants of between £1,000 and £10,000 to VCFSE (Voluntary, Community, Faith, and Social Enterprise) groups running projects that help prevent crime, serious violence or antisocial behaviour.', confidence: 'high', source_url: 'https://quartetcf.org.uk/grants/police-and-crime-commissioners-community-fund/' },
        deadline: { snippet: 'Opening Date: 7th September 2026 , 8:00 am Closing Date: 16th October 2026 , 1:00 pm', confidence: 'high', source_url: 'https://quartetcf.org.uk/grants/police-and-crime-commissioners-community-fund/' },
      },
    },
  },

  { region: 'bristol',
    title: 'Wessex Water Community Fund (West of England)', funder: 'Quartet Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://quartetcf.org.uk/grants/wessex-water-community-fund/', funding_index_url: 'https://quartetcf.org.uk/apply-for-funding/apply-for-a-grant/', url_status: 'unchecked',
    location_tag: 'Bristol', is_local: true, amount_min: null, amount_max: 4000, deadline: '2026-10-19', is_rolling: false, next_open_date: '2026-09-21',
    deadline_cycle: [{ day: 21, month: 9, label: 'Opens' }, { day: 19, month: 10, label: 'Closes, 11am' }],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated', 'ltd_guarantee'], impact_sectors: ['community', 'financial'],
    target_beneficiaries: ['people_in_poverty', 'rural_communities'],
    description: 'Grants of up to £4,000 for voluntary and community groups, registered charities, CICs and parish councils based and working in Bristol, Bath and North East Somerset, North Somerset or South Gloucestershire, for work that improves the lives of local people most in need, with priority for deprived or rurally isolated areas, stronger communities, and help with debt and financial capability. Opens 21 September and closes 11am on 19 October 2026; about 25 grants expected.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Bristol', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Voluntary and community groups with charitable aims, registered charities, Community Interest Companies and parish councils based and working in the West of England (Bath and North East Somerset, Bristol, North Somerset and South Gloucestershire), running for at least 12 months with a track record and financial records. Priority for organisations whose income has averaged under £500,000 over the last three years.',
      what_they_fund: 'Charitable and community activities that meet a local need and improve the lives of local people most in need of support, informed by the community they serve, with wide benefit. Priority to work in areas of multiple deprivation or rural isolation, work that builds stronger communities, and work that helps people manage or avoid debt and take up utility affordability support.',
      typical_award: 'Up to £4,000. About 25 grants are expected; 44 per cent of applications succeeded last year.',
      exclusions: 'Organisations under 12 months old. Work outside the four West of England authorities.',
      priorities: 'Areas of multiple deprivation or rural isolation, community-led solutions, and financial capability including awareness of Wessex Water affordability schemes.',
      decision_timeline: 'Opens 21 September 2026 and closes at 11am on 19 October 2026. Decisions notified in early December 2026.',
      how_to_apply: 'Online application form available from the fund page while open, after reading the applicant guide. A plain-text copy of the form is provided for preparation but cannot be submitted.',
      funder_tips: 'Requests last year were two and a half times the money available, so a modest ask with a plain link to one of the three priorities beats a large one. Mention Wessex Water affordability schemes if the work touches household bills.',
      strong_application: 'A community-informed activity in a deprived or isolated area, a track record of at least a year, and a clear statement of who is most in need and how the work reaches them.',
      geographic_focus: 'Bath and North East Somerset, Bristol, North Somerset and South Gloucestershire.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £4,000 are available to groups and organisations delivering work that is improving the lives of local people who are in most need of support.', confidence: 'high', source_url: 'https://quartetcf.org.uk/grants/wessex-water-community-fund/' },
        deadline: { snippet: 'Opening Date: 21st September 2026 Closing Date: 19th October 2026 , 11:00 am Maximum grant awarded: £4,000', confidence: 'high', source_url: 'https://quartetcf.org.uk/grants/wessex-water-community-fund/' },
      },
    },
  },

  // ── Cornwall ───────────────────────────────────────────────────────────────
  { region: 'cornwall',
    title: 'Financial Shock Crisis Fund (Cornwall Community Foundation)', funder: 'Cornwall Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['emergency', 'restricted'],
    apply_url: 'https://cornwallcommunityfoundation.com/grants/the-financial-shock-crisis-fund/', funding_index_url: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/', url_status: 'unchecked',
    location_tag: 'Cornwall', is_local: true, amount_min: 500, amount_max: 3000, deadline: '2027-01-01', is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated', 'ltd_guarantee'], impact_sectors: ['financial', 'food', 'community', 'housing'],
    target_beneficiaries: ['people_in_poverty', 'families', 'older_people', 'disabled_people'],
    description: 'Grants of £500 to £3,000 for charities, voluntary organisations, food banks and care organisations in Cornwall and the Isles of Scilly to pass on to people on low incomes hit by a sudden financial shock: rent, bills, food, essential transport, appliances and priority debt, at up to £350 per household a year. Distributed on behalf of Cornwall Council\'s Crisis and Resilience Fund, the successor to the Household Support Fund. Rolling; applications by 1 January 2027.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Cornwall', last_enriched: TODAY, open_status: 'open',
      who_can_apply: `Third-party organisations in Cornwall and the Isles of Scilly including registered charities and voluntary organisations, food banks and care organisations, which then distribute the money at their discretion to people they already support who are at risk from a financial shock. ${CCF_WHO}`,
      what_they_fund: 'Household costs including rent, bills and utilities, food, essential transport, essential appliances and furniture, priority debt and wider essentials for people on no or low income who experience a sudden financial shock: a disaster, accident or health emergency, relationship breakdown, essential item breakdown or loss of income. Not an ongoing source of household income. No household may receive more than £350 in a calendar year.',
      typical_award: '£500 to £3,000 per organisation, depending on capacity.',
      exclusions: `Ongoing household income support. ${CCF_X}`,
      priorities: 'People already known to the organisation and most at risk from a sudden shock. Organisations must estimate and then report a breakdown of support by type of crisis, method, need and household demographics.',
      decision_timeline: 'Opened 20 May 2026 with rolling decisions. Applications by 1 January 2027.',
      how_to_apply: 'Apply online from the fund page with a predicted breakdown of how the money will be used by household type and need, plus the Foundation\'s standard documents: governing document, trustee list, accounts, recent bank statement and safeguarding policy.',
      funder_tips: 'The application wants an estimated breakdown by household type and support method, not exact cases, so build it from last year\'s caseload. Count each household once.',
      strong_application: 'An organisation with an existing caseload of low-income households, a realistic estimate of need, and reporting systems that can track each household against the £350 cap.',
      geographic_focus: 'Cornwall and the Isles of Scilly.',
      _citations: {
        typical_award: { snippet: 'Organisations can apply for between £500 and £3,000 depending on capacity.', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/the-financial-shock-crisis-fund/' },
        deadline: { snippet: 'Grant open: 20/05/2026 Applications by: 01/01/2027 Decision date: Rolling', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/the-financial-shock-crisis-fund/' },
        who_can_apply: { snippet: 'Third party organisations can include but are not limited to: Registered charities and voluntary organisations Food banks Care organisations', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/the-financial-shock-crisis-fund/' },
      },
    },
  },

  { region: 'cornwall',
    title: 'Police Property Act Fund 2026 (Cornwall)', funder: 'Cornwall Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted'],
    apply_url: 'https://cornwallcommunityfoundation.com/grants/police-property-act/', funding_index_url: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/', url_status: 'unchecked',
    location_tag: 'Cornwall', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-10-21', is_rolling: false,
    deadline_cycle: [{ day: 9, month: 9, label: 'Opens' }, { day: 21, month: 10, label: 'Closes' }],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated', 'ltd_guarantee'], impact_sectors: ['justice', 'young_people', 'community', 'mental_health'],
    target_beneficiaries: ['young_people', 'ex_offenders', 'general_public'],
    description: 'Unrestricted grants of up to £5,000 for voluntary, community and social enterprise groups in Cornwall and the Isles of Scilly running projects that tackle the root causes of antisocial behaviour, including drug and alcohol misuse, violence and theft: youth diversion in ASB hotspots, mentoring for young people known to police, early-intervention substance misuse work. Open 9 September to 21 October 2026; decisions mid December; projects run from mid December 2026 to 1 December 2027.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Cornwall', last_enriched: TODAY, open_status: 'open',
      who_can_apply: `Voluntary, community and social enterprise groups and organisations in Cornwall and the Isles of Scilly that support communities with diversionary activity from drug-related antisocial behaviour. ${CCF_WHO}`,
      what_they_fund: 'Projects addressing the root causes of antisocial behaviour rather than its symptoms, in line with the Devon and Cornwall Police and Crime Plan: supervised evening activities for young people in a known hotspot at the times incidents occur, mentoring for young people already known to police or agencies for low-level ASB, and early-intervention alcohol or substance misuse work with young people or repeat offenders in a named area. Spend within 12 months with an end-of-grant report.',
      typical_award: 'Up to £5,000, unrestricted.',
      exclusions: CCF_X,
      priorities: 'Projects that cite local ASB data or a priority named by the Community Safety Partnership or Safer Neighbourhood Team, showing a specific, evidenced local need.',
      decision_timeline: 'Opened 9 September 2026, closes 21 October 2026. Decisions mid December. Projects start from mid December 2026 and finish by 1 December 2027.',
      how_to_apply: 'Apply online from the fund page with the Foundation\'s standard documents. First-time applicants should read the application process and guidance page.',
      funder_tips: 'The Foundation wants root causes, not response, and asks for local ASB data: a line from the Safer Neighbourhood Team naming the hotspot and the hours will carry more weight than a general youth offer.',
      strong_application: 'A named hotspot or cohort, evidence from police or the Community Safety Partnership, and a plan that runs at the times the problem happens.',
      geographic_focus: 'Cornwall and the Isles of Scilly.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £5,000 are available to community groups delivering projects that address the root causes of antisocial behaviour (ASB), rather than simply responding to its symptoms', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/police-property-act/' },
        deadline: { snippet: 'Grant open: 09/09/2026 Applications by: 21/10/2026 Decision date: Mid December Type: Unrestricted Grant value: Grants up to £5,000', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/police-property-act/' },
      },
    },
  },

  { region: 'cornwall',
    title: 'Sedel-Collings Support the Supporters Fund', funder: 'Cornwall Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['restricted'],
    apply_url: 'https://cornwallcommunityfoundation.com/grants/sedel-collings/', funding_index_url: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/', url_status: 'unchecked',
    location_tag: 'Cornwall', is_local: true, amount_min: 500, amount_max: 5000, deadline: '2026-10-07', is_rolling: false,
    deadline_cycle: [{ day: 19, month: 8, label: 'Opens' }, { day: 7, month: 10, label: 'Closes' }],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated', 'ltd_guarantee'], impact_sectors: ['mental_health', 'community', 'health'],
    target_beneficiaries: ['social_impact_orgs', 'mental_health'],
    description: 'Grants of £500 to £5,000 for charitable and volunteer organisations in Cornwall and the Isles of Scilly that help people facing serious challenges, to protect and improve the wellbeing of their own staff, volunteers and trustees: peer support, mentoring, learning and development, creative or nature-based activity, collaboration between organisations. Not counselling, which the sector gets free through Cornwall VSF. Open 19 August to 7 October 2026; projects run 1 December 2026 to 30 November 2027.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Cornwall', last_enriched: TODAY, open_status: 'open',
      who_can_apply: `Charitable and volunteer organisations in Cornwall and the Isles of Scilly that assist people facing serious challenges, applying for the wellbeing of their staff, volunteers and trustees. ${CCF_WHO}`,
      what_they_fund: 'Sustainable activity, over and above statutory or professional requirements, that strengthens frontline teams\' wellbeing and resilience: new or pilot approaches, activity led by staff or peers, learning and development that can be embedded in practice, and imaginative collaboration between organisations. Examples: CPD, workshops, one-to-one wellbeing support, mentoring, buddying or peer support, creative, physical or nature-based activities that give space to reflect.',
      typical_award: '£500 to £5,000.',
      exclusions: `Counselling and talking therapies, available free to the sector through Cornwall VSF and Care Coins. One-off events with no lasting effect. ${CCF_X}`,
      priorities: 'Sustainable support for sustainable people: activity that leaves staff and volunteers better able to cope with difficult situations with confidence and clarity, and that lasts beyond a single event.',
      decision_timeline: 'Opened 19 August 2026, closes 7 October 2026. Decisions early November 2026. Projects run from 1 December 2026 to 30 November 2027.',
      how_to_apply: 'Apply online from the fund page with the Foundation\'s standard documents. A free recorded workshop on the fund\'s purpose and how to apply is linked from the page.',
      funder_tips: 'The fund says plainly it is not for a one-off wellbeing day, and not for counselling. Activity designed with the staff group itself, and something that becomes part of how the organisation works, is what it is asking for.',
      strong_application: 'A frontline organisation under strain, a peer-led plan, and a way the activity keeps going after the grant.',
      geographic_focus: 'Cornwall and the Isles of Scilly.',
      _citations: {
        typical_award: { snippet: 'Grant open: 19/08/2026 Applications by: 07/10/2026 Decision date: Early November 2026 Area: Cornwall and the Isles of Scilly Grant value: Grants from £500 to £5,000 are available.', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/sedel-collings/' },
        who_can_apply: { snippet: 'Charitable and volunteer organisations who assist people facing serious challenges, to help these organisations protect and enhance the wellbeing of their staff, volunteers, and trustees.', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/sedel-collings/' },
        exclusions: { snippet: 'This fund will not cover counselling or talking therapies as you can access this support via Cornwall VSF', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/sedel-collings/' },
      },
    },
  },

  { region: 'cornwall',
    title: 'Headland Hotel Community Fund (Newquay)', funder: 'Cornwall Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://cornwallcommunityfoundation.com/grants/headland-hotel-community-fund/', funding_index_url: 'https://cornwallcommunityfoundation.com/cornwall-charity-grants/grants/', url_status: 'unchecked',
    location_tag: 'Newquay', is_local: true, amount_min: 1000, amount_max: 4000, deadline: '2026-10-14', is_rolling: false,
    deadline_cycle: [{ day: 3, month: 9, label: 'Opens' }, { day: 14, month: 10, label: 'Closes' }],
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated'], impact_sectors: ['environment', 'employment', 'education', 'community'],
    target_beneficiaries: ['people_in_poverty', 'general_public'],
    description: 'Grants of £1,000 to £2,000 for a single organisation, or £2,500 to £4,000 for a partnership of two or more, from the Headland Hotel through Cornwall Community Foundation, for grassroots charities, CICs and CIOs in or benefiting Newquay (TR7 and TR8): environmental projects, social mobility through skills, training and employability, or both together. Core and project costs. Open 3 September to 14 October 2026; decisions in December.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Newquay', last_enriched: TODAY, open_status: 'open',
      who_can_apply: `Grassroots voluntary and community organisations, charities, CICs and CIOs based in or directly benefiting people in Newquay and the surrounding area, postcodes TR7 and TR8. Partnership applications from two or more organisations are welcomed this year. ${CCF_WHO}`,
      what_they_fund: 'Environmental projects that protect, restore or educate around the local environment, biodiversity, climate or sustainability; social mobility initiatives for skills, training, education and employability in disadvantaged communities; and dual-impact projects such as green skills training or community growing. Core and project costs, with measurable quantitative outcomes reported at the end.',
      typical_award: '£1,000 to £2,000 for one organisation; £2,500 to £4,000 for a joint application.',
      exclusions: `Anything outside Newquay and TR7 or TR8. Projects without an environmental or social mobility focus. Repeat applicants who have not returned previous end-of-grant forms. ${CCF_X}`,
      priorities: 'Locally rooted work with measurable outcomes and long-term impact; collaboration between organisations whose strengths complement each other.',
      decision_timeline: 'Opened 3 September 2026, closes 14 October 2026. Panel and decision in December 2026, with payment usually within ten days of the decision.',
      how_to_apply: 'Apply online at the bottom of the fund page with the Foundation\'s standard documents.',
      funder_tips: 'The partnership route doubles the ceiling, and the funder has said it wants to see joined-up projects this year. A named quantitative outcome is a stated requirement, so pick one number and say how it will be measured.',
      strong_application: 'A Newquay group with a green or skills project, one measurable outcome, and ideally a partner.',
      geographic_focus: 'Newquay and surrounding areas, postcodes TR7 and TR8.',
      _citations: {
        typical_award: { snippet: 'Individual applications: £1,000 – £2,000 Partnership applications (two or more organisations applying jointly): £2,500 – £4,000', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/headland-hotel-community-fund/' },
        deadline: { snippet: 'Application open: 03/09/2026 Application deadline: 14/10/2026 Panel discussion: December 2026', confidence: 'high', source_url: 'https://cornwallcommunityfoundation.com/grants/headland-hotel-community-fund/' },
      },
    },
  },
]

// Cheshire Community Foundation's Open Grants row already exists (2f8b8ab2),
// hidden since its 29 July deadline passed and tagged "North West England",
// which is why Cheshire counted as zero. The programme is rolling with four
// deadlines a year; the row is corrected here rather than duplicated.
const REVIVE: { idPrefix: string; region: string; fields: Record<string, unknown> }[] = [
  { idPrefix: '2f8b8ab2', region: 'cheshire', fields: (() => { const { region: _r, title: _t, funder: _f, funder_type: _ft, funding_type: _fy, ...rest } = ROWS[0]; return { ...rest, is_active: true } })() },
]

async function main() {
  const db = getAdminDb()
  // Archived stubs revived hidden into review, never straight to live.
  for (const row of ROWS.filter(r => r.reviveId && (REGION === 'all' || r.region.replace('-revived', '') === REGION))) {
    const { region, reviveId, ...fields } = row
    const { data: hit } = await db.from('scraped_grants').select('id, title, pipeline_state').eq('pipeline_state', 'archived').limit(3000)
    const target = hit?.find(d => d.id.startsWith(reviveId!))
    if (!target) { console.log('  revive target not found', reviveId); continue }
    console.log(`  revive-hidden [${region}] ${target.title} -> ${row.title}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: target.id, source: 'user_verified:regions-cf-2026-09-09', db, fields: { ...fields, is_active: false, pipeline_state: 'tagged_awaiting_review' } })
    const blocked = r.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied ${r.applied.length}` + (blocked.length ? ' BLOCKED ' + blocked.map(x => x.field + ':' + x.reason).join(',') : ''))
  }
  for (const rv of REVIVE.filter(r => REGION === 'all' || r.region === REGION)) {
    const { data } = await db.from('scraped_grants').select('id, title, pipeline_state, is_active').in('pipeline_state', ['published', 'between_rounds_scheduled']).limit(3000)
    const row = data?.find(d => d.id.startsWith(rv.idPrefix))
    if (!row) { console.log('  revive target not found', rv.idPrefix); continue }
    console.log(`  revive [${rv.region}] ${row.title} [${row.pipeline_state} active=${row.is_active}]`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: 'user_verified:regions-cf-2026-09-09', db, fields: rv.fields })
    const blocked = r.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied ${r.applied.length}` + (blocked.length ? ' BLOCKED ' + blocked.map(x => x.field + ':' + x.reason).join(',') : ''))
  }
  const rows = ROWS.filter(r => REGION === 'all' || r.region === REGION)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', '| region:', REGION, '| rows:', rows.length)
  let staged = 0
  for (const { region, reviveId, ...row } of rows) {
    if (reviveId) continue
    const host = new URL(row.apply_url).hostname.replace(/^www\./, '')
    const { data: byUrl } = await db.from('scraped_grants').select('id, title, pipeline_state').ilike('apply_url', `%${new URL(row.apply_url).pathname}%`).limit(3)
    const { data: byTitle } = await db.from('scraped_grants').select('id, title, pipeline_state').ilike('title', `%${String(row.title).split(' ').slice(0, 3).join(' ')}%`).limit(3)
    // A URL match is the same fund. A title match is a warning to read, not a
    // block: "Bentley Advancing Life Chances" also names Bentley's national fund.
    if (byUrl?.length) { console.log(`  already_held: ${row.title} -> ${byUrl.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    if (byTitle?.length) console.log(`  (title also matches: ${byTitle.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')})`)
    console.log(`  stage [${region}] ${row.title}  (${host})`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : rows.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
