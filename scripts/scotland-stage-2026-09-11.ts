// Scotland brief (docs/handoffs/scotland-2026-09-11.md), batch one, run by the
// orchestrating session on Paul's "start now", 11 Sept 2026. Every page quoted
// was fetched in this session by direct fetch; no model call. Dedup by funder
// was run in SQL before any page was opened: none of these funders was held.
//
// Staged hidden at system: trust. Rows whose next round has a stated date but
// is more than a month out go to between_rounds_scheduled; the sweep surfaces
// them a month ahead. Nothing here touches an existing row.
//
//   npx tsx --env-file=.env.local scripts/scotland-stage-2026-09-11.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:scotland-2026-09-11'
const TODAY = '2026-09-11'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string; pipeline_state?: string }
const NEW: Row[] = [
  { title: 'Bank of Scotland Foundation Energise', funder: 'Bank of Scotland Foundation', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'multi_year'],
    apply_url: 'https://www.bankofscotlandfoundation.org/funding-programmes/energise', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: 20000, amount_max: 40000, deadline: '2026-10-07', is_rolling: false,
    next_open_date: 'Opens noon Monday 28 September 2026', max_org_income: 150000,
    eligible_structures: ['registered_charity', 'scio'], impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['general_public', 'people_in_poverty'],
    description: 'Two-year unrestricted grants from the Bank of Scotland Foundation for small Scottish charities supporting vulnerable people: £20,000 (£10,000 a year) for charities with income under £50,000, £40,000 (£20,000 a year) for income £50,000 to £150,000. Registered in Scotland with a charity number beginning SC0 and at least one year of accounts at OSCR. Opens noon 28 September 2026, closes noon 7 October 2026; decisions mid December.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Charities registered in Scotland with a charity number beginning SC0, income of £150,000 or less in the last year, at least one year of accounts lodged and checked at OSCR, supporting vulnerable people.',
      what_they_fund: 'Unrestricted funding: core costs, delivery costs, project costs and general running costs.',
      typical_award: 'Two-year grant of £20,000 (income under £50,000) or £40,000 (income £50,000 to £150,000).',
      exclusions: 'Charities whose sole purpose is animal welfare or the advancement of religion; grant-makers; political organisations; charities holding a live grant from the Foundation.',
      decision_timeline: 'Opens noon Monday 28 September 2026, closes noon Wednesday 7 October 2026. Decisions by mid December 2026; funding paid mid January 2027.',
      how_to_apply: 'Online application with three documents: a one-page summary of up to 500 words, signed annual accounts as lodged at OSCR, and the constitution. Allow extra time for the new application system.',
      _citations: {
        typical_award: { snippet: '2 year grant of £20k', confidence: 'high', source_url: 'https://www.bankofscotlandfoundation.org/funding-programmes/energise' },
        who_can_apply: { snippet: 'registered in Scotland with a charity number beginning SC0', confidence: 'high', source_url: 'https://www.bankofscotlandfoundation.org/funding-programmes/energise' },
        decision_timeline: { snippet: 'Noon Monday 28th September', confidence: 'high', source_url: 'https://www.bankofscotlandfoundation.org/funding-programmes/energise' },
      } } },

  { title: 'Bank of Scotland Foundation Empower', funder: 'Bank of Scotland Foundation', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'multi_year'], pipeline_state: 'between_rounds_scheduled',
    apply_url: 'https://www.bankofscotlandfoundation.org/funding-programmes/empower', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: 250000, amount_max: 250000, deadline: null, is_rolling: false,
    next_open_date: 'Next round January 2027, date to be confirmed', min_org_income: 150000, max_org_income: 500000,
    eligible_structures: ['registered_charity', 'scio'], impact_sectors: ['community', 'social_economy'], target_beneficiaries: ['general_public', 'people_in_poverty'],
    description: 'Five-year unrestricted grants of up to £250,000 (£50,000 a year) from the Bank of Scotland Foundation for Scottish charities supporting vulnerable groups, with income between £150,000 and £500,000 and at least three years of accounts at OSCR. The next round is expected in January 2027, date to be confirmed.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Charities registered in Scotland with a charity number beginning SC0, income between £150,000 and £500,000 a year, at least three years of accounts at OSCR, supporting vulnerable groups.',
      what_they_fund: 'Five-year unrestricted funding.',
      typical_award: 'Up to £250,000 over five years, £50,000 a year.',
      exclusions: 'Charities whose sole purpose is animal welfare, religion or grant-making; charities with an active grant from the Foundation.',
      decision_timeline: 'Not currently open. Next round January 2027, dates to be confirmed.',
      how_to_apply: 'Online application with a one-page description, recent signed accounts lodged at OSCR and the constitution, by 12 noon on the closing date.',
      _citations: {
        typical_award: { snippet: 'Charities can apply for a 5 year unrestricted grant of up to £250k (£50k per year).', confidence: 'high', source_url: 'https://www.bankofscotlandfoundation.org/funding-programmes/empower' },
        decision_timeline: { snippet: 'January 2027 (Date TBC)', confidence: 'high', source_url: 'https://www.bankofscotlandfoundation.org/funding-programmes/empower' },
      } } },

  { title: 'RS Macdonald Charitable Trust Small Grants', funder: 'RS Macdonald Charitable Trust', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'core_costs'],
    apply_url: 'https://www.rsmacdonald.com/our-grants/', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: null, amount_max: 20000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'scio', 'unincorporated'], impact_sectors: ['health', 'disability', 'young_people'], target_beneficiaries: ['children', 'disabled_people', 'general_public'],
    description: 'Rolling small grants of up to £20,000 from the RS Macdonald Charitable Trust for small, often volunteer-led, community initiatives in Scotland working in its themes: tackling child abuse and neglect, visual impairment and sight loss, neurological conditions, and animal welfare. Running costs up to £10,000 a year, or one-off development projects such as equipment or a service evaluation. No deadline; assessed as they arrive.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations working to benefit people who live in Scotland, within the Trust\'s themes. Small grants are aimed at small, community-based, often volunteer-led initiatives.',
      what_they_fund: 'Running costs, or one-off development projects such as equipment purchases or service evaluations, in the themes of tackling child abuse and neglect, visual impairment and sight loss, neurological conditions, and animal welfare. Main grants over £20,000 run to a twice-yearly deadline; the autumn 2026 deadline was 8 September.',
      typical_award: 'Up to £20,000 in total, and no more than £10,000 a year for running costs.',
      exclusions: 'Work outside the Trust\'s themes or not benefiting people in Scotland.',
      decision_timeline: 'Rolling for small grants. Main grants twice a year; the next main deadline after 8 September 2026 is not yet published.',
      how_to_apply: 'Online application form linked from the applications page, with the most recent audited or independently examined accounts and a project proposal.',
      _citations: {
        typical_award: { snippet: 'up to £20,000', confidence: 'high', source_url: 'https://www.rsmacdonald.com/our-grants/' },
        decision_timeline: { snippet: 'Small grant applications can be submitted at any time', confidence: 'high', source_url: 'https://www.rsmacdonald.com/our-grants/applications/' },
      } } },

  { title: 'Cruden Foundation Appeals', funder: 'Cruden Foundation', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://crudenfoundation.org/how-to-apply/', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2026-11-06', is_rolling: false,
    eligible_structures: ['registered_charity', 'scio'], impact_sectors: ['community', 'health', 'education', 'creative', 'environment'], target_beneficiaries: ['general_public'],
    description: 'Grants from the Cruden Foundation for registered charities based or working in Scotland, with a focus on the Central and South regions, across community welfare, health, medical research, the arts, education and conservation. Trustees tend to give lower amounts to a wider range of charities and meet three times a year; the next deadline is the end of Friday 6 November 2026. One appeal per organisation per year.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Registered charitable organisations based in, or specifically working in, Scotland, with a focus on charities operating in or benefiting people in the Central and South regions. Not individuals.',
      what_they_fund: 'Community welfare, medical support and research, the arts, education and conservation.',
      typical_award: 'No minimum or maximum. The Foundation has tended to gift lower amounts to a wider range of charities; the Treasurer may approve up to £5,000 between meetings.',
      exclusions: 'Capital expenditure projects, and activities that are the responsibility of the local health or education authority.',
      decision_timeline: 'Trustees meet three times a year, normally November or December, February and June. Next deadline: end of Friday 6 November 2026. One appeal per financial year (August to July).',
      how_to_apply: 'Online appeal form on the Foundation site, with the latest financial accounts.',
      _citations: {
        who_can_apply: { snippet: 'registered charitable organisations', confidence: 'high', source_url: 'https://crudenfoundation.org/how-to-apply/' },
        decision_timeline: { snippet: 'end of Friday 6th November 2026', confidence: 'high', source_url: 'https://crudenfoundation.org/how-to-apply/' },
      } } },

  { title: 'Nancie Massey Charitable Trust', funder: 'Nancie Massey Charitable Trust', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://www.turcanconnell.com/nancie-massey-charitable-trust', url_status: 'unchecked',
    location_tag: 'Edinburgh and the Lothians', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-11-28', is_rolling: false, max_org_income: 500000,
    eligible_structures: ['registered_charity', 'scio'], impact_sectors: ['creative', 'health', 'education', 'older_people', 'young_people'], target_beneficiaries: ['children', 'young_people', 'older_people'],
    description: 'Grants, typically up to £5,000 for one year, from the Nancie Massey Charitable Trust to charities in Edinburgh and the Lothians working in the arts, health and wellbeing, education and lifelong learning, and reducing isolation, with a focus on children, young people and older people. Trustees favour community-based charities with income up to £500,000. Next deadline 28 November 2026 for the December meeting.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Edinburgh and the Lothians', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charitable bodies only, in Edinburgh and the Lothians. Trustees favour community-based charities with annual income up to £500,000, helping people facing difficult circumstances.',
      what_they_fund: 'The arts, health and wellbeing, education and lifelong learning, and reducing isolation, with a focus on children, young people and the elderly.',
      typical_award: 'No maximum or minimum; a typical grant is up to £5,000, most for one year.',
      exclusions: 'Medical research applications are by invitation only.',
      decision_timeline: 'Trustees meet in March, June, September and December. Deadlines: 28 November 2026 for the December meeting; 26 February 2027 for the March meeting.',
      how_to_apply: 'Request the application form by email from nanciemassey@turcanconnell.com and return it by email.',
      _citations: {
        typical_award: { snippet: 'a typical grant is up to £5,000', confidence: 'high', source_url: 'https://www.turcanconnell.com/nancie-massey-charitable-trust' },
        who_can_apply: { snippet: 'community-based charities with annual incomes of up to £500,000', confidence: 'high', source_url: 'https://www.turcanconnell.com/nancie-massey-charitable-trust' },
      } } },

  { title: 'W A Cargill Fund', funder: 'W A Cargill Fund', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://funding.scot/funds/a0Rb0000000Ng5AEAS/w-a-cargill-fund', url_status: 'unchecked',
    location_tag: 'Glasgow and the West of Scotland', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'scio', 'unincorporated'], impact_sectors: ['community', 'health', 'education'], target_beneficiaries: ['general_public', 'people_in_poverty'],
    description: 'Grants from the W A Cargill Fund for charities whose work benefits the community in Glasgow and the West of Scotland: North Ayrshire, East and West Dunbartonshire, Inverclyde, Renfrewshire, Argyll and Bute and the Western Isles. Capital and revenue costs across poverty, education, health and community development. Apply in writing at any time; trustees meet quarterly. The Fund has no website of its own; this is its Funding Scotland entry.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Glasgow and the West of Scotland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Hospitals, institutions, societies and others whose work the trustees believe is beneficial to the community, in Glasgow, North Ayrshire, East Dunbartonshire, Inverclyde, Renfrewshire, West Dunbartonshire, Argyll and Bute and Na h-Eileanan Siar.',
      what_they_fund: 'General charitable activities and health care and wellbeing; capital and revenue costs.',
      typical_award: 'Not published.',
      exclusions: 'Work outside the West of Scotland.',
      decision_timeline: 'Apply at any time. Trustees meet quarterly.',
      how_to_apply: 'Apply in writing to the Fund at Miller Beckett and Jackson, 190 St Vincent Street, Glasgow G2 5SP, with a statement of the charity\'s aims and objectives and the most recent audited accounts.',
      _citations: {
        decision_timeline: { snippet: 'Apply at any time. Trustees meet quarterly.', confidence: 'high', source_url: 'https://funding.scot/funds/a0Rb0000000Ng5AEAS/w-a-cargill-fund' },
        how_to_apply: { snippet: 'Apply in writing to the Fund, including a statement of your charity\'s aims and objectives and a copy of your most recent audited accounts.', confidence: 'high', source_url: 'https://funding.scot/funds/a0Rb0000000Ng5AEAS/w-a-cargill-fund' },
      } } },

  { title: 'James T Howat Charitable Trust', funder: 'James T Howat Charitable Trust', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://funding.scot/funds/a0Rb0000000Ng6jEAC/james-t-howat-charitable-trust', url_status: 'unchecked',
    location_tag: 'Glasgow', is_local: true, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'scio', 'unincorporated'], impact_sectors: ['community', 'health', 'creative', 'education', 'sport', 'mental_health'], target_beneficiaries: ['children', 'young_people', 'older_people', 'disabled_people', 'people_in_poverty'],
    description: 'Grants from the James T Howat Charitable Trust, primarily for projects benefiting Glasgow and its citizens, with the central belt and Argyll and the Isles also considered, across arts, education, health, mental health, sport, social care and respite. Trustees meet in March, June, September and December; apply in writing by the middle of the month before a meeting. The Trust has no website; this is its Funding Scotland entry.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Glasgow', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations and charities whose projects benefit Glasgow and its citizens first; the central belt and Argyll and the Isles also considered, and other Scottish or UK projects for small grants applied locally.',
      what_they_fund: 'Arts and culture, education and training, health and wellbeing, mental health, sport and physical activity, social care and respite, for children, young people, older people, families, disabled people and disadvantaged communities.',
      typical_award: 'Not published. Annual giving is around £330,000 across many grants.',
      exclusions: 'Not stated.',
      decision_timeline: 'Trustees meet in March, June, September and December. Applications by the middle of the month before the meeting.',
      how_to_apply: 'In writing to Harper Macleod LLP, The Ca\'d\'Oro, 45 Gordon Street, Glasgow G1 3PE: a summary of no more than one A4 sheet, with accounts or business plan and governing documents.',
      _citations: {
        decision_timeline: { snippet: 'The Trustees meet to consider grants in March, June, September and December. Applications should be made by the middle of the month preceding the meeting.', confidence: 'high', source_url: 'https://funding.scot/funds/a0Rb0000000Ng6jEAC/james-t-howat-charitable-trust' },
        who_can_apply: { snippet: 'The Trustees\' current policy is to support primarily projects which are for the benefit of Glasgow and her citizens.', confidence: 'high', source_url: 'https://funding.scot/funds/a0Rb0000000Ng6jEAC/james-t-howat-charitable-trust' },
      } } },

  { title: 'Gordon and Ena Baxter Foundation Grants', funder: 'The Gordon and Ena Baxter Foundation', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: 'https://www.baxterfamilycharity.org/applications/', url_status: 'unchecked',
    location_tag: 'North East Scotland and the Highlands', is_local: true, amount_min: 100, amount_max: 25000, deadline: '2026-10-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'scio', 'unincorporated'], impact_sectors: ['health', 'heritage', 'environment', 'education', 'sport', 'creative'], target_beneficiaries: ['general_public', 'young_people'],
    description: 'Capital grants of £100 to £25,000, most between £1,000 and £10,000, from the Gordon and Ena Baxter Foundation for UK registered charities and constituted community or sporting groups in Moray, Aberdeenshire, Aberdeen City, the Highlands, the Western Isles, Orkney and Shetland. Five themes: health and wellbeing, arts and heritage, conservation and the environment, education, and sport. Quarterly rounds; the last 2026 deadline is 30 October, outcomes in the first week of December.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'North East Scotland and the Highlands', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities or constituted community or sporting groups in Moray, Aberdeenshire, Aberdeen City, the Highlands, Comhairle nan Eilean Siar, Orkney and Shetland. Social enterprises that are registered charities can apply.',
      what_they_fund: 'Capital expenditure in five themes: health and wellbeing including nutrition, arts and heritage, conservation and the environment, education, and amateur sport with youth development.',
      typical_award: '£100 to £25,000; the majority £1,000 to £10,000.',
      exclusions: 'Retrospective funding, routine repairs and maintenance, individual or team sponsorship, religious or political promotion, group trips or attendance at competitions, animal welfare charities.',
      decision_timeline: 'Quarterly rounds. The remaining 2026 deadline is 30 October, with outcomes in the first week of December 2026.',
      how_to_apply: 'Complete the eligibility quiz on the applications page, read the application guidance, then apply online. Questions to sarah@gebfoundation.com.',
      _citations: {
        typical_award: { snippet: 'Awards are for capital expenditure and range from £100 up to £25,000, with the majority ranging from £1,000 to £10,000.', confidence: 'high', source_url: 'https://www.baxterfamilycharity.org/applications/' },
        decision_timeline: { snippet: 'The remaining submission deadline for 2026 is October 30.', confidence: 'high', source_url: 'https://www.baxterfamilycharity.org/applications/' },
        who_can_apply: { snippet: 'UK registered charities or constituted community or sporting groups. Social enterprises, which are registered charities, can apply.', confidence: 'high', source_url: 'https://www.baxterfamilycharity.org/applications/' },
      } } },

  { title: 'Highland Small Grants Programme', funder: 'The Highland Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'capital', 'core_costs'],
    apply_url: 'https://www.highland.gov.uk/economy-regeneration/community-led-local-development-fund/2', url_status: 'unchecked',
    location_tag: 'Highland', is_local: true, amount_min: null, amount_max: 10000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'scio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee', 'cooperative'], impact_sectors: ['community', 'young_people'], target_beneficiaries: ['general_public', 'children', 'young_people', 'people_in_poverty'],
    description: 'Grants of up to £10,000 from the Highland Council\'s Community-Led Local Development Fund for not-for-profit and community-led organisations in eligible rural Highland areas. Two priorities: improving community-run assets so they are stronger, warmer and more sustainable, and short-term community-led projects that reduce barriers from poverty and isolation for children, young people and families. Reopened 15 July 2026; all activity must be complete by February 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Highland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Not-for-profit and community-led organisations operating within eligible rural Highland areas.',
      what_they_fund: 'Priority 1, community asset improvements; priority 2, tackling inequality for children, young people and families. Projects and organisational sustainability activity deliverable within the programme timescale.',
      typical_award: 'Up to £10,000.',
      exclusions: 'Activity that cannot be completed by February 2027; organisations outside the eligible rural areas.',
      decision_timeline: 'Reopened 15 July 2026 for the 2026/27 programme. No closing date is stated; all project activity must be completed by February 2027, so apply early.',
      how_to_apply: 'Guidance notes and application forms on the Community-Led Local Development Fund page.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £10,000 are available', confidence: 'high', source_url: 'https://www.highland.gov.uk/news/article/17351/highland-small-grants-programme-reopens-with-expanded-support-for-community-organisations' },
        who_can_apply: { snippet: 'Applications are open to not-for-profit and community-led organisations operating within eligible rural Highland areas.', confidence: 'high', source_url: 'https://www.highland.gov.uk/news/article/17351/highland-small-grants-programme-reopens-with-expanded-support-for-community-organisations' },
      } } },

  { title: 'Highland Nature Restoration Fund Community Grants', funder: 'The Highland Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['capital'],
    apply_url: 'https://www.highland.gov.uk/nature-biodiversity/nature-restoration-fund', url_status: 'unchecked',
    location_tag: 'Highland', is_local: true, amount_min: 2000, amount_max: 25000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'scio', 'unincorporated', 'cooperative', 'cic_guarantee', 'ltd_guarantee'], impact_sectors: ['environment', 'community'], target_beneficiaries: ['general_public'],
    description: 'Capital grants of £2,000 to £25,000 from the Highland Council\'s Nature Restoration Fund for constituted community groups, charities, co-operatives, community ownership initiatives and development trusts in Highland, for projects that restore nature and biodiversity: wildflower meadows, tree planting, wetland creation, removing invasive species. Open since 14 August 2026 and assessed on a rolling basis.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Highland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Constituted community groups, charities, public sector bodies, co-operatives and community ownership initiatives, and development trusts in Highland. Other governance structures should contact the council first.',
      what_they_fund: 'Capital projects only that address habitat loss and biodiversity decline: wildflower meadows, tree planting, wetland creation, removal of invasive species.',
      typical_award: '£2,000 to £25,000.',
      exclusions: 'Revenue costs; projects outside Highland.',
      decision_timeline: 'Applications opened Friday 14 August 2026 and are assessed on a rolling basis; no closing date stated.',
      how_to_apply: 'Full details and the application on the Nature Restoration Fund page; eligibility questions to nrf@highland.gov.uk.',
      _citations: {
        typical_award: { snippet: 'grants available from £2,000 to £25,000', confidence: 'high', source_url: 'https://www.highland.gov.uk/news/article/17416/nature-restoration-fund-community-grants-programme-opens-for-applications' },
        decision_timeline: { snippet: 'Applications open on Friday 14 August 2026', confidence: 'high', source_url: 'https://www.highland.gov.uk/news/article/17416/nature-restoration-fund-community-grants-programme-opens-for-applications' },
      } } },

  // Edinburgh Community Grants Fund: already held (f4b5d074, live); handled as an update to that row, not a new one.

  { title: 'Scotmid Community Grant', funder: 'Scotmid Co-operative', funder_type: 'corporate',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://scotmid.coop/community-and-charity/supporting-local-communities/application-guidelines/', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: null, amount_max: 500, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'scio', 'unincorporated', 'cic_guarantee'], impact_sectors: ['community', 'health', 'education', 'environment', 'older_people', 'creative'], target_beneficiaries: ['general_public', 'children', 'older_people'],
    description: 'One-off grants of up to £500 from Scotmid Co-operative for community, self-help and voluntary groups and charities serving a community near one of its stores, within a Scotmid regional committee area. Themes: children and education, health, homelessness and poverty, arts and culture, environment, older people, active lifestyles. No deadlines; apply at least eight weeks before the money is needed.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Local community, self-help or voluntary groups and charities, including local branches of national charities, based in or benefiting a community served by a Scotmid store and within one of its regional committee areas.',
      what_they_fund: 'Children and education, health, homelessness and poverty, arts and culture, environment, the elderly, and active lifestyles.',
      typical_award: 'Up to £500.',
      exclusions: 'Groups outside a Scotmid store community.',
      decision_timeline: 'No deadlines. Apply at least eight weeks before the grant is required.',
      how_to_apply: 'Online via the Scotmid website; questions to the Membership and Community Team on 0131 335 4433.',
      _citations: {
        typical_award: { snippet: 'The maximum amount available for a Community Grant is £500.', confidence: 'high', source_url: 'https://scotmid.coop/community-and-charity/supporting-local-communities/application-guidelines/' },
        decision_timeline: { snippet: 'There are no deadlines, however you must apply at least eight weeks prior to when the grant is required.', confidence: 'high', source_url: 'https://scotmid.coop/community-and-charity/supporting-local-communities/application-guidelines/' },
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
    const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase())
    if (exact.length) { console.log(`  already_held, skipping: ${row.title} -> ${exact.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    if (sameFunder.length) console.log(`  same funder held: ${row.title} -> ${sameFunder.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`)
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
