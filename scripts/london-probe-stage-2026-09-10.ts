// London provider probe, 10 Sept 2026, on Paul's "go". Eight unheld London
// names were read to test whether the programme seam is really exhausted.
// Two passed the bar (a named intake, something the applicant receives, an
// organisation applying); six did not. Results in
// docs/handoffs/provider-walk-results-2026-09-08.json, batch 4.
// Every quote below was fetched in this session by direct fetch; no model call.
//
//   npx tsx --env-file=.env.local scripts/london-probe-stage-2026-09-10.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:london-probe-2026-09-10'
const TODAY = '2026-09-10'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'Hackney Giving Microgrants', funder: 'Hackney Giving', funder_type: 'community_foundation',
    funding_type: 'grant', funding_subtypes: ['small_grant'],
    apply_url: 'https://www.hackneygiving.org.uk/get-support/apply-for-funding/', url_status: 'unchecked',
    location_tag: 'Hackney', is_local: true, amount_min: null, amount_max: 1000, deadline: null, is_rolling: true,
    max_org_income: 300000,
    eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'ltd_guarantee', 'unincorporated', 'cooperative'],
    impact_sectors: ['health', 'community', 'mental_health'], target_beneficiaries: ['general_public'],
    description: 'Microgrants of up to £1,000 from Hackney Giving for not-for-profit groups with a turnover under £300,000 working in Hackney and the City of London. Two strands: community projects that improve health and wellbeing or reduce social isolation, and projects that help people understand health information. Rolling until the money is allocated; a pre-application call is required before the form is sent.',
    funder_brief: {
      source: 'live_fetch', is_local: true, location_tag: 'Hackney', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Not-for-profit groups with a turnover under £300,000, working in Hackney and the City of London.',
      what_they_fund: 'Community projects that improve health and wellbeing or reduce social isolation, and projects that help people understand health information.',
      typical_award: 'Up to £1,000.',
      exclusions: 'Groups with a turnover of £300,000 or more. Applications without the pre-application call are not accepted.',
      decision_timeline: 'Rolling; no deadline. Applications are welcomed until all the funding is allocated.',
      how_to_apply: 'Read the programme guidance, then book a pre-application call or email applications@hackneygiving.org.uk. The application form is sent after that conversation.',
      funder_tips: 'The Hackney CVS organisational development team will read a draft before you submit; use it.',
      geographic_focus: 'Hackney and the City of London.',
      _citations: {
        who_can_apply: { snippet: 'not-for-profit groups with a turnover of under £300,000', confidence: 'high', source_url: 'https://www.hackneygiving.org.uk/get-support/apply-for-funding/' },
        decision_timeline: { snippet: 'This is an ongoing programme; there is no deadline. Applications will be welcomed on a rolling basis until all the funding is allocated.', confidence: 'high', source_url: 'https://www.hackneygiving.org.uk/get-support/apply-for-funding/' },
      },
    },
  },

  { title: 'Barclays Eagle Labs Circular Economy Foundations Programme', funder: 'Barclays', funder_type: 'corporate',
    funding_type: 'programme', funding_subtypes: ['accelerator'],
    apply_url: 'https://labs.uk.barclays/what-we-offer/our-programmes/circular-economy-foundations-programme/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2026-10-09', is_rolling: false,
    eligible_structures: ['cic_shares', 'cic_guarantee', 'ltd_shares', 'ltd_guarantee', 'cooperative'],
    impact_sectors: ['environment', 'social_economy'], target_beneficiaries: ['general_public'],
    description: 'A free six-week online programme from Barclays Eagle Labs, powered by Visa, for UK SMEs that sell directly to consumers and want to test a circular business model: reuse, repair, refurbishment, recommerce, sharing or product-as-a-service. Weekly live sessions, expert speakers, mentoring and peer learning, with an in-person day in Shoreditch on 4 November. Applications close 9 October 2026; first session 28 October. A trading social enterprise selling to the public qualifies; a charity without a consumer product does not.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'UK-based SMEs that are operational and revenue-generating, sell a product or service directly to consumers, are new to circular business models, and can commit to weekly live sessions. Not a grant: there is no money, the offer is the programme.',
      what_they_fund: 'Six weeks of learning on customer demand, pricing, operational resilience, partnerships, impact and regulation for circular models, with Entrepreneur Academy content, Visa financial education resources, expert sessions, mentoring and peer learning.',
      typical_award: 'A place on the programme. No cash award.',
      exclusions: 'Businesses selling primarily to other businesses; pre-revenue businesses; businesses outside the UK.',
      decision_timeline: 'Applications open 7 September and close Friday 9 October 2026. Scoring and onboarding 12 to 28 October. First session online 28 October; in-person event 4 November in Shoreditch, London.',
      how_to_apply: 'Apply now from the programme page on the Eagle Labs site.',
      funder_tips: 'The programme wants direct-to-consumer businesses that are open to reuse, repair, recommerce or product-as-a-service. Say which of those you are weighing and why.',
      _citations: {
        who_can_apply: { snippet: 'To apply for the programme, your business must be: A UK-based SME Operational and revenue-generating A direct-to-consumer product or service', confidence: 'high', source_url: 'https://labs.uk.barclays/what-we-offer/our-programmes/circular-economy-foundations-programme/' },
        decision_timeline: { snippet: 'Applications open Monday 7 September, 2026 Applications close Friday 9 October, 2026 Scoring and onboarding Monday 12 - Wednesday 28 October, 2026 First session Wednesday 28 October, 2026 online In person event Wednesday 4 November, 2026 Shoreditch, London', confidence: 'high', source_url: 'https://labs.uk.barclays/what-we-offer/our-programmes/circular-economy-foundations-programme/' },
        what_they_fund: { snippet: "You'll have access to Entrepreneur Academy content, Visa financial education resources, sessions with expert speakers, mentoring and peer learning with other businesses.", confidence: 'high', source_url: 'https://labs.uk.barclays/what-we-offer/our-programmes/circular-economy-foundations-programme/' },
      },
      _walk_note: 'Audience is SMEs, not charities. Staged because a trading CIC or social enterprise selling to the public qualifies on the page\'s own terms; Paul may rule it out on audience.',
    },
  },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  type Held = { id: string; title: string; pipeline_state: string; apply_url: string | null }
  const all: Held[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('scraped_grants').select('id, title, pipeline_state, apply_url').range(from, from + 999)
    if (error) throw error
    all.push(...(data as Held[]))
    if (!data || data.length < 1000) break
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true })
  console.log(`table read: ${all.length} rows (table has ${count})`)
  if (all.length !== count) throw new Error('partial read; refusing to dedup against part of the table')

  let staged = 0
  for (const row of NEW) {
    const host = new URL(row.apply_url).hostname.replace(/^www\./, '')
    const dupe = all.filter(d => { try { return new URL(d.apply_url ?? 'https://x').hostname.replace(/^www\./, '') === host } catch { return false } })
    if (dupe.length) { console.log(`  same host already held: ${row.title} -> ${dupe.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}] ${d.apply_url}`).join('; ')}`) }
    const exact = dupe.filter(d => (d.apply_url ?? '').replace(/\/$/, '') === row.apply_url.replace(/\/$/, ''))
    if (exact.length) { console.log(`  already_held, skipping: ${row.title}`); continue }
    console.log(`  stage ${row.title}`)
    if (!APPLY) continue
    const stamped = { ...stampNewGrant({ ...row, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
    const { data, error } = await db.from('scraped_grants').insert(stamped).select('id').single()
    if (error) throw error
    console.log('     inserted', data.id); staged++
  }
  console.log(`${APPLY ? 'staged' : 'would stage'} ${APPLY ? staged : NEW.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
