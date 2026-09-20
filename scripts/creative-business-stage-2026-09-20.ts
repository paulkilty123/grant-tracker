// Two actions from a cheap web pass on 20 Sept 2026, commissioned by Paul
// after Rodger Grant's (Redhill Fields Open Air Events Ltd) reply. No model
// call; pages read by fetch and web search.
//
//   1. Arts Council National Lottery Project Grants (live, 8c8418fe) was
//      tagged charities and CICs only. Arts Council's guidance: eligible
//      organisations include "a charity, a limited company or an
//      unincorporated group" with a UK registered office and a bank account
//      in the organisation's name. Tags widened so a limited company sees it.
//   2. Hospitality Support Fund round 1 (Department for Business and Trade)
//      staged hidden for review. Open 1 Sept to 13 Oct 2026, projects of
//      £100,000 or more, 50 to 60% of costs, SMEs as delivery partners.
//
//   npx tsx --env-file=.env.local scripts/creative-business-stage-2026-09-20.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant, mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:creative-business-2026-09-20'
const TODAY = '2026-09-20'
const ACE_ID = '8c8418fe-9b52-4ba8-bac7-0bc4732c96e4'
const HSF_URL = 'https://www.gov.uk/government/news/10-million-hospitality-grant-scheme-launches-in-boost-for-independent-pubs-restaurants-and-cafes'
const HSF_APPLY = 'https://grants.businessandtrade.gov.uk/startapplication.aspx?id=17518'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'Hospitality Support Fund — Round 1', funder: 'Department for Business and Trade', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['project', 'capital'],
    apply_url: HSF_APPLY, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2026-10-13', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative'],
    impact_sectors: ['employment', 'community', 'social_economy'], target_beneficiaries: ['general_public', 'young_people'],
    niche_tags: ['hospitality', 'high_street'],
    description: 'Round one of the Department for Business and Trade\'s Hospitality Support Fund, a £10 million three-year grant scheme for projects that get new hospitality ventures off the ground, bring vacant premises back into use, or run training that opens doors to hospitality careers. Open to charities, social enterprises, not-for-profits, SMEs acting as delivery partners, local authorities and consortia with a single accountable lead. Projects should be worth £100,000 or more, delivery-ready, and complete within the 2026/27 financial year; the fund covers 50 to 60 per cent of costs, paid in arrears, with match-funded projects prioritised. Applications opened 1 September 2026 and close 13 October 2026. £3 million is earmarked separately for Pub is The Hub.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Charities, social enterprises, not-for-profit organisations, SMEs acting as delivery partners, local authorities, public bodies, and consortia led by a single accountable organisation. Projects should have a minimum total value of £100,000, though smaller projects may be considered in exceptional circumstances.',
      what_they_fund: 'Delivery-ready projects in the hospitality sector that support employment access and skills development, business resilience, high street regeneration, evening economy growth, sustainability improvements, productivity and innovation, and the creation of new hospitality enterprises. Round one is for projects that can mobilise quickly and spend within the 2026/27 financial year.',
      typical_award: 'No per-project figure stated. The fund covers 50 to 60 per cent of project costs, assessed case by case, on projects of £100,000 or more; payments are made in arrears against eligible expenditure.',
      exclusions: 'Projects that cannot complete funded activity within the 2026/27 financial year. Retrospective costs are not funded. The £3 million Pub is The Hub allocation is separate.',
      priorities: 'Match-funded, delivery-ready projects with clear plans and realistic milestones.',
      geographic_focus: 'UK.',
      decision_timeline: 'Applications opened 1 September 2026 and close 13 October 2026. Activity must complete within the 2026/27 financial year; decision timing is not stated.',
      how_to_apply: 'Register and apply through the Department for Business and Trade grants portal (grants.businessandtrade.gov.uk, application id 17518). Guidance is linked from the GOV.UK press release.',
      _citations: {
        who_can_apply: { snippet: 'Charities, social enterprises, not-for-profit organisations, SMEs acting as delivery partners, local authorities, public bodies, and consortia led by a single accountable organisation', confidence: 'high', source_url: 'https://fcsassociates.co.uk/grants/hospitality-grant-scheme/' },
        typical_award: { snippet: '50% to 60% of project costs, assessed on a case-by-case basis', confidence: 'med', source_url: 'https://fcsassociates.co.uk/grants/hospitality-grant-scheme/' },
        decision_timeline: { snippet: 'Applications opened on 1 September 2026 and close on 13 October 2026.', confidence: 'med', source_url: 'https://fcsassociates.co.uk/grants/hospitality-grant-scheme/' },
        what_they_fund: { snippet: 'help get new hospitality ventures off the ground, bring vacant premises back into use, or support training programmes', confidence: 'high', source_url: HSF_URL },
      } } },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  // 1. Arts Council tag fix.
  const { data: ace } = await db.from('scraped_grants').select('title, eligible_structures, is_active').eq('id', ACE_ID).maybeSingle()
  console.log('ACE before:', ace?.title, JSON.stringify(ace?.eligible_structures), 'live', ace?.is_active)
  if (APPLY) {
    const r = await mergeGrantUpdate({ id: ACE_ID, fields: {
      eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative', 'unincorporated'],
    }, source: 'user_verified:paul-2026-09-20', pinned: false, db })
    console.log('ACE applied', JSON.stringify(r.applied), 'rejected', JSON.stringify(r.rejected.filter(x => x.reason !== 'idempotent')))
  }
  // 2. Stage HSF.
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
  for (const row of NEW) {
    const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    const exact = all.filter(d => d.apply_url && norm(d.apply_url) === norm(row.apply_url))
    if (exact.length) { console.log(`  already_held, skipping: ${row.title}`); continue }
    const sameTitle = all.filter(d => d.title.toLowerCase().includes('hospitality'))
    if (sameTitle.length) { console.log(`  hospitality rows held: ${sameTitle.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`) }
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })
