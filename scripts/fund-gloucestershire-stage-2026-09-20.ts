// Fund Gloucestershire, from Paul (20 Sept 2026): "do we have this fund in
// the catalogue?" We had nothing from Gloucestershire at all. Both open funds
// on the Fund Gloucestershire platform, read by fetch, no model call, staged
// hidden into Needs Review.
//
//   npx tsx --env-file=.env.local scripts/fund-gloucestershire-stage-2026-09-20.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:fund-gloucestershire-2026-09-20'
const TODAY = '2026-09-20'
const CHW = 'https://www.fundglos.org.uk/for-applicants/funding-opportunities/community-health-and-wellbeing-fund/'
const TCG = 'https://www.fundglos.org.uk/for-applicants/funding-opportunities/thriving-communities-grant/'
const ALL_STRUCTURES = ['unincorporated', 'ltd_guarantee', 'cic_guarantee', 'cic_shares', 'cooperative', 'registered_charity', 'cio']
type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'Community Health and Wellbeing Fund 2027 (Gloucestershire)', funder: 'NHS Gloucestershire ICB', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['core', 'multi_year'],
    apply_url: CHW, url_status: 'unchecked',
    location_tag: 'Gloucestershire', is_local: true, amount_min: 10000, amount_max: 90000, deadline: '2026-11-23', is_rolling: false,
    eligible_structures: ALL_STRUCTURES,
    impact_sectors: ['health', 'community'], target_beneficiaries: ['general_public'],
    description: 'Multi-year core funding of £10,000 to £30,000 a year for up to three years from NHS Gloucestershire Integrated Care Board, run through the Fund Gloucestershire platform, for voluntary and community organisations, charities and CICs in Gloucestershire that act as community anchors and build the capacity to tackle health inequalities over the long term. Pays for staffing, leadership and organisational development, partnership working, volunteering and community organising, and running costs such as rent, utilities, insurance and transport. Not for capital works, and not open to organisations already receiving NHS Gloucestershire ICB funding. Applicants must have operated for at least a year and cannot ask for more than their annual turnover. Closes 23:59 on Monday 23 November 2026, decisions 8 January 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Gloucestershire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Voluntary and community organisations, registered charities, community interest companies and other not-for-profit groups based in Gloucestershire or with substantial delivery there. Must have operated for at least one year, and cannot apply for more than the organisation\'s annual turnover per year.',
      what_they_fund: 'Community capacity building that reduces health inequalities: organisational development and leadership, partnership working, volunteering and community organising, community engagement, workforce capacity, innovation, and the running costs behind them (staffing, rent, utilities, insurance, transport). Delivery of health and wellbeing activity is eligible, but the primary purpose is the capacity that makes it sustainable.',
      typical_award: '£10,000 to £30,000 a year for up to three years, so up to £90,000 in total, with annual review.',
      geographic_focus: 'Gloucestershire.',
      exclusions: 'Sole traders, statutory organisations, schools and academies, organisations already receiving NHS funding from NHS Gloucestershire ICB, and applicants outside England. The grant cannot pay for capital building works, planning works, consultancy that does not build lasting capacity, or VCSE infrastructure support. The fund is not a replacement for statutory commissioning.',
      priorities: 'Organisations and partnerships that act as community anchors, build social capital and strengthen the wider ecosystem that lets communities flourish. Sustainable, community-led approaches to health inequalities rather than one-off projects.',
      decision_timeline: 'Opened 14 September 2026. Closes 23:59 on Monday 23 November 2026. Funder decision 8 January 2027, offer acceptance by 22 January, grant agreements and payment 29 January 2027.',
      how_to_apply: 'Register an organisation profile on the Fund Gloucestershire platform and complete the online application. An applicant webinar runs on Monday 28 September 2026, 12:45 to 14:15, on Microsoft Teams.',
      _citations: {
        typical_award: { snippet: 'Grants of £10,000–£30,000 per year will be available for up to three years, with a stronger focus on core funding and investment that builds long-term community capacity.', confidence: 'high', source_url: CHW },
        who_can_apply: { snippet: 'Your organisation must have been operating for at least one year, and you cannot apply for more than your organisation\'s annual turnover per year.', confidence: 'high', source_url: CHW },
        exclusions: { snippet: 'organisations that are already receiving NHS funding from NHS Gloucestershire ICB applications from outside of England will not be considered. ... The grant cannot be used for: capital building works planning works consultancy costs where these do not directly build lasting community or organisational capacity VCSE infrastructure support.', confidence: 'high', source_url: CHW },
        decision_timeline: { snippet: 'Application closing date: 23:59 on Monday 23 November 2026 ... Funder decision date: 8 January 2027', confidence: 'high', source_url: CHW },
        priorities: { snippet: 'NHS Gloucestershire ICB want to invest in organisations and partnerships that act as community anchors, build social capital and strengthen the wider ecosystem that enables communities to flourish.', confidence: 'high', source_url: CHW },
      } } },
  { title: 'Thriving Communities Grant 2027 (Gloucestershire)', funder: 'Gloucestershire County Council', funder_type: 'local_authority',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: TCG, url_status: 'unchecked',
    location_tag: 'Gloucestershire', is_local: true, amount_min: 500, amount_max: 7500, deadline: '2026-10-16', is_rolling: false,
    eligible_structures: ALL_STRUCTURES,
    impact_sectors: ['health', 'community'], target_beneficiaries: ['general_public', 'older_people'],
    description: 'Grants of £500 to £7,500 from Gloucestershire County Council, run through the Fund Gloucestershire platform, for community and voluntary groups, charities, CICs, CIOs, co-operatives, faith groups and town and parish councils in Gloucestershire running projects that help adults stay well and live independently, and that build community connections, social networks and resilience. Pays for staffing, volunteer expenses, equipment, transport and core costs. Not for organisations whose work focuses on children and young people, and not for capital works, consultancy or vehicles. Closes 23:59 on Friday 16 October 2026, decisions 4 December 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Gloucestershire', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Community or voluntary groups, registered charities, CICs, CIOs, co-operative societies, unincorporated associations, arts, music, performance, nature and sports groups, faith-based groups with wider community benefit, and town and parish councils, all located in Gloucestershire.',
      what_they_fund: 'Projects that help adults stay well and live independently, and that develop community connections, social networks and resilience. Costs can include staffing, volunteer expenses, equipment, transport and core costs.',
      typical_award: 'A minimum of £500 up to £7,500.',
      geographic_focus: 'Gloucestershire.',
      exclusions: 'Organisations whose activities focus on children and young people, sole traders, for-profit organisations, schools and academies, statutory organisations other than town and parish councils, and organisations outside Gloucestershire. Will not fund capital building or planning works, consultancy costs or vehicles.',
      decision_timeline: 'Closes Friday 16 October 2026 at 23:59. Decisions on Friday 4 December 2026, with grants paid in January or February 2027 and an evaluation due by the end of January 2028.',
      how_to_apply: 'Register on the Fund Gloucestershire platform and complete the online application form.',
      _citations: {
        typical_award: { snippet: 'minimum of £500 up to £7,500', confidence: 'high', source_url: TCG },
        who_can_apply: { snippet: 'Community or voluntary groups; Registered charities; Community Interest Companies (CIC); Town and parish councils; Art, music, performance, nature-based and sports groups; Faith-based groups; Unincorporated associations; Charitable Incorporated Organisations (CIO); Co-operative societies', confidence: 'high', source_url: TCG },
        exclusions: { snippet: 'Organisations where activities focus on children and young people; Sole traders; Statutory organisations except for Town and Parish Councils; Schools and academies; Organisations located outside of Gloucestershire; For-profit organisations', confidence: 'high', source_url: TCG },
        decision_timeline: { snippet: 'Applications close: Friday 16 October 2026 at 23:59 ... Friday 4 December 2026', confidence: 'high', source_url: TCG },
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
  for (const row of NEW) {
    const exact = all.filter(d => d.apply_url && norm(d.apply_url) === norm(row.apply_url))
    if (exact.length) { console.log(`  already_held, skipping: ${row.title}`); continue }
    const sameTitle = all.filter(d => d.title.toLowerCase().startsWith(row.title.toLowerCase().slice(0, 24)))
    if (sameTitle.length) { console.log(`  similar title held, skipping: ${row.title} -> ${sameTitle.map(d => d.title).join('; ')}`); continue }
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
