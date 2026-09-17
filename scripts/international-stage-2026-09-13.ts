// International development, first row: the Jephcott Charitable Trust, on
// Paul's "put an international development batch" (13 Sept 2026), after
// Our Sansar (Brighton, street children in Nepal) cleared the match floor on
// two funders, both wrong. The rest of the batch needs a browser: see
// docs/handoffs/international-development-2026-09-13.md. Pages fetched
// directly; no model call. Lands hidden in Needs reading.
//
//   npx tsx --env-file=.env.local scripts/international-stage-2026-09-13.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:international-2026-09-13'
const TODAY = '2026-09-13'
const APPLY_URL = 'https://www.jephcottcharitabletrust.org.uk/apply'
const WHAT_URL = 'https://www.jephcottcharitabletrust.org.uk/what-we-do'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string; pipeline_state?: string }
const NEW: Row[] = [
  { title: 'Jephcott Charitable Trust Grants', funder: 'Jephcott Charitable Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['capital', 'restricted'],
    apply_url: APPLY_URL, url_status: 'unchecked',
    location_tag: 'UK & Global', is_local: false, amount_min: null, amount_max: null, deadline: null, is_rolling: true,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'unincorporated', 'ltd_guarantee'],
    impact_sectors: ['international', 'health', 'education', 'environment'],
    target_beneficiaries: ['general_public', 'women_girls', 'children'],
    niche_tags: ['development_aid', 'girls_empowerment'],
    description: 'Grants from the Jephcott Charitable Trust to UK registered charities and properly constituted organisations working anywhere in the world, for capital projects in health, education and the environment: equipment, materials, buildings, solar panels, clean water and WASH facilities, clinics and health posts, school building, vocational and health training, family planning and menstrual health. Not running costs, salaries or admin. Priority to work in emerging and developing economies and to female educational opportunity, and to charities that find it hard to get started or to raise funds elsewhere. Applications by post at any time; trustees meet in April and October.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK & Global', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK registered charities and properly constituted organisations whose constitution allows the work, working in any part of the world. The work must not have already taken place and must benefit a community, village, area or large number of people. Not individuals, expedition groups, large national charity appeals, or organisations with excessive administration costs or reserves.',
      what_they_fund: 'Capital projects that make a tangible, long-term difference in health, education and the environment: equipment, materials, construction of buildings, solar panels, safe clean water and WASH facilities, clinics and mobile health posts, generators, school building and renovation, vocational and IT skills training, health and hygiene training, family planning and menstrual health awareness. Pump-priming for charities or projects that have difficulty getting started or raising funds elsewhere.',
      typical_award: 'Not stated on the site. Read the guidelines document before applying.',
      exclusions: 'Running costs including salaries, administration, marketing and travel; heritage or preservation; projects solely about animal welfare or relief of poverty; general appeals by large national charities; individuals and expedition groups; promotion of religion; work already carried out.',
      priorities: 'Emerging and developing economies, female educational opportunity, and projects with a significant, sustainable benefit to a large number of people. Trustees weigh whether outcomes can be evaluated, whether NGOs or local government are involved, sustainability, and how hard the charity has worked to help itself.',
      geographic_focus: 'UK charities working in all parts of the world; recent grants span Nepal, Kenya, Malawi, Ghana, Ethiopia, Cambodia, Mongolia, Peru, India and the UK.',
      decision_timeline: 'Applications are accepted at any time by post and acknowledged within a few weeks. Trustees meet twice a year, in April and October, and applicants hear shortly after. Many eligible applications are not funded.',
      how_to_apply: 'Download the guidelines and application form from the Apply page, complete it and post it to the Secretary with the supporting documents listed. A trustee may contact the charity for more information before a meeting.',
      funder_tips: 'Post, not email. Show how the project will be evaluated, who the local partners are, and what the charity has raised itself; trustees look at the share of funds spent on salaries and administration.',
      strong_application: 'A small UK charity with a capital project overseas, a local partner, a clear evaluation plan and evidence of its own fundraising effort: a clinic, a water system, a school building or training equipment in a developing economy.',
      _citations: {
        who_can_apply: { snippet: 'You can apply if: You are a registered charity or properly constituted organisation.', confidence: 'high', source_url: APPLY_URL },
        what_they_fund: { snippet: 'This often means that the Trust is funding capital projects, for example for equipment, materials, the construction of buildings and solar panels, and the supply of safe, clean water.', confidence: 'high', source_url: WHAT_URL },
        decision_timeline: { snippet: 'Trustees meetings are held twice a year in April and October.', confidence: 'high', source_url: APPLY_URL },
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
    const host = (u: string) => norm(u).split('/')[0]
    const same = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase() || (d.apply_url && host(d.apply_url) === host(row.apply_url)))
    if (same.length) { console.log(`  already_held, skipping: ${row.title} -> ${same.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const { pipeline_state: _ps, ...fields } = row
    const stamped = { ...stampNewGrant({ ...fields, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
