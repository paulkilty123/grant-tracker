// Scotland brief, batch two (docs/handoffs/scotland-2026-09-11.md). Same
// session, same rules as batch one. Three rows; everything else in tier three
// and the island and border councils was closed, stale, invitation-only or
// already held, and is recorded in the results file.
//
//   npx tsx --env-file=.env.local scripts/scotland-stage-batch2-2026-09-11.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:scotland-2026-09-11'
const TODAY = '2026-09-11'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string; pipeline_state?: string }
const NEW: Row[] = [
  { title: 'Corra Racial Equity Fund', funder: 'Corra Foundation', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['core_costs', 'multi_year'],
    apply_url: 'https://www.corra.scot/grants/corra-racial-equity-fund/', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: null, amount_max: 50000, deadline: '2026-10-15', is_rolling: false, max_org_income: 250000,
    eligible_structures: ['registered_charity', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['community', 'justice'], target_beneficiaries: ['ethnic_minorities'],
    description: 'Unrestricted grants of up to £50,000 over five years (no more than £10,000 in any year) from the Corra Foundation for Scottish organisations led by, and working with, people from Black and racially minoritised backgrounds: at least 75% of the board and 50% of senior staff from those backgrounds, and income of £250,000 or less in each of the last three years. Registered charities, CICs, social enterprises and other registered not-for-profits. Deadline 12 noon Thursday 15 October 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations in Scotland led by and working with people from Black and racially minoritised backgrounds: 75% or more of the board or management committee and 50% or more of senior staff from those backgrounds. Registered charities, CICs, social enterprises or other registered not-for-profits with annual income of £250,000 or less in each of the last three financial years.',
      what_they_fund: 'Unrestricted funding for any aspect of the organisation\'s work that supports its community, including core costs.',
      typical_award: 'Up to £50,000 across five years, no more than £10,000 in any one year.',
      exclusions: 'Organisations not led by Black and racially minoritised people; income over £250,000 in any of the last three years; work outside Scotland.',
      decision_timeline: 'Deadline 12 noon Thursday 15 October 2026.',
      how_to_apply: 'Read the guidance, complete the online application form, and submit a bank statement no more than six months old and recent accounts. Pre-application conversations via cref@corra.scot.',
      _citations: {
        typical_award: { snippet: 'up to £50,000 across five years (no more than £10,000 in any one year)', confidence: 'high', source_url: 'https://www.corra.scot/grants/corra-racial-equity-fund/' },
        decision_timeline: { snippet: '12-noon on Thursday 15 October 2026', confidence: 'high', source_url: 'https://www.corra.scot/grants/corra-racial-equity-fund/' },
        who_can_apply: { snippet: 'annual income of £250,000 or less in each of the last three financial years', confidence: 'high', source_url: 'https://www.corra.scot/grants/corra-racial-equity-fund/' },
      } } },

  { title: 'Communities Mental Health and Wellbeing Fund, Dumfries and Galloway, Round Six', funder: 'Third Sector Dumfries and Galloway', funder_type: 'other',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://www.tsdg.org.uk/cmhwf/', url_status: 'unchecked',
    location_tag: 'Dumfries and Galloway', is_local: true, amount_min: null, amount_max: 10000, deadline: '2026-10-21', is_rolling: false, max_org_income: 1000000,
    next_open_date: 'Opens Monday 14 September 2026',
    eligible_structures: ['registered_charity', 'scio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee'],
    impact_sectors: ['mental_health', 'community'], target_beneficiaries: ['mental_health', 'people_in_poverty', 'general_public'],
    description: 'Round six of the Scottish Government\'s Communities Mental Health and Wellbeing Fund for adults in Dumfries and Galloway, run by Third Sector Dumfries and Galloway: £146,240 in small grants of up to £10,000 for organisations based in or already delivering support in the region with income up to £1 million. Priorities: social isolation and loneliness, suicide prevention, poverty and inequality, and people facing socio-economic disadvantage. Opens Monday 14 September and closes Wednesday 21 October 2026; projects run 1 April 2027 to 31 March 2028.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Dumfries and Galloway', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Organisations based in, or already delivering support services in, Dumfries and Galloway, with a maximum income of £1 million. One application per organisation; projects holding a round five multi-year award cannot apply.',
      what_they_fund: 'Adult mental health and wellbeing work addressing social isolation and loneliness, suicide prevention, poverty and inequality with an emphasis on the cost-of-living crisis, and support to people facing socio-economic disadvantage.',
      typical_award: 'Small grants up to £10,000 from a total of £146,240.',
      exclusions: 'Organisations with income over £1 million; current round five multi-year award holders; more than one application.',
      decision_timeline: 'Launches Monday 14 September 2026 and closes Wednesday 21 October 2026. Projects run 1 April 2027 to 31 March 2028.',
      how_to_apply: 'Details and the application on the Third Sector Dumfries and Galloway fund page from launch.',
      _citations: {
        decision_timeline: { snippet: 'The fund will launch on Monday 14th September and close on Wednesday 21st October.', confidence: 'high', source_url: 'https://www.tsdg.org.uk/cmhwf-26/' },
        typical_award: { snippet: 'a total of £146,240 will be available through small grants up to £10,000', confidence: 'high', source_url: 'https://www.tsdg.org.uk/cmhwf-26/' },
        who_can_apply: { snippet: 'based or already delivering support services in Dumfries and Galloway and with a maximum income of up to £1million', confidence: 'high', source_url: 'https://www.tsdg.org.uk/cmhwf-26/' },
      } } },

  { title: 'STV Children\'s Appeal Ignite Fund', funder: 'STV Children\'s Appeal', funder_type: 'trust',
    funding_type: 'grant', funding_subtypes: ['multi_year', 'core_costs'], pipeline_state: 'between_rounds_scheduled',
    apply_url: 'https://stvappeal.tv/get-involved/stv-childrens-appeal-ignite-fund/', url_status: 'unchecked',
    location_tag: 'Scotland', is_local: true, amount_min: 60000, amount_max: 100000, deadline: '2027-08-15', is_rolling: false,
    next_open_date: 'Outline forms are reviewed after 15 August each year; the next cycle closes 15 August 2027',
    eligible_structures: ['registered_charity', 'scio', 'cio'], impact_sectors: ['young_people', 'community'], target_beneficiaries: ['children', 'young_people', 'families', 'people_in_poverty'],
    description: 'Multi-year grants from the STV Children\'s Appeal Ignite Fund, typically £60,000 to £100,000 a year for three to five years, for registered charities, CIOs and SCIOs in Scotland working to break the cycle of child poverty. Organisations submit an outline form; those received by 15 August each year are reviewed and fewer than ten are invited to a full application. The 2026 cycle has closed; the next closes 15 August 2027.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'Scotland', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Organisations registered with the Scottish Charity Regulator or the Charity Commission, including charities, CIOs and SCIOs, whose work demonstrably reduces child poverty for disadvantaged children, young people and families in Scotland.',
      what_they_fund: 'Sustained financial and development support for programmes addressing child poverty, aligned with Scotland\'s child poverty delivery plan, with strong leadership, collaboration, user engagement and sustainability planning.',
      typical_award: 'Annual grants of £60,000 to £100,000, normally for three to five years.',
      exclusions: 'Unregistered organisations; work not focused on child poverty in Scotland.',
      decision_timeline: 'Outline forms received by 15 August each year are reviewed; by mid September applicants hear whether a full application is invited. Fewer than ten full applications are invited each year.',
      how_to_apply: 'Complete the outline form on the Ignite Fund page by 15 August.',
      _citations: {
        typical_award: { snippet: 'annual grants in the range of £60-100,000 are typical, normally for a period 3-5 years', confidence: 'high', source_url: 'https://stvappeal.tv/get-involved/stv-childrens-appeal-ignite-fund/' },
        decision_timeline: { snippet: 'those received by 15th August each year will be carefully reviewed', confidence: 'high', source_url: 'https://stvappeal.tv/get-involved/stv-childrens-appeal-ignite-fund/' },
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
    if (sameFunder.length) console.log(`  same funder held (${sameFunder.length}): ${row.title}`)
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
