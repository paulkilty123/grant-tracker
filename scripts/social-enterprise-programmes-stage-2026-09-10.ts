// Re-read under Paul's ruling of 10 Sept 2026: programmes open to any UK
// business count when a trading social enterprise, including one limited by
// shares, could join on the page's own terms. Two rows I had ruled out with a
// charity lens are staged here. Every quote fetched in this session by direct
// fetch; no model call.
//
//   npx tsx --env-file=.env.local scripts/social-enterprise-programmes-stage-2026-09-10.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:se-programmes-2026-09-10'
const TODAY = '2026-09-10'

type Row = Record<string, unknown> & { title: string; funder: string; apply_url: string }
const NEW: Row[] = [
  { title: 'Barclays Eagle Labs Veteran and Military Spousal Founders Programme', funder: 'Barclays', funder_type: 'corporate',
    funding_type: 'programme', funding_subtypes: ['accelerator'],
    apply_url: 'https://labs.uk.barclays/what-we-offer/inclusion-at-eagle-labs/veteran-and-military-spousal-founders/veteran-founders-programme/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: null, amount_undisclosed: true, deadline: '2027-02-09', is_rolling: false,
    eligible_structures: ['ltd_shares', 'ltd_guarantee', 'cic_shares', 'cic_guarantee', 'sole_trader', 'not_registered'],
    impact_sectors: ['social_economy', 'employment'], target_beneficiaries: ['veterans'],
    description: 'A free five-week online accelerator from Barclays Eagle Labs for military veterans, serving personnel and military spouses or partners who are starting or growing a business in any sector, from idea stage to trading and looking to scale. Weekly self-paced modules on leadership, product, raising capital, sales and growth, with one-to-one guidance from a Barclays Champion and access to the Eagle Labs community. Applications close 9 February 2027; the programme runs 1 March to 2 April 2027. A veteran-led or spouse-led social enterprise qualifies.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Military veterans or serving personnel (Royal Navy, Army, RAF) and military spouses and partners. The business can be new in any sector, at idea stage with a product or service, or at market and looking to scale. Not a grant: the offer is the programme.',
      what_they_fund: 'Five weeks of weekly self-learning modules covering starting a business, co-founders, leadership, product development, raising capital, market fit, marketing, sales and scaling, with a dedicated Barclays Champion as a one-to-one sounding board and introductions to local Ecosystem Managers and events.',
      typical_award: 'A free place on the programme. No cash award.',
      exclusions: 'Applicants without a service or spousal connection to the armed forces.',
      decision_timeline: 'Applications open 9 September 2026 and close Tuesday 9 February 2027. Successful applicants notified 10 February; launch 15 February; programme runs 1 March to 2 April 2027.',
      how_to_apply: 'Online application from the programme page, then a selection process. Successful applicants have five days to accept.',
      funder_tips: 'Allow about two and a half hours a week for the modules plus an hour with your champion. Two entry pages exist, one for veterans and one for spouses; the eligibility and dates are identical.',
      _citations: {
        who_can_apply: { snippet: 'This programme is for: Military veterans or serving personnel (Royal Navy, Army, RAF) Military spouses and partners. Your business must be: A new business in any sector At idea stage with products or services At market and looking to scale.', confidence: 'high', source_url: 'https://labs.uk.barclays/what-we-offer/inclusion-at-eagle-labs/veteran-and-military-spousal-founders/veteran-founders-programme/' },
        decision_timeline: { snippet: 'Applications open Wednesday 9 September, 2026 Applications close Tuesday 9 February, 2027 Successful applicants notified Wednesday 10 February, 2027 Programme launch (intro to champions) Monday 15 February, 2027 Programme begins Monday 1 March, 2027 Programme ends Friday 2 April, 2027', confidence: 'high', source_url: 'https://labs.uk.barclays/what-we-offer/inclusion-at-eagle-labs/veteran-and-military-spousal-founders/veteran-founders-programme/' },
      },
      _walk_note: 'Applicants qualify by personal service history, so many will be individuals at idea stage. Staged under the 10 Sept ruling because a veteran-led trading social enterprise qualifies on the page\'s own terms. Spousal entry page: https://labs.uk.barclays/what-we-offer/inclusion-at-eagle-labs/veteran-and-military-spousal-founders/military-spousal-founders-programme/',
    },
  },

  { title: 'Zinc Pre-Seed Investment and Venture Building', funder: 'Zinc', funder_type: 'other',
    funding_type: 'investment', funding_subtypes: ['equity'],
    apply_url: 'https://www.zinc.vc/programmes/pre-seed-investment/', url_status: 'unchecked',
    location_tag: 'UK', is_local: false, amount_min: null, amount_max: 250000, deadline: null, is_rolling: true,
    eligible_structures: ['ltd_shares', 'cic_shares'],
    impact_sectors: ['social_innovation', 'health', 'environment', 'tech'], target_beneficiaries: ['general_public'],
    description: 'Pre-seed investment of up to £250,000 from Zinc for entrepreneurs starting and building science-for-impact ventures in the UK, with two years of hands-on venture building support through the Zinc platform. Zinc backs deep tech and IP-rich ventures in health and environment. Pitch decks are assessed on a rolling basis. Equity investment, so the venture must be a company limited by shares; a mission-led social enterprise with that structure qualifies.',
    funder_brief: {
      source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
      who_can_apply: 'Exceptional entrepreneurs starting and building science-for-impact ventures in the UK, with a strong founding team, a robust science or IP foundation and clear conviction about the market. Equity investment, so the venture needs to be a company that can issue shares.',
      what_they_fund: 'Deep tech and IP-rich commercial innovation in health and environment, through the first two years of a new venture, with funding and venture-building support.',
      typical_award: 'An initial Zinc investment of up to £250,000, plus access to the Zinc Venture Building Platform.',
      exclusions: 'Ventures without a science or IP foundation; ventures outside the UK. Charities and companies limited by guarantee cannot take equity.',
      decision_timeline: 'Rolling. Pitch decks are assessed as they arrive.',
      how_to_apply: 'Submit a pitch deck through the pre-seed investment page.',
      funder_tips: 'Zinc is a venture builder, not a grant-maker: expect to give equity and to work inside its platform for two years.',
      _citations: {
        typical_award: { snippet: 'initial Zinc investment of up to £250k', confidence: 'high', source_url: 'https://www.zinc.vc/programmes/pre-seed-investment/' },
        who_can_apply: { snippet: 'exceptional entrepreneurs starting and building Science-for-Impact ventures in the UK', confidence: 'high', source_url: 'https://www.zinc.vc/programmes/pre-seed-investment/' },
        decision_timeline: { snippet: 'Pitch decks are assessed on a rolling basis', confidence: 'high', source_url: 'https://www.zinc.vc/programmes/pre-seed-investment/' },
      },
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
    const sameHost = all.filter(d => { try { return new URL(d.apply_url ?? 'https://x').hostname.replace(/^www\./, '') === host } catch { return false } })
    if (sameHost.length) console.log(`  same host held: ${row.title} -> ${sameHost.map(d => `${d.id.slice(0, 8)} ${d.title} [${d.pipeline_state}]`).join('; ')}`)
    const exact = sameHost.filter(d => (d.apply_url ?? '').replace(/\/$/, '') === row.apply_url.replace(/\/$/, ''))
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
