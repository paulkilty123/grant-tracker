// Provider walk, tier three batch two (docs/handoffs/provider-walk-2026-09-08.md),
// run 10 Sept 2026 on Paul's "ok do that". The eleven programme-shaped
// providers: Microsoft, AWS, CAST, LawWorks, Charity Digital, Pro Bono
// Economics, NCVO, The Law Society, Pilotlight, Reach Volunteering, TechSoup.
// Every quote was fetched in this session by direct fetch; no model call.
// Reports for Paul are in the results file, batch 5. Nothing here changes
// is_active or pipeline_state on an existing row.
//
//   npx tsx --env-file=.env.local scripts/provider-walk-tier3-batch2-2026-09-10.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant, mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:provider-walk-2026-09-10'
const UV = 'user_verified:provider-walk-2026-09-10'
const TODAY = '2026-09-10'

type Relink = { idPrefix: string; label: string; fields: Record<string, unknown> }
const RELINKS: Relink[] = [
  { idPrefix: '171ceb65', label: 'AWS Nonprofit Credit Program -> its own page (was the nonprofits index)', fields: {
    apply_url: 'https://aws.amazon.com/government-education/nonprofits/nonprofit-credit-program/',
  } },
  { idPrefix: '38f3cae0', label: 'Pro Bono Economics Advisory -> analysis services page (was the services index)', fields: {
    apply_url: 'https://pbe.co.uk/our-services/our-analysis-services/',
  } },
]

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'CAST Design Hops', funder: 'CAST (Centre for Acceleration of Social Technology)', funder_type: 'other',
    funding_type: 'programme', funding_subtypes: ['training'],
    apply_url: 'https://www.wearecast.org.uk/our-work/programmes-and-initiatives/design-hops/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    impact_sectors: ['tech', 'social_innovation'], target_beneficiaries: ['general_public'],
    description: 'A free seven-week online training programme from CAST for staff and core volunteers of UK nonprofits of any size, teaching user-centred design as a way to solve a real service problem. Three live group sessions on Zoom over seven weeks, 10 to 15 hours of coursework, weekly tips and access to experts. Participants leave with a small solution or action plan. Cohorts run periodically; join the waiting list for the next one.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'between_rounds',
      who_can_apply: 'Staff and core volunteers of UK nonprofits of all sizes, with preference for decision-makers who can put the methods into practice. Not a grant: the offer is the programme.',
      what_they_fund: 'Seven weeks of user-centred design training applied to a challenge from your own organisation, with three live Zoom sessions, coursework, weekly tip emails and expert support.',
      typical_award: 'A free place on the programme. No cash award.',
      exclusions: 'Individuals not attached to a nonprofit.',
      decision_timeline: 'Cohorts run periodically; no dates are published. Join the waiting list to be told when the next Design Hop opens.',
      how_to_apply: 'Join the waiting list from the Design Hops page.',
      funder_tips: 'Come with one concrete service problem and the authority to change it; the programme is built around applying the method to your own work between sessions.',
      _citations: {
        what_they_fund: { snippet: 'A free seven-week online training programme', confidence: 'high', source_url: 'https://www.wearecast.org.uk/our-work/programmes-and-initiatives/design-hops/' },
        who_can_apply: { snippet: 'staff and core volunteers of UK nonprofits of all sizes', confidence: 'high', source_url: 'https://www.wearecast.org.uk/our-work/programmes-and-initiatives/design-hops/' },
        decision_timeline: { snippet: 'Join the waiting list for the next Design Hop', confidence: 'high', source_url: 'https://www.wearecast.org.uk/our-work/programmes-and-initiatives/design-hops/' },
      },
      _walk_note: 'No published cohort dates; the intake is a waiting list. Passes the bar on a named programme with something received and an organisation applying, but Paul may want a date before it goes live.',
    },
  },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  type Held = { id: string; title: string; funder: string | null; pipeline_state: string; is_active: boolean | null; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id, title, funder, pipeline_state, is_active, apply_url').range(from, from + 999)
    if (error) throw error
    all.push(...(data as Held[]))
    if (!data || data.length < 1000) break
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  console.log(`table read: ${all.length} rows (table has ${count})`)
  if (all.length !== count) throw new Error('partial read; refusing to dedup against part of the table')

  for (const rl of RELINKS) {
    const row = all.find(d => d.id.startsWith(rl.idPrefix))
    if (!row) { console.log(`  relink target not found: ${rl.label}`); continue }
    const collide = all.filter(d => d.id !== row.id && (d.apply_url ?? '').replace(/\/$/, '') === String(rl.fields.apply_url).replace(/\/$/, ''))
    if (collide.length) { console.log(`  COLLISION, not relinking: ${rl.label} -> ${collide.map(c => `${c.id.slice(0, 8)} ${c.title} [${c.pipeline_state}]`).join('; ')}`); continue }
    console.log(`  relink ${rl.label}\n     ${row.apply_url}\n  -> ${rl.fields.apply_url} [${row.pipeline_state} active=${row.is_active}]`)
    if (!APPLY) continue
    const r = await mergeGrantUpdate({ id: row.id, source: UV, db, fields: rl.fields })
    const blocked = r.rejected.filter(x => x.reason !== 'idempotent')
    const { data: after } = await db.from('scraped_grants').select('pipeline_state, is_active').eq('id', row.id).single()
    console.log(`     applied [${r.applied.join(',')}] -> ${after?.pipeline_state} active=${after?.is_active}` + (blocked.length ? '  BLOCKED ' + blocked.map(x => `${x.field}:${x.reason}`).join(', ') : ''))
  }

  let staged = 0
  for (const row of NEW) {
    const exact = all.filter(d => (d.apply_url ?? '').replace(/\/$/, '') === row.apply_url.replace(/\/$/, ''))
    if (exact.length) { console.log(`  already_held, skipping: ${row.title} -> ${exact.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}; relinks ${RELINKS.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
