// Paul, 21 Sept 2026: "add this fund" (FID call for proposals) and "do we have
// Wise Music Foundation?" We did: published, then deactivated when its 31 Aug
// cut-off passed, with no cycle to roll it forward. The apply page names four
// cut-offs a year, so the cycle lands and the row comes back live for the
// 30 November one. FID is staged new. Read by fetch, no model call.
//
//   npx tsx --env-file=.env.local scripts/fid-and-wise-music-2026-09-21.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:paul-2026-09-21'
const TODAY = '2026-09-21'
const WISE = '31807e92-d843-484f-bd73-f6524af16e99'
const FID = 'https://fundinnovation.dev/en/launch-project'
const NEW = {
  title: 'Fund for Innovation in Development (FID) Call for Proposals', funder: 'Fund for Innovation in Development', funder_type: 'government',
  funding_type: 'grant', funding_subtypes: ['project'],
  apply_url: FID, url_status: 'unchecked',
  location_tag: 'International', is_local: false, amount_min: 42000, amount_max: 3400000, deadline: null, is_rolling: true,
  eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative', 'unincorporated'],
  impact_sectors: ['international', 'health', 'education', 'environment', 'social_innovation'], target_beneficiaries: ['people_in_poverty'],
  description: 'A continuously open call from the Fund for Innovation in Development, hosted by the French development agency AFD, for organisations testing and scaling innovations that reduce poverty and inequality. Five grant types by stage: Prepare up to €50,000, Pilot up to €200,000, Transforming Public Policy up to €150,000, Scale up to €1.5 million and Transition to Scale up to €4 million (roughly £42,000 to £3.4 million). Any organisation or consortium can apply, including UK charities and social enterprises, but the project must be located in a low or middle income country on the OECD DAC list, excluding Burkina Faso, Mali and Niger. Individuals and international organisations cannot apply. Priority for education, health, climate and gender equality. Apply through the FID online portal at any time.',
  funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'International', last_enriched: TODAY, open_status: 'open',
    who_can_apply: 'Organisations and collectives of any type, applying alone or as a consortium, including UK charities and social enterprises. The project must be located in a low or middle income country on the OECD DAC list. Individuals and international organisations cannot apply.',
    what_they_fund: 'Innovations with the potential to reduce poverty and inequality, at any stage: prototyping or piloting an idea, rigorous impact evaluation, a first scale-up, or deployment through public entities. Open to any field, with priority for education, health, climate and gender equality.',
    typical_award: 'Prepare grants up to €50,000; Pilot up to €200,000; Transforming Public Policy up to €150,000; Scale up to €1.5 million; Transition to Scale up to €4 million. Sterling figures on the card are approximate conversions.',
    geographic_focus: 'Projects in low and middle income countries on the OECD DAC list, excluding Burkina Faso, Mali and Niger. The applicant can be based anywhere.',
    exclusions: 'Individual applicants. International organisations. Projects located outside DAC-listed low and middle income countries, or in Burkina Faso, Mali or Niger.',
    decision_timeline: 'The call is open all year. Applications are assessed on a rolling basis.',
    how_to_apply: 'Through the FID online portal (fundinnovation.wiin.io) using the standard form, the decision tree tool and the budget template FID provides.',
    _citations: {
      decision_timeline: { snippet: 'FID maintains a continuously open call for projects, welcoming a wide range of actors, with no sectoral restrictions.', confidence: 'high', source_url: FID },
      exclusions: { snippet: 'Individual applications or those submitted by international organizations are not eligible.', confidence: 'high', source_url: FID },
      geographic_focus: { snippet: 'Projects must be located in a low- or middle-income country according to the OECD DAC list', confidence: 'high', source_url: FID },
      typical_award: { snippet: 'Prepare Grants (up to €50 thousand), Pilot Grants (up to €200 thousand), Scale Grants (up to €1,5 million), Transition to Scale Grants (up to €4 million), and Transforming Public Policy Grants (up to €150 thousand)', confidence: 'med', source_url: 'https://fundinnovation.dev/en' },
    } },
}
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  // Wise Music: the page's four cut-offs, next one 30 November, back live.
  const { data: w } = await db.from('scraped_grants').select('title,is_active,pipeline_state,deadline,deadline_cycle').eq('id', WISE).single()
  console.log('wise before', w)
  if (APPLY) {
    const r = await mergeGrantUpdate({ db, id: WISE, source: SRC, fields: {
      deadline_cycle: [{ day: 28, month: 2, label: 'End of February, reviewed in March' }, { day: 31, month: 5, label: 'End of May, reviewed in June' }, { day: 31, month: 8, label: 'End of August, reviewed in September' }, { day: 30, month: 11, label: 'End of November, reviewed in December' }],
      deadline: '2026-11-30', is_rolling: false, next_open_date: null, is_active: true, pipeline_state: 'published',
      max_org_income: 500000,
    } })
    console.log('wise merge', JSON.stringify(r))
    const { data: after } = await db.from('scraped_grants').select('is_active,pipeline_state,deadline,last_published_at').eq('id', WISE).single()
    console.log('wise after', after)
  }
  // FID: dedup then stage.
  type Held = { id: string; title: string; pipeline_state: string; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id, title, pipeline_state, apply_url').range(from, from + 999)
    if (error) throw error
    all.push(...(data as Held[])); if (!data || data.length < 1000) break
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  if (all.length !== count) throw new Error('partial read')
  const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const dup = all.filter(d => (d.apply_url && norm(d.apply_url).startsWith('fundinnovation.dev')) || /innovation in development/i.test(d.title))
  if (dup.length) { console.log('already held:', dup.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')); return }
  console.log(`stage ${NEW.title} (table ${all.length})`)
  if (!APPLY) return
  const stamped = { ...stampNewGrant({ ...NEW, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
  const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
  if (error) throw error
  console.log('inserted', data.id)
}
main().catch(e => { console.error(e); process.exit(1) })
