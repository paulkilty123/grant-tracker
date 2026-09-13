// Dorset Community Foundation: an umbrella row (the CF convention, one row per
// foundation) and the Wessex Water Community Fund, which reopens 21 September
// and is the fund a Dorset launch-week signup (Bank of Dreams and Nightmares)
// could use. Staged on Paul's "go", 13 Sept 2026. Both pages fetched by node
// in this session; no model call. Rows land in Needs Review, inactive, and
// wait for Paul's publish word.
//
//   npx tsx --env-file=.env.local scripts/dorset-cf-stage-2026-09-13.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:dorset-cf-2026-09-13'
const TODAY = '2026-09-13'
const GROUPS = 'https://www.dorsetcommunityfoundation.org/apply-for-a-grant/grants-for-groups/'
const WESSEX = 'https://www.dorsetcommunityfoundation.org/funds/wessex-water-community-fund/'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string; pipeline_state?: string }
const NEW: Row[] = [
  { title: 'Dorset Community Foundation Grants', funder: 'Dorset Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'small_grant'],
    apply_url: GROUPS, url_status: 'unchecked',
    location_tag: 'Dorset', is_local: true, amount_min: 1000, amount_max: 5000, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'],
    impact_sectors: ['community'], target_beneficiaries: ['general_public'],
    description: 'Dorset Community Foundation awards grants, mostly of £1,000 to £5,000, to local voluntary and community organisations, charities and social enterprises based and working in Dorset. Funding programmes open and close through the year (Wessex Water Community Fund, Neighbourhood Fund, BCP Homelessness Prevention Fund, Community Wellbeing and Mental Health Fund among them) and most can support core costs. Not national charities, schools or statutory bodies. Decisions by a grants panel about six weeks after each closing date.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Dorset', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Local grassroots voluntary and community organisations, charities and social enterprises based and working in Dorset. Not national charities, schools or statutory bodies. Groups supporting diverse communities, including those facing discrimination, are welcomed.',
      what_they_fund: 'Services and activities that improve the lives of Dorset residents, through a rotating set of funding programmes. Most programmes can support core costs such as office overheads, insurance or admin, and a specific service or activity may include a contribution towards core costs.',
      typical_award: 'Most grants are between £1,000 and £5,000. Individual programmes set their own ceilings, from £2,000 to £30,000.',
      exclusions: 'National charities, schools and statutory bodies. Each programme carries its own further exclusions.',
      decision_timeline: 'Programmes open and close on their own dates through the year. Applications are assessed by the grants team and decided by a grants panel; outcomes are usually notified about six weeks after the closing date.',
      how_to_apply: 'Check the Grants for groups page for which programme is open, read its criteria and guidance, then apply online. Pre-application support is offered as a 20 minute call with the Grants Manager. Sign up to the Grant Alert email to hear when a programme opens.',
      funder_tips: 'Sign up to the Grant Alert email: programmes open for short windows and the alert is how the foundation announces them. Take the pre-application call if the group has not applied before.',
      _citations: {
        typical_award: { snippet: 'Most of the grants we award are between £1,000 – £5,000.', confidence: 'high', source_url: GROUPS },
        who_can_apply: { snippet: 'We support local grassroots organisations that are well-placed to identify and address local needs and who deliver services and activities that improve the lives of Dorset residents. We do not support national charities, schools or statutory bodies.', confidence: 'high', source_url: GROUPS },
        decision_timeline: { snippet: 'You should be notified of the outcome of your application around 6 weeks after the closing date unless stated otherwise.', confidence: 'high', source_url: GROUPS },
      } } },

  { title: 'Wessex Water Community Fund (Dorset)', funder: 'Dorset Community Foundation', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'small_grant'], pipeline_state: 'between_rounds_scheduled',
    apply_url: WESSEX, url_status: 'unchecked',
    location_tag: 'Dorset', is_local: true, amount_min: null, amount_max: 4000, deadline: '2026-10-19', is_rolling: false,
    next_open_date: 'The next round of this Fund will open on September 21, 2026',
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'],
    impact_sectors: ['community', 'financial'], target_beneficiaries: ['general_public', 'people_in_poverty', 'rural_communities'],
    description: 'Grants of up to £4,000 from the Wessex Water Foundation, through Dorset Community Foundation, for community groups, charities and CICs limited by guarantee based and working in Dorset or Ringwood for at least 12 months. Core, running, project and activity costs, for work that meets a local need in areas of deprivation or rural isolation, builds stronger communities or helps people manage debt. Priority to organisations with income under £500,000. Round opens 21 September 2026 and closes midday 19 October 2026; £70,000 to distribute, average grant £3,300, 37 per cent of applicants funded last round.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Dorset', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Registered charities, constituted community and voluntary organisations, CICs limited by guarantee (majority unpaid directors and a named asset lock body expected), companies limited by guarantee with a not-for-profit clause, and parish councils showing community benefit. Based and working in Dorset or Ringwood, running for at least 12 months with a track record and financial records, at least three unrelated people in charge, a constitution, a bank account with two unrelated signatories, and safeguarding and EDI policies. Priority to income under £500,000 on average over three years.',
      what_they_fund: 'Community-based activities or projects that meet a local need and improve the lives of local people most in need of support, new or continuing. Any reasonable cost: core or running costs, project and activity costs. Priority to work in areas of multiple deprivation or rural isolation, work that builds stronger communities, and work that helps people manage or avoid debt including take-up of utility affordability schemes.',
      typical_award: 'Up to £4,000. £70,000 to distribute in the autumn 2026 round; last round the average grant was £3,300 and 37 per cent of applicants were funded.',
      exclusions: 'National charities, including those with distinct Dorset services; groups that received other Wessex Water funding in the last 12 months; applying to more than one community foundation for this fund at once; organisations holding more than 12 months of expenditure in unrestricted reserves; promotion of religion or political causes; schools (PTAs may apply); statutory responsibilities; animal welfare; retrospective costs; general appeals and capital building projects; arts or sports projects with no significant community or charitable element; events; medical research, equipment or treatment; fundraising for other organisations; onward grants to individuals. Environmental projects go to the Wessex Water Environment Fund.',
      priorities: 'Areas of multiple deprivation or rural isolation where people lack local services; building stronger communities; helping people manage or avoid debt and build financial capability. Groups led by diverse and ethnically minoritised communities particularly welcome.',
      decision_timeline: 'The round opens 21 September 2026 and closes at midday on 19 October 2026. Decisions by a grants panel, usually notified about six weeks after the closing date. Funded activity must start within six months of the award, with up to 12 months to spend it.',
      how_to_apply: 'Online application from the fund page once the round opens, with a constitution (if not registered), a bank statement under three months old, latest annual accounts, and safeguarding and equality policies attached; CICs over a year old also send their CIC34 report. A 20 minute pre-application call with the Grants Manager is encouraged for first-time applicants.',
      funder_tips: 'The fund is targeted where a small grant makes a significant difference, so other funding and reserves are weighed. Trustees should know the application has gone in. Use the Wessex Water Foundation logo in publicity if funded.',
      _citations: {
        typical_award: { snippet: 'Grants of up to £4,000 are available.', confidence: 'high', source_url: WESSEX },
        who_can_apply: { snippet: 'Your group or organisation must be based and working in Dorset or Ringwood. Your group or organisation must have been running for at least 12 months', confidence: 'high', source_url: WESSEX },
        decision_timeline: { snippet: 'The next round of this Fund will open on September 21, 2026 and the deadline to apply will be midday on October 19, 2026.', confidence: 'high', source_url: WESSEX },
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
    if (sameFunder.length) console.log(`  same funder held (${sameFunder.length}): ${row.title} -> ${sameFunder.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`)
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
