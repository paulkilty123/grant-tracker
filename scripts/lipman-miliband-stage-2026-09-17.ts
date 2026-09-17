// Lipman-Miliband Trust small grants, from a newsletter link Paul sent on
// 17 Sept 2026. Pages read by fetch, no model call. One row staged hidden
// into review: the small grants round, open until 30 September 2026. The
// large grants programme (up to £30,000 over three years, income £5k to
// £500k) is closed with its criteria under review and "Autumn 2026" as the
// only reopening date, so it is described in the brief rather than staged.
//
//   npx tsx --env-file=.env.local scripts/lipman-miliband-stage-2026-09-17.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:lipman-miliband-2026-09-17'
const TODAY = '2026-09-17'
const URL = 'https://www.lipman-miliband.org.uk/grants/small-grants.html'
type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'Lipman-Miliband Trust — Small Grants', funder: 'Lipman-Miliband Trust', funder_type: 'trust_foundation',
    funding_type: 'grant', funding_subtypes: ['project', 'small_grant'],
    apply_url: URL, url_status: 'unchecked',
    location_tag: 'UK & Ireland', is_local: false, amount_min: null, amount_max: 3000, deadline: '2026-09-30', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'scio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative', 'unincorporated', 'not_registered', 'sole_trader', 'individual'],
    impact_sectors: ['justice', 'education', 'community'], target_beneficiaries: ['general_public'],
    niche_tags: ['campaigning', 'democracy'],
    description: 'Grants of up to £3,000 from the Lipman-Miliband Trust for study, research and educational work on socialist ideas and practice and allied fields, and activities that raise public awareness of struggles and movements for peace, human rights, co-operation and a more equal, diverse, cooperative and democratic society. In this round the Trust is particularly keen to support work that addresses the rise of fascism. Open to organisations of any structure except universities, and to individuals, based in the UK (or in the Republic of Ireland with impact in Northern Ireland or the UK). Funds entire projects or parts of bigger ones. Current round closes 11.59pm on 30 September 2026. A separate large grants programme, up to £30,000 over three years for organisations with income between £5,000 and £500,000, is closed and reopens in autumn 2026.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK & Ireland', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Organisations of any structure apart from universities: charities, community interest companies, limited companies, unincorporated associations and grassroots groups. Individuals too. All applicants must be based in the UK with a UK bank account; organisations and individuals in the Republic of Ireland are eligible where some of the work takes place in, or aims to create impact in, Northern Ireland or the UK. Faith-based work is eligible if open to all and not promoting or recruiting to a faith.',
      what_they_fund: 'Study and research into socialist ideas and practice and allied fields and the dissemination of the results to the public, and educational activities that raise public awareness and understanding of struggles and movements for peace, human rights and co-operation and a more equal, diverse, cooperative and democratic society. Entire projects or small parts of bigger projects. In this round, work addressing the rise of fascism is a particular interest.',
      typical_award: 'Any amount up to and including £3,000.',
      exclusions: 'Organisations or individuals based outside the UK (except the Republic of Ireland exception above); universities and academic institutions, and projects whose primary purpose or impact is within academia; anyone who has received a grant from the Trust in the last two years; work aimed at promoting or recruiting people to a particular faith.',
      priorities: 'Work that addresses the rise of fascism, in this round.',
      geographic_focus: 'UK, with the Republic of Ireland eligible where the work has impact in Northern Ireland or the UK.',
      decision_timeline: 'The current round closes at 11.59pm on Wednesday 30 September 2026. Decision timing is not stated.',
      how_to_apply: 'Online application form linked from the small grants page, with guidelines on the same page.',
      _citations: {
        typical_award: { snippet: 'You can apply for any amount up to and including £3,000.', confidence: 'high', source_url: URL },
        who_can_apply: { snippet: 'Organisations of any structure, apart from universities (e.g. charity, community interest company, limited company, unincorporated association, grassroots groups etc.). Individuals.', confidence: 'high', source_url: URL },
        decision_timeline: { snippet: 'This programme is currently open. The application deadline is 11.59pm on Wednesday 30th September.', confidence: 'high', source_url: URL },
        exclusions: { snippet: 'Organisations or individuals who have received a grant from the Trust in the last two years.', confidence: 'high', source_url: URL },
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
    if (exact.length) { console.log(`  already_held, skipping: ${row.title}`); continue }
    const sameFunder = all.filter(d => (d.funder ?? '').toLowerCase() === row.funder.toLowerCase())
    if (sameFunder.length) { console.log(`  same funder held, skipping: ${row.title} -> ${sameFunder.map(d => `${d.title} [${d.pipeline_state}]`).join('; ')}`); continue }
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
