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

type Row = Record<string, unknown> & { region: string; title: string; apply_url: string }

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
  for (const { region, ...row } of rows) {
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
