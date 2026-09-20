// Wembley Stadium Foundation, from Paul's review of the Liverpool card
// (20 Sept 2026): "this is not open yet, but the foundation has a number of
// funds worth keeping an eye on, one open now".
//
// Read by fetch, no model call. The foundation's funding page lists four:
//   Communities Fund      "Opening 2026", delivered by city partners. Not open.
//                         The Liverpool row's £5,000 and 2 October came from
//                         the 11 Sept digest, and neither figure is on any
//                         foundation page or on Everton in the Community's site.
//   Targeted Fund         OPEN. EOI closes 5pm 11 Oct 2026. Staged here.
//   Brent Place-Based     Delivered by Brent Council as Love Where You Live;
//                         not a fund an org applies to the foundation for.
//   Football Kit Giveaway Closed (26 June), kit not money. Out of scope.
//
//   npx tsx --env-file=.env.local scripts/wembley-stadium-foundation-2026-09-20.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, stampNewGrant } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:wembley-stadium-foundation-2026-09-20'
const TODAY = '2026-09-20'
const LIVERPOOL_ID = '9f167f31-8a0c-438a-84ee-9ccf97e68e34'
const TF = 'https://www.wembleystadiumfoundation.org/grant/apply-for-our-targeted-fund/'

const NEW = {
  title: 'Wembley Stadium Foundation Targeted Fund', funder: 'Wembley Stadium Foundation', funder_type: 'trust_foundation',
  funding_type: 'grant', funding_subtypes: ['project'],
  apply_url: TF, url_status: 'unchecked',
  location_tag: 'England', is_local: false, amount_min: null, amount_max: 50000, deadline: '2026-10-11', is_rolling: false,
  eligible_structures: ['registered_charity', 'cio'],
  min_org_income: 100000, max_org_income: 1000000,
  impact_sectors: ['sport', 'creative'],
  target_beneficiaries: ['children', 'young_people', 'disabled_people', 'women_girls', 'ethnic_minorities'],
  niche_tags: ['disability_sport', 'women_in_sport'],
  description: 'Multi-year project grants of up to £25,000 a year for up to two years, £50,000 in total, from the Wembley Stadium Foundation for registered charities in England with an annual income between £100,000 and £1 million. Funds targeted projects that increase access to sport, movement and the performing arts for children and young people up to 25 who face a barrier to taking part, such as disability, gender, race or socio-economic disadvantage. This round prefers work outside London, Birmingham, Newcastle, Manchester and Liverpool, delivered in community settings. Full cost recovery. Two stages: an expression of interest closing at 5pm on 11 October 2026, then invited full applications in November. Grant period December 2026 to July 2028.',
  funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'England', last_enriched: TODAY, open_status: 'open',
    who_can_apply: 'Registered charities delivering projects that engage children and young people in England, with an annual income between £100,000 and £1 million in the most recent accounting year.',
    what_they_fund: 'Targeted projects that increase access to sport, movement and the performing arts for children and young people up to age 25 facing a specific barrier to participation, including disability, gender, race or socio-economic disadvantage. Full cost recovery, and part funding of a larger project is welcome.',
    typical_award: 'Project grants of up to £25,000 a year for up to two years. Maximum grant value £50,000. The grant period for this round runs December 2026 to July 2028, with a shorter first year.',
    geographic_focus: 'England. This round is particularly keen on projects delivered outside London, Birmingham, Newcastle, Manchester and Liverpool, where the foundation funds separately through its Communities Fund partners.',
    priorities: 'Targeted interventions for young people facing a specific barrier to participation. Projects outside the five Communities Fund cities. Community settings rather than mainstream education. Organisations with a strong track record, a collaborative approach and delivery shaped by young people\'s voices and lived experience. Potential to strengthen the organisation\'s capacity beyond the project. None of these are prerequisites.',
    decision_timeline: 'Stage one expression of interest closes at 5pm on 11 October 2026, with decisions communicated in late October 2026. Shortlisted organisations are invited to a stage two full application in November 2026, preceded by a meeting with the foundation team.',
    how_to_apply: 'Submit an expression of interest through the Microsoft Forms link on the fund page after reading the eligibility and guidelines. Stage one asks only for what is needed to judge eligibility and strategic fit; no individual feedback is given at that stage.',
    strong_application: 'A concise expression of interest that shows how the project meets the eligibility criteria, the outcomes and this round\'s priorities, budgeted realistically for the full cost of delivery.',
    exclusions: 'Organisations that are not registered charities, or whose most recent annual income falls outside £100,000 to £1 million. Projects outside England. The page publishes no other exclusion list.',
    _citations: {
      who_can_apply: { snippet: 'Be a registered charity. Have had an annual income between £100,000 and £1 million in the most recent accounting year.', confidence: 'high', source_url: TF },
      typical_award: { snippet: 'Project grants of up to £25,000 per year for up to two years. Maximum grant value of £50,000.', confidence: 'high', source_url: TF },
      decision_timeline: { snippet: 'Stage one – Expression of interest currently open ... 5pm on 11th October 2026 ... Decisions will be communicated in late October 2026.', confidence: 'high', source_url: TF },
      what_they_fund: { snippet: 'Multi-year project funding for organisations delivering targeted projects that increase access to sport, movement and the performing arts for children and young people across England. ... We support projects for those up to age 25.', confidence: 'high', source_url: TF },
      geographic_focus: { snippet: 'Projects delivered outside of London, Birmingham, Newcastle, Manchester & Liverpool.', confidence: 'high', source_url: TF },
      exclusions: { snippet: 'Be a registered charity. Have had an annual income between £100,000 and £1 million', confidence: 'med', source_url: TF },
    } },
}

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')

  // 1. The Liverpool row: out of view, funder watched, and the two digest
  //    figures the page does not carry come off so a reopening does not
  //    resurface them as fact.
  const { data: lp, error: e1 } = await db.from('scraped_grants').select('id,title,pipeline_state,is_active,deadline,amount_max,next_open_date').eq('id', LIVERPOOL_ID).single()
  if (e1 || !lp) throw e1 ?? new Error('Liverpool row missing')
  console.log('liverpool before', lp)
  if (APPLY) {
    const r = await mergeGrantUpdate({ db, id: LIVERPOOL_ID, source: SRC, fields: {
      is_active: false, pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Later in 2026, via Everton in the Community',
      deadline: null, amount_max: null,
    } })
    console.log('liverpool merge', r)
    if (r.rejected.length) throw new Error('refused: ' + JSON.stringify(r.rejected))
    const { data: after } = await db.from('scraped_grants').select('pipeline_state,is_active,deadline,amount_max,next_open_date').eq('id', LIVERPOOL_ID).single()
    console.log('liverpool after', after)
  }

  // 2. Dedup against the whole table, then stage the Targeted Fund.
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
  const exact = all.filter(d => d.apply_url && norm(d.apply_url) === norm(NEW.apply_url))
  if (exact.length) { console.log('already_held: ' + exact.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')); return }
  const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === NEW.funder.toLowerCase())
  console.log(`same funder held (${sameFunder.length}): ${sameFunder.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`)
  const sameTitle = all.filter(d => d.title.toLowerCase().includes('targeted fund') && (d.funder ?? '').toLowerCase().includes('wembley'))
  if (sameTitle.length) { console.log('similar title held, skipping'); return }
  console.log(`stage ${NEW.title}`)
  if (!APPLY) return
  const stamped = { ...stampNewGrant({ ...NEW, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
  const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
  if (error) throw error
  console.log('inserted', data.id)
}
main().catch(e => { console.error(e); process.exit(1) })
