// Sectors brief (docs/handoffs/sectors-national-2026-09-09.md), run by the
// orchestrating session on Paul's "ok start now", 9 Sept 2026. Every page
// quoted was fetched in this session by direct fetch; no model call.
//
// Two kinds of change: NEW rows staged hidden at system: trust, and REVIVES
// of rows we already held. A revive that was previously published and was
// hidden only by a stale deadline goes back live with the page's dates; an
// archived stub goes hidden into review; a closed round goes between rounds.
//
//   npx tsx --env-file=.env.local scripts/sectors-national-stage-2026-09-09.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant, mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:sectors-national-2026-09-09'
const UV = 'user_verified:sectors-national-2026-09-09'
const TODAY = '2026-09-09'

type Row = Record<string, unknown> & { sector: string; title: string; apply_url: string }

const NEW: Row[] = [
  { sector: 'older_people',
    title: 'Barchester Charitable Foundation Group Grants', funder: 'Barchester Charitable Foundation', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://bhcfoundation.org.uk/apply', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 100, amount_max: 2600, deadline: null, is_rolling: false, next_open_date: '2026-10-01',
    deadline_cycle: [
      { day: 1, month: 1, label: 'January window opens' }, { day: 1, month: 4, label: 'April window opens' },
      { day: 1, month: 7, label: 'July window opens' }, { day: 1, month: 10, label: 'October window opens' },
    ],
    eligible_structures: ['registered_charity', 'cio', 'unincorporated'], impact_sectors: ['older_people', 'disability', 'mental_health', 'community'],
    target_beneficiaries: ['older_people', 'disabled_people', 'mental_health'],
    description: 'Grants of £100 to £2,600 for small community groups and local charities in England, Scotland, Wales and Jersey for activities, outings, equipment and materials that combat isolation and loneliness among older people and adults with a disability or mental health condition. Group applications open in January, April, July and October; the next window opens 1 October 2026, with outcomes within two months.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Small community groups and small local charities in England, Scotland, Wales and Jersey whose members or service users are older people or adults with a physical disability or mental health condition. Community health professionals can also apply, and can apply for an individual at any time (£100 to £1,500 for mobility equipment).',
      what_they_fund: 'Activities, outings, equipment and materials for members and service users that connect or reconnect people with others in their local community and enable them to be active and engaged.',
      typical_award: '£100 to £2,600 for a group. £100 to £1,500 for an individual, applied for by a supporting professional.',
      exclusions: 'The Foundation asks applicants to read Who and what we fund first; it funds small groups and charities rather than large organisations.',
      priorities: 'Combating isolation and loneliness; connecting people with their local community.',
      decision_timeline: 'Group applications are open in January, April, July and October each year. Currently closed; the next window opens on 1 October 2026. Outcomes within two months.',
      how_to_apply: 'Online application from the Apply for a grant page while a window is open, with a cost breakdown and the latest annual accounts ready to upload.',
      funder_tips: 'Have the budget and accounts ready before 1 October; the window is short and the form asks for both up front.',
      strong_application: 'A specific activity, outing or piece of equipment with a costed budget and a plain line to reduced isolation for named members.',
      geographic_focus: 'England, Scotland, Wales and Jersey.',
      _citations: {
        typical_award: { snippet: 'We help small community groups and local charities with activities, outings, equipment and materials for members/service users. Our grants range from £100 up to £2,600.', confidence: 'high', source_url: 'https://bhcfoundation.org.uk/apply' },
        decision_timeline: { snippet: 'Group applications are now closed and will reopen on the 1st October 2026.', confidence: 'high', source_url: 'https://bhcfoundation.org.uk/apply' },
        who_can_apply: { snippet: 'We support applications from community health professionals, community groups and registered charities that combat isolation and loneliness and enable older people and adults with disabilities to be active and engaged.', confidence: 'high', source_url: 'https://bhcfoundation.org.uk/apply' },
      },
    },
  },

  { sector: 'food',
    title: 'FareShare Community Food Membership and FareShare Go', funder: 'FareShare', funder_type: 'other',
    funding_type: 'in_kind', funding_subtypes: ['goods'],
    apply_url: 'https://fareshare.org.uk/getting-food/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'unincorporated', 'ltd_guarantee'], impact_sectors: ['food', 'community'],
    target_beneficiaries: ['people_in_poverty', 'general_public'],
    description: 'Surplus food for charities and community groups that use food to support people, anywhere in the UK. Community Food Membership links you to a FareShare regional centre for a regular, chosen supply of surplus from growers, manufacturers and retailers for a nominal fee. FareShare Go gives free direct collections from local supermarkets and restaurants including Tesco, Asda, Waitrose, Booker, KFC and Nando\'s. Rolling; register interest online.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities and community groups anywhere in the UK that use food to support people and can show they are fit to provide a safe food service. Nearly 8,000 organisations receive food already.',
      what_they_fund: 'Two routes. Community Food Membership: a regular supply of pre-retail surplus food through a regional centre, choosing how much and what type, with food safety support and volunteer opportunities, for a nominal fee towards operating costs. FareShare Go: free direct collection of surplus from local supermarkets and restaurants, typically bread, eggs and fresh fruit, always within its use-by date.',
      typical_award: 'Food, not money. Membership carries a nominal fee set by the regional centre; FareShare Go has no cost to the organisation.',
      exclusions: 'Organisations that cannot demonstrate a safe food service.',
      priorities: 'Organisations using food to support people in need.',
      decision_timeline: 'Rolling. Register interest and a member of the FareShare team assesses your needs.',
      how_to_apply: 'Register your interest in receiving food on the Getting Food page; FareShare gets in touch to assess needs and match you to membership or FareShare Go.',
      funder_tips: 'FareShare Go is free and quick to set up; membership gives more choice and volume but comes with a fee. Many groups use both.',
      strong_application: 'A food safety set-up you can describe, a regular service that needs food, and capacity to collect or receive deliveries.',
      geographic_focus: 'UK-wide through regional centres and over 3,500 partner stores.',
      _citations: {
        who_can_apply: { snippet: 'If your organisation uses food to support people, then you can sign up to receive food too.', confidence: 'high', source_url: 'https://fareshare.org.uk/getting-food/' },
        what_they_fund: { snippet: 'We offer two options for getting food – a paid for service with a FareShare Community Food Membership or the opportunity to collect free surplus food from local supermarkets and restaurants through FareShare Go.', confidence: 'high', source_url: 'https://fareshare.org.uk/getting-food/' },
      },
    },
  },

  { sector: 'older_people',
    title: 'McCarthy Stone Foundation Core and Project Funding', funder: 'McCarthy Stone Foundation', funder_type: 'corporate_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'restricted'],
    apply_url: 'https://mccarthystonefoundation.org/our-grant-programmes/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: 7500, deadline: null, is_rolling: true, max_org_income: 250000,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee'], impact_sectors: ['older_people', 'community', 'health'],
    target_beneficiaries: ['older_people'],
    description: 'Unrestricted core funding of up to £7,500 for grassroots registered charities and community groups with people over 65 at the heart of their work, and restricted project funding open also to CICs limited by guarantee, for organisations with annual income under £250,000. Rolling. Festive Connections grants of up to £750 for over-65s celebrations open in September 2026; the Dementia Grants Programme (up to £7,500 for dementia clubs and memory cafés) runs each spring.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Grassroots organisations supporting people over 65 with annual income under £250,000. Unrestricted core funding is for registered charities and community groups only, not CICs. Project funding is open to registered charities, community groups and CICs limited by guarantee.',
      what_they_fund: 'Core costs for organisations with over-65s at the heart of their work, currently up to £7,500 unrestricted, and new or existing programmes dedicated to people over 65, ideally costed on a full cost recovery basis. Separate programmes: Festive Connections (up to £750, over 50 organisations, opens September 2026), Dementia Grants (up to £7,500 for dementia clubs and memory cafés, spring), and Creating Connections (a closed round in 2026 after exceptional demand).',
      typical_award: 'Up to £7,500 core or project funding. Festive Connections up to £750.',
      exclusions: 'Organisations with income over £250,000. Unrestricted funding to CICs. Creating Connections is closed to new applicants in 2026.',
      priorities: 'Strong alignment with the Foundation\'s aims for people over 65, and organisations in the most deprived parts of the country for Festive Connections.',
      decision_timeline: 'Core and project funding are invited on a rolling basis. Festive Connections opens in September 2026 with payments in late October. The Dementia Grants Programme opens each spring and decided by 30 April in 2026.',
      how_to_apply: 'Get in touch through the grant programmes page; the Foundation says it keeps applications and monitoring simple for small organisations and will advise on whether to apply for core funding.',
      funder_tips: 'The Foundation asks small groups to ask before applying for core funding, and says it will help. Read the grant-making policy for the criteria before writing anything.',
      strong_application: 'A small organisation that plainly exists for older people, under the income cap, with a cost-recovery budget.',
      geographic_focus: 'UK-wide.',
      _citations: {
        who_can_apply: { snippet: 'Our foundation runs a number of grant programmes throughout the year for organisations supporting people over 65 and an annual income under £250,000 p.a.', confidence: 'high', source_url: 'https://mccarthystonefoundation.org/our-grant-programmes/' },
        typical_award: { snippet: 'Organisations who can demonstrate a strong alignment with our charitable aims are invited to apply for unrestricted funding, currently up to £7500.', confidence: 'high', source_url: 'https://mccarthystonefoundation.org/our-grant-programmes/' },
        exclusions: { snippet: 'Unrestricted funding is only available to registered charities and community groups. We do not fund unrestricted to Community Interest Companies.', confidence: 'high', source_url: 'https://mccarthystonefoundation.org/our-grant-programmes/' },
      },
    },
  },

  { sector: 'young_people',
    title: 'Hedley Foundation Grants', funder: 'The Hedley Foundation', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant', 'restricted'],
    apply_url: 'https://www.hedleyfoundation.org.uk/apply-now', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: 250, amount_max: 5000, deadline: null, is_rolling: true, max_org_income: 1000000,
    eligible_structures: ['registered_charity', 'cio'], impact_sectors: ['young_people', 'disability', 'older_people', 'community', 'justice'],
    target_beneficiaries: ['young_people', 'disabled_people', 'older_people', 'carers', 'homeless', 'ex_offenders'],
    description: 'Grants typically of up to £5,000, from £250 for the smallest charities, for small UK registered charities with income under £1 million across youth support, disabled support, the elderly and terminally ill, and other social welfare including carers, homelessness and ex-offenders. Rolling; trustees meet regularly. Not for core salaries, buildings, running costs, transport, deficits, CICs or overseas work.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Small UK registered charities with an annual income below £1 million that can demonstrate quantifiable outcomes for beneficiaries, and have not had a Hedley grant in the last two years. Not community interest companies, religious institutions, museums or individuals.',
      what_they_fund: 'Four areas: raising the aspirations of disadvantaged young people through education, the arts, sport and adventurous activity; improving the quality of life of people with a physical or mental disability; improving the quality of life of the elderly and those receiving end-of-life care; and other social welfare such as carers, homeless people and ex-offenders.',
      typical_award: 'Up to £5,000 regularly; £250 upwards for smaller charities; occasional larger sums where high impact can be achieved.',
      exclusions: 'Core salaries, building construction, general running costs, transport, financial deficits and overseas projects. CICs, religious institutions, museums and individuals. Charities funded within the last two years.',
      priorities: 'Quantifiable outcomes: who benefits, how many, and what changes.',
      decision_timeline: 'Rolling. Trustees meet regularly; if nothing is heard within four months the application was unsuccessful, and the Foundation cannot answer queries about submitted applications.',
      how_to_apply: 'Download the application form (Word or PDF) and email it with the latest Statement of Financial Activities and balance sheet and a recent bank statement to applications@hedleyfoundation.org.uk, or post it to the Grants Manager.',
      funder_tips: 'Concise form, a cost breakdown, a stated outcome with numbers, accurate contact details, and the accounts and bank statement attached: the Foundation lists exactly these as what a successful application has.',
      strong_application: 'A small charity with a costed item or project and a number for how many people it reaches.',
      geographic_focus: 'UK.',
      _citations: {
        typical_award: { snippet: 'Typically, grants of up to £5,000 are regularly made and occasional larger sums are given to charities where high impact can be achieved. Similarly, smaller charities often benefit from smaller grants of £250 upwards.', confidence: 'high', source_url: 'https://www.hedleyfoundation.org.uk/apply-now' },
        who_can_apply: { snippet: 'You are a small UK registered charity with an annual income below £1m', confidence: 'high', source_url: 'https://www.hedleyfoundation.org.uk/apply-now' },
        exclusions: { snippet: 'Your application is not on behalf of a community interest company, for religious institutions, museum or for an individual', confidence: 'high', source_url: 'https://www.hedleyfoundation.org.uk/apply-now' },
      },
    },
  },
]

type Revive = { idPrefix: string; label: string; states: string[]; source?: string; fields: Record<string, unknown>; mergeBrief?: boolean }

const REVIVES: Revive[] = [
  // Archived stub → hidden into review with the page's facts.
  { idPrefix: 'b32669f0', label: 'Clothworkers Foundation Open Grants (capital)', states: ['archived'], mergeBrief: false, fields: {
    title: 'Clothworkers Foundation Open Grants Programme (capital)', pipeline_state: 'tagged_awaiting_review', is_active: false,
    apply_url: 'https://www.clothworkersfoundation.org.uk/apply-for-a-grant', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, deadline: null, is_rolling: true, max_org_income: 10000000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cooperative'], impact_sectors: ['disability', 'community', 'justice', 'housing', 'mental_health'],
    target_beneficiaries: ['disabled_people', 'ethnic_minorities', 'people_in_poverty', 'homeless', 'women_girls', 'mental_health'],
    description: 'Rolling capital grants for the infrastructure needs of small and medium charitable organisations working with disadvantaged and marginalised people: buildings, refurbishment, vehicles and equipment. Small grants of £15,000 or under for organisations with turnover under £2 million; large grants above £15,000 for turnover under £10 million. UK registered charities and not-for-profits with an asset lock, working in programme areas including disabled people, economic disadvantage, homelessness, racial inequalities and domestic or sexual abuse. Success rate 28 per cent in 2025.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities, or organisations that can show not-for-profit status with an appropriate asset lock such as CICs without share capital and Community Benefit Societies, operating in the UK. Turnover under £10 million for a large grant (over £15,000) or under £2 million for a small grant (£15,000 or less). At least half the service users benefiting must be from one of the programme areas.',
      what_they_fund: 'Capital costs that support infrastructure: for organisations working with communities experiencing racial inequalities, disabled people and people struggling with mental health (including special schools and organisations for blind and vision impaired people), people affected by domestic or sexual abuse, economic disadvantage, homelessness and other listed programme areas. Priority to organisations led by or fully integrating people with lived experience, and to projects that make a big change to reach, impact or sustainability.',
      typical_award: 'No fixed range. Small grants are £15,000 or less; large grants are above £15,000. Size depends on the organisation and the scale of the capital project.',
      exclusions: 'Organisations with a grant offer in the last five years, or declined in the last six months. Turnover over £10 million. Second-tier or infrastructure bodies, hospices, NHS charities, grant-makers, mainstream schools and universities, organisations promoting a religion or political party. Small grants to organisations with turnover over £2 million.',
      priorities: 'Lived-experience leadership, and capital projects that transform reach, impact or sustainability.',
      decision_timeline: 'Rolling. Take the eligibility quiz first; it issues the link to the right application form.',
      how_to_apply: 'Complete the eligibility quiz on the Apply for a grant page; a unique URL then opens the application. Applications cannot be started without the quiz.',
      funder_tips: 'The Foundation publishes its refusal reasons: financial need not evidenced, financial position not credible, and projects outside the programme areas. Show why the capital item changes what the organisation can do, not just that it is needed.',
      strong_application: 'A capital item with a clear before-and-after for service users, more than half of them from a named programme area, and accounts that show the organisation can sustain it.',
      geographic_focus: 'UK.',
      _citations: {
        who_can_apply: { snippet: 'UK-registered charities, or organisations that are able to demonstrate their not-for-profit status and with appropriate asset locks (e.g. CICs without share capital and Community Benefit Societies).', confidence: 'high', source_url: 'https://www.clothworkersfoundation.org.uk/apply-for-a-grant' },
        typical_award: { snippet: 'We do not fund projects of £15,000 or under for organisations with a turnover of more than £2 million.', confidence: 'high', source_url: 'https://www.clothworkersfoundation.org.uk/apply-for-a-grant' },
      },
    },
  } },

  // Previously published, hidden by a stale deadline; the programme is open.
  { idPrefix: 'f06351b9', label: 'Baily Thomas general and small grants', states: ['published'], source: UV, mergeBrief: true, fields: {
    is_active: true, deadline: '2026-12-31', is_rolling: true, amount_min: 250, amount_max: null,
    deadline_cycle: [
      { day: 31, month: 12, label: 'Deadline for the March meeting (grants over £5,000)' },
      { day: 31, month: 3, label: 'Deadline for the June meeting' },
      { day: 31, month: 8, label: 'Deadline for the November meeting' },
    ],
    funder_brief: { last_enriched: TODAY, open_status: 'open',
      typical_award: 'From £250. Appeals of £5,000 and under go through the Small Grant Programme, decided monthly by the Chair; appeals over £5,000 go to trustee meetings in March, June and November.',
      decision_timeline: 'Application window open. Grants over £5,000: apply by 31 December for the March 2027 meeting, 31 March for June, 31 August for November; late submissions roll to the next meeting. Small grants of £5,000 or less are considered monthly with no deadline. A further application is not normally considered for two years after a successful grant, or one year after an unsuccessful one.' },
  } },

  { idPrefix: 'b49ef70d', label: 'Sir Halley Stewart Trust', states: ['published'], source: UV, mergeBrief: true, fields: {
    is_active: true, deadline: '2026-10-23', is_rolling: false, amount_min: null, amount_max: 60000,
    deadline_cycle: [{ day: 23, month: 10, label: 'Closes for the February meeting, or earlier once capacity is reached' }],
    funder_brief: { last_enriched: TODAY, open_status: 'open',
      typical_award: 'Main grants £5,001 to £60,000 in total over one to three years, £30,000 a year maximum, usually a salary contribution or a whole project; up to £80,000 in rare cases. Small grants up to £5,000 for scoping or pilot projects, considered all year. About 25 to 30 grants a year, roughly one in ten applications.',
      decision_timeline: 'The round for the 8 October 2026 board has closed. The next round, for the 25 February 2027 board, is open and closes on 23 October 2026, or earlier without warning once the meeting reaches capacity. Small grants have no deadline.' },
  } },

  // Closed round, four a year with changing locations: between rounds, not archived.
  { idPrefix: 'cfb56fe7', label: 'Greggs Foundation Community Action Fund', states: ['published'], source: UV, mergeBrief: true, fields: {
    is_active: false, deadline: null, is_rolling: false, next_open_date: 'Next round to be announced; four rounds a year with changing eligible locations',
    amount_min: null, amount_max: 20000, location_tag: 'UK', is_local: false,
    description: 'Core funding of £20,000 a year for up to three years for not-for-profit organisations based in the Greggs Foundation\'s focus areas, which change each round and sit near Greggs Outlets or in areas of need, plus the North East of England. For tackling local needs: food and support, social isolation, community connections, health and wellbeing, knowledge and confidence. Currently closed; four rounds a year, locations announced on the website and social channels.',
    funder_brief: { last_enriched: TODAY, open_status: 'between_rounds',
      decision_timeline: 'Closed at present. Four funding rounds a year; eligible locations change each round and are published on the Foundation\'s website and social channels.',
      who_can_apply: 'Not-for-profit community organisations based in and delivering services in the locations listed for the current round, usually near a Greggs Outlet or in an area of social deprivation, and organisations in the North East of England.' },
  } },

  { idPrefix: '71fcd1d1', label: 'Youth Music Trailblazer Fund', states: ['published'], source: UV, fields: {
    is_active: false, next_open_date: '23 October 2026 (Round 14 opens)',
  } },

  // No unsolicited applications: staff identify awardees. Out of scope.
  { idPrefix: 'de5286bb', label: 'Peter Harrison Foundation Active Lives', states: ['published'], source: 'admin:paulkilty1@gmail.com', fields: {
    is_active: false, pipeline_state: 'rejected', is_invite_only: true,
    rejection_reason: formatRejectReason('out_of_scope', 'peterharrisonfoundation.org, read 9 Sept 2026: "We do not accept unsolicited applications, expressions of interest or funding requests." Awards go to organisations the Foundation identifies'),
  } },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  const { data: all } = await db.from('scraped_grants').select('id, title, pipeline_state, is_active, apply_url, funder_brief').limit(5000)
  for (const rv of REVIVES) {
    // Every revive target is inactive; narrow the fetch so a 5,000-row cap cannot hide it.
    const { data: cands } = await db.from('scraped_grants').select('id, title, pipeline_state, is_active, funder_brief').eq('is_active', false).in('pipeline_state', rv.states).limit(5000)
    const row = cands?.find(d => d.id.startsWith(rv.idPrefix))
    if (!row) { console.log(`  revive target not found: ${rv.label}`); continue }
    const fields = { ...rv.fields }
    if (rv.mergeBrief && fields.funder_brief) fields.funder_brief = { ...(row.funder_brief ?? {}), ...(fields.funder_brief as object) }
    console.log(`  revive ${rv.label} [${row.pipeline_state} active=${row.is_active}] -> ${String(fields.pipeline_state ?? (fields.is_active ? 'live' : 'hidden'))}`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: rv.source ?? UV, db, fields })
    const blocked = r.rejected.filter(x => x.reason !== 'idempotent')
    const { data: after } = await db.from('scraped_grants').select('pipeline_state, is_active').eq('id', row.id).single()
    console.log(`     applied ${r.applied.length} -> ${after?.pipeline_state} active=${after?.is_active}` + (blocked.length ? '  BLOCKED ' + blocked.map(x => `${x.field}:${x.reason}${x.blockedBy ? ' held by ' + x.blockedBy.source : ''}`).join(', ') : ''))
  }
  let staged = 0
  for (const { sector, ...row } of NEW) {
    const path = new URL(row.apply_url).pathname
    const dupe = all?.filter(d => (d.apply_url ?? '').includes(path) && new URL(d.apply_url ?? 'https://x').hostname.replace(/^www\./, '') === new URL(row.apply_url).hostname.replace(/^www\./, ''))
    if (dupe?.length) { console.log(`  already_held: ${row.title} -> ${dupe.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    console.log(`  stage [${sector}] ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
