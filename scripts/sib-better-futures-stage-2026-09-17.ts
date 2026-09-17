// Better Futures Fund, delivered by Social Investment Business for the UK
// government: the one fund on sibgroup.org.uk/funds not in the catalogue
// (Paul asked, 17 Sept 2026). Page read by fetch, no model call. Staged
// hidden into review; closes 23 September 2026, so it needs Paul's spot
// check this week or it is moot. The five archived "Better Futures" rows are
// earlier DCMS delivery-partner procurement notices, a different thing.
//
//   npx tsx --env-file=.env.local scripts/sib-better-futures-stage-2026-09-17.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:sib-better-futures-2026-09-17'
const TODAY = '2026-09-17'
const URL = 'https://www.sibgroup.org.uk/fund/better-futures-fund/'
type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'Better Futures Fund — Round 1 (Social Outcomes Partnerships)', funder: 'Social Investment Business', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['match_funding', 'outcomes'],
    apply_url: URL, url_status: 'unchecked',
    location_tag: 'England', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2026-09-23', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'local_authority'],
    impact_sectors: ['young_people', 'education', 'employment', 'community'], target_beneficiaries: ['children', 'young_people', 'families', 'people_in_poverty'],
    niche_tags: ['early_years', 'care_experienced', 'youth_employment'],
    description: 'Up to £37 million of UK government match funding, delivered by Social Investment Business, for Social Outcomes Partnerships that tackle the causes and impacts of child poverty in England: family support and preventing entry into care, early years development and school readiness, educational engagement and attainment, youth employment and skills, SEND support, youth justice and children\'s wellbeing. Open to purpose-led organisations and commissioners in the impact economy with a track record of delivering Social Outcomes Partnerships, so in practice consortia of charities, social enterprises, social investors and local commissioners rather than single small organisations. Round one closes at midnight on 23 September 2026; final awards are expected in the first quarter of 2027.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'England', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations that are part of the impact economy, including purpose-led organisations and commissioners, with a track record of delivering Social Outcomes Partnerships and a clear link to child poverty outcomes. England. In practice a partnership of delivery organisations, a social investor and a commissioner applies together; a single small charity without outcomes-contract experience is unlikely to qualify on its own.',
      what_they_fund: 'Outcomes-based partnerships that address the causes and impacts of child poverty: family support and preventing entry into care, early years development and school readiness, educational engagement and attainment, youth employment and skills development, SEND support, youth justice and children\'s wellbeing.',
      typical_award: 'No per-award figure stated. Round one provides up to £37 million of government match funding in total, matched against commissioner and investor contributions to each partnership.',
      geographic_focus: 'England.',
      decision_timeline: 'Applications are open until midnight on 23 September 2026. Final awards are announced in the first quarter of 2027.',
      how_to_apply: 'Online application form linked from the fund page (sibgroup.tfaforms.net), with an application guidance document to read first. SIB offers a callback to discuss fit.',
      _citations: {
        who_can_apply: { snippet: 'be part of the impact economy, including purpose-led organisations and commissioners; have a track record of delivering Social Outcomes Partnerships', confidence: 'high', source_url: URL },
        typical_award: { snippet: 'Round one will provide up to £37 million of government match funding towards the Better Futures Fund objectives', confidence: 'high', source_url: URL },
        decision_timeline: { snippet: 'Applications open until midnight on 23rd September 2026', confidence: 'high', source_url: URL },
        what_they_fund: { snippet: 'Family support and preventing entry into care; Early years development and school readiness; Educational engagement and attainment; Youth employment and skills development', confidence: 'high', source_url: URL },
      } } },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  type Held = { id: string; title: string; pipeline_state: string; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) { const { data, error } = await db.from('scraped_grants').select('id, title, pipeline_state, apply_url').range(from, from + 999); if (error) throw error; all.push(...(data as Held[])); if (!data || data.length < 1000) break }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  if (all.length !== count) throw new Error('partial read; refusing to dedup against part of the table')
  for (const row of NEW) {
    const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
    if (all.some(d => d.apply_url && norm(d.apply_url) === norm(row.apply_url))) { console.log('already held, skipping', row.title); continue }
    console.log('stage', row.title)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('   inserted', data.id)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
