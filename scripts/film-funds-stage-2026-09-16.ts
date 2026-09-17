// Film and documentary funds, from a documentary maker's voice note to Paul
// (16 Sept 2026): "there's nowhere at the moment where I can access all that
// in one place" since Shooting People folded. Pages read by fetch, no model
// call. Three organisation-applicable, open funds staged hidden into review.
//
// Not staged, with the reason: Sundance Documentary Fund (individual
// filmmakers, closed until 2027); Science Sandbox (Simons Foundation, US
// nonprofits); BFI NETWORK and the Doc Society Talent Development Programme
// (individuals); BFI Short Form Animation, Future Takes, Climate Story Fund,
// BFI Doc Society Development, Made of Truth, Expanded Screen and RAD
// (closed, no reopening date). Doc Society's own fund is already carried.
//
//   npx tsx --env-file=.env.local scripts/film-funds-stage-2026-09-16.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:film-funds-2026-09-16'
const TODAY = '2026-09-16'
const DOC = 'https://bfi.docsociety.org/funds/features-production/'
const DEV = 'https://www.bfi.org.uk/get-funding-support/create-films-tv-or-new-formats-storytelling/development-funding'
const FMF = 'https://www.bfi.org.uk/get-funding-support/create-films-tv-or-new-formats-storytelling/bfi-filmmaking-fund-discovery-impact-feature-funding'
const STRUCTURES = ['ltd_shares', 'ltd_guarantee', 'cic_shares', 'cic_guarantee']
type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'BFI Doc Society Production Fund — Features', funder: 'Doc Society', funder_type: 'lottery',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: DOC, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: 150000, deadline: null, is_rolling: true,
    eligible_structures: STRUCTURES,
    impact_sectors: ['creative'], target_beneficiaries: ['general_public'], niche_tags: ['film_media'],
    description: 'Non-recoupable National Lottery grants of up to £150,000 from Doc Society, on behalf of the BFI, for the production and completion of independent non-fiction feature films by UK filmmakers: director-led documentary storytelling intended for theatrical release. Producers apply through a two-stage process, an expression of interest then a full application. Open on a rolling basis from 7 May 2026 until summer 2028.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Producers of independent non-fiction feature films made by UK filmmakers, applying through their production company. The page does not set out legal structure requirements beyond that.',
      what_they_fund: 'Production and completion of feature-length documentary films by UK filmmakers: director-led non-fiction storytelling intended for theatrical release.',
      typical_award: 'Non-recoupable grants of up to £150,000. The total Doc Society contribution to a project cannot exceed £150,000.',
      geographic_focus: 'UK.',
      decision_timeline: 'Rolling. Opened at 4pm on 7 May 2026 and closes in summer 2028. Two stages: an expression of interest, then a full application if eligible. No decision times stated.',
      how_to_apply: 'Online, in two stages: an expression of interest followed by a full application. Guidelines and forms are on the fund page.',
      _citations: {
        typical_award: { snippet: 'The total Doc Society contribution to your project cannot exceed £150,000', confidence: 'high', source_url: DOC },
        who_can_apply: { snippet: 'Producers can apply for non-recoupable grants of up to £150,000 for non-fiction feature films.', confidence: 'high', source_url: DOC },
        decision_timeline: { snippet: 'Opened at 4pm on May 7th 2026 Closes Summer 2028', confidence: 'high', source_url: DOC },
      } } },
  { title: 'BFI National Lottery Development Funding', funder: 'British Film Institute', funder_type: 'lottery',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: DEV, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: STRUCTURES,
    impact_sectors: ['creative'], target_beneficiaries: ['general_public'], niche_tags: ['film_media'],
    description: 'National Lottery development funding from the BFI for original live action and animated feature films, taking distinctive fiction projects from treatment to production-ready screenplay so they can reach production funding. Producers apply through their production company, which must be a limited company registered at Companies House. Open all year except an annual closure from 1 to 30 April. Award amounts are set out in the funding guidelines rather than on the page.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Producers, applying through their production company, which must be a limited company registered at Companies House. Full eligibility is in the funding guidelines.',
      what_they_fund: 'Development of original live action and animated feature films: distinctive fiction projects, from treatments to production-ready screenplays, to help them reach the production funding stage.',
      typical_award: 'Not stated on the page; amounts are in the funding guidelines.',
      geographic_focus: 'UK.',
      decision_timeline: 'Open all year round except an annual closure from 1 April to 30 April, with occasional further closures signposted in advance. Decision times are not stated.',
      how_to_apply: 'Read the funding guidelines, then apply online through the link in the guidelines.',
      _citations: {
        who_can_apply: { snippet: 'Producers can apply via their production company, which must be a limited company registered at Companies House.', confidence: 'high', source_url: DEV },
        decision_timeline: { snippet: 'Applications are open all year-round with the exception of an annual closure window from 1 April to 30 April.', confidence: 'high', source_url: DEV },
      } } },
  { title: 'BFI Filmmaking Fund — Discovery and Impact feature funding', funder: 'British Film Institute', funder_type: 'lottery',
    funding_type: 'grant', funding_subtypes: ['project'],
    apply_url: FMF, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: 1250000, deadline: null, is_rolling: true,
    next_open_date: '2026-11-12',
    eligible_structures: STRUCTURES,
    impact_sectors: ['creative'], target_beneficiaries: ['general_public'], niche_tags: ['film_media'],
    description: 'National Lottery production funding from the BFI for original live action and animated feature films, in two strands. Impact feature funding, awards of up to £1,250,000, is open on a rolling basis. Discovery feature funding, up to £1,000,000, runs in rounds: the next opens on 12 November 2026 and closes at 5pm on 16 December 2026. Producers apply through their production company at least 20 weeks before the proposed first day of principal photography.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Producers, applying through their production company. Residency and legal structure rules are in the funding guidelines rather than on the page.',
      what_they_fund: 'Original live action and animated feature filmmaking. Two strands: Discovery, for feature films at the discovery end of the slate, and Impact, for features with greater reach.',
      typical_award: 'Discovery: up to £1,000,000. Impact: up to £1,250,000.',
      geographic_focus: 'UK.',
      decision_timeline: 'Impact feature funding is open on a rolling basis. Discovery feature funding is closed until its next round, opening Thursday 12 November 2026 and closing at 5pm on Wednesday 16 December 2026. Apply at least 20 weeks before the proposed first day of principal photography.',
      how_to_apply: 'Online, from the funding guidelines page.',
      _citations: {
        typical_award: { snippet: 'Impact feature funding provides awards of up to £1,250,000', confidence: 'high', source_url: FMF },
        who_can_apply: { snippet: 'Producers can apply for the following', confidence: 'med', source_url: FMF },
        decision_timeline: { snippet: 'You must apply at least 20 weeks before your project\'s proposed first day of principal photography.', confidence: 'high', source_url: FMF },
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
    if (exact.length) { console.log(`  already_held, skipping: ${row.title} -> ${exact.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    const sameTitle = all.filter(d => d.title.toLowerCase().startsWith(row.title.toLowerCase().slice(0, 24)))
    if (sameTitle.length) { console.log(`  similar title held, skipping: ${row.title} -> ${sameTitle.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase())
    if (sameFunder.length) console.log(`  same funder held (${sameFunder.length}): ${row.title} -> ${sameFunder.slice(0, 4).map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`)
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
