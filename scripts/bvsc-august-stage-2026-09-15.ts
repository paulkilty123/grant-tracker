// Two funds from Bexley Voluntary Service Council's August 2026 funding
// newsletter (a PDF Paul pointed at, 15 Sept 2026) that the catalogue did
// not hold. Groundwork's page read in the browser (its site is bot-walled
// to fetch), Ofcom's by direct fetch. No model call. Both land hidden in
// Needs reading. Not staged from the same PDF: Wax Chandlers (held), Green
// Community Grants (held), Drapers (held), Grassroots Grants (held), Common
// Ground Award (already staged), Churchill Fellowship (individuals), the ACE
// Music Growth Fund (not yet open, no date, site bot-walled) and the BFI
// Creative Challenge Fund (page not found on bfi.org.uk; closes 21 Sept).
//
//   npx tsx --env-file=.env.local scripts/bvsc-august-stage-2026-09-15.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:bvsc-august-2026-09-15'
const TODAY = '2026-09-15'
const GW = 'https://www.groundwork.org.uk/london/thrive-ldn-london-communities-micro-grant-fund/'
const OFCOM = 'https://www.ofcom.org.uk/tv-radio-and-on-demand/community-radio/community-radio-fund'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'London Communities Micro Grant Fund', funder: 'Groundwork London', funder_type: 'capacity_builder',
    funding_type: 'grant', funding_subtypes: ['unrestricted', 'small_grant'],
    apply_url: GW, url_status: 'unchecked',
    location_tag: 'London', is_local: true, amount_min: null, amount_max: 5000, deadline: '2026-09-21', is_rolling: false,
    max_org_income: 500000,
    eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'cic_shares', 'ltd_guarantee'],
    impact_sectors: ['mental_health', 'community'], target_beneficiaries: ['mental_health', 'people_in_poverty', 'refugees_migrants', 'ethnic_minorities'],
    niche_tags: ['adult_mh', 'social_isolation', 'neighbourhood', 'faith_community', 'bame_community'],
    description: 'Micro grants of up to £2,000 (turnover under £300,000) or £5,000 (turnover under £500,000) from Groundwork London, commissioned by Thrive LDN with the Mayor of London, for grassroots and community-led organisations in London that support wellbeing, resilience and belonging among marginalised and underserved communities. Funds existing activity such as peer support, community connection, creative wellbeing, safe spaces and events; not entirely new initiatives. Open to small charities, community groups, faith organisations, CICs, mutual aid and peer support groups, and unconstituted groups with arrangements to receive funding. Opened 24 August 2026, closes 10am on 21 September 2026; decisions 2 October; activity delivered by 14 December 2026.',
    funder_brief: { source: 'live_fetch', is_local: true, location_tag: 'London', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Grassroots and community-led organisations in London with an established track record: small charities and voluntary organisations, community groups and networks, faith-based organisations, CICs, mutual aid and peer support groups, and informal or unconstituted groups with suitable arrangements to receive funding. Annual turnover under £500,000.',
      what_they_fund: 'Existing community activities and services that support mental wellbeing and resilience, community connection and belonging, social inclusion and participation, peer support and community networks, arts, culture and creative wellbeing, and safe spaces and community events. Funding strengthens what is already delivered; entirely new initiatives are not funded.',
      typical_award: 'Up to £2,000 for organisations with annual turnover below £300,000; up to £5,000 for turnover below £500,000. Paid 75 per cent upfront and 25 per cent on the monitoring report.',
      exclusions: 'Entirely new initiatives; organisations without evidence of previous delivery; turnover of £500,000 or more.',
      priorities: 'Trusted community organisations reaching people who are least likely to use traditional mental health support: those experiencing poverty, discrimination, displacement, crisis and social exclusion.',
      geographic_focus: 'London.',
      decision_timeline: 'Applications opened 24 August 2026 and close at 10am on 21 September 2026. Outcomes announced 2 October, first payments from 5 October, monitoring report due 14 December 2026.',
      how_to_apply: 'Online application portal from the fund page, with a prospectus, easy read prospectus and guidance. One-to-one support and an information workshop were offered; an accessibility pot of up to £500 per applicant can pay for BSL, translation, a scribe or help completing the form, applied for before the main application.',
      funder_tips: 'Show evidence of previous delivery in the community; the fund strengthens existing activity. Plan so most funded activity is delivered and reported by 14 December 2026.',
      strong_application: 'A small London group with a track record of peer support, community events or creative wellbeing work among a marginalised community, asking for a few thousand pounds to sustain it through the autumn.',
      _citations: {
        typical_award: { snippet: 'Up to £2,000 for organisations with an annual turnover below £300,000. Up to £5,000 for organisations with an annual turnover below £500,000', confidence: 'high', source_url: GW },
        who_can_apply: { snippet: 'Applications are now open to grassroots and community-led organisations working with some of London’s most marginalised and underserved communities.', confidence: 'high', source_url: GW },
        decision_timeline: { snippet: 'Applications Open 24th August 2026 ... Applications Close 21st September 2026, 10am', confidence: 'high', source_url: GW },
      } } },

  { title: 'Community Radio Fund 2026-27', funder: 'Ofcom', funder_type: 'government',
    funding_type: 'grant', funding_subtypes: ['restricted', 'capital'],
    apply_url: OFCOM, url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: 100000, deadline: '2026-10-14', is_rolling: false,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'unincorporated'],
    impact_sectors: ['community', 'creative'], target_beneficiaries: ['general_public'],
    niche_tags: ['film_media', 'neighbourhood'],
    description: 'Grants from the Community Radio Fund, allocated by DCMS and managed by Ofcom, for Ofcom-licensed community radio stations: an Equipment Stream of up to £2,000 for studio and transmission equipment (analogue stations on air ten years or more) and a Sustainability Stream of up to £100,000 for job roles or projects that keep the station running (analogue and C-DSP stations on air at application), with a limited number of multi-year awards of up to three years. £904,644 available in one round for 2026-27. Applications by email close 5pm on 14 October 2026; the panel meets in early January 2027.',
    funder_brief: { source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Ofcom-licensed community radio stations that are on air at the date of application. Equipment Stream: analogue community radio services on air for ten or more years. Sustainability Stream: analogue and C-DSP stations. Analogue stations need at least fifteen months left on their licence at the closing date or an extension application lodged.',
      what_they_fund: 'Equipment Stream: studio and transmission equipment, including accessibility improvements, such as mixing desks, recording equipment, microphones and playout software. Sustainability Stream: job roles or projects that support the station\'s sustainability, such as station management, administration, volunteer organisation and fundraising.',
      typical_award: 'Up to £2,000 in the Equipment Stream; up to £100,000 in the Sustainability Stream. £904,644 in total for 2026-27, in one round. A limited number of multi-year Sustainability awards of up to three years.',
      exclusions: 'Stations not licensed by Ofcom or not on air at application; C-DSP stations may not apply to the Equipment Stream; applications on an outdated form are rejected.',
      priorities: 'The essential core work and equipment that keeps licensed community radio stations broadcasting, with multi-year awards introduced in 2026-27 for sustainability.',
      geographic_focus: 'UK.',
      decision_timeline: 'One round for 2026-27. Applications close at 5pm on Wednesday 14 October 2026; the Community Radio Fund Panel is expected to meet in early January 2027.',
      how_to_apply: 'Read the updated guidance notes, complete the current application form from the fund page and email it to communityradiofund@ofcom.org.uk by the deadline.',
      funder_tips: 'Use the most recent version of the form; older forms are rejected. Read the guidance for the changed rules this year, including multi-year bids and the dedicated Equipment Stream.',
      strong_application: 'A licensed community station with a clear plan for a role or project that makes it more sustainable, or a specific piece of equipment it needs, costed and within the stream limits.',
      _citations: {
        typical_award: { snippet: 'Maximum award £2,000 £100,000', confidence: 'high', source_url: OFCOM },
        who_can_apply: { snippet: 'Analogue Community Radio services who have been on air for 10 or more years. Must be on air at date of application. Analogue Community Radio stations and C-DSP stations who are on air at the date of application.', confidence: 'high', source_url: OFCOM },
        decision_timeline: { snippet: 'Applications will close at 5pm on Wednesday 14 October 2026', confidence: 'high', source_url: OFCOM },
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
