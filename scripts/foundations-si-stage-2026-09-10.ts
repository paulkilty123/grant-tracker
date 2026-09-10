// Foundations with a social investment arm, walked 10 Sept 2026 on Paul's
// "go" (docs/investment-breadth-proposal-2026-09-10.md, step 4a). Six sites
// read by direct fetch in this session, no model call.
//
//   Barrow Cadbury Trust   OPEN. £50,000 to £250,000, charities and social
//                          enterprises, two-page proposal to the SI manager.
//                          STAGED below.
//   Friends Provident      Investment page describes the portfolio and
//                          strategy; no route for an organisation to apply.
//                          Not staged.
//   Tudor Trust            Investments page is about the endowment. Not staged.
//   Comic Relief           No social investment offer on the funding pages;
//                          every listed initiative closed. Not staged.
//   Paul Hamlyn            Grants only. Not staged.
//   Lankelly Chase         403 to every fetch (bot wall); winding down anyway.
//                          Paul's browser if wanted.
//
//   npx tsx --env-file=.env.local scripts/foundations-si-stage-2026-09-10.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { stampNewGrant } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')
const SRC = 'system:foundations-si-2026-09-10'
const TODAY = '2026-09-10'
const URL_ = 'https://barrowcadbury.org.uk/finance/social-investment/'

const ROW = {
  title: 'Barrow Cadbury Trust Social Investment', funder: 'Barrow Cadbury Trust',
  funding_type: 'investment', funding_subtypes: ['social_investment', 'loan', 'equity'],
  apply_url: URL_, url_status: 'unchecked',
  location_tag: 'UK', is_local: false, amount_min: 50000, amount_max: 250000, deadline: null, is_rolling: true,
  eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative'],
  impact_sectors: ['justice', 'women', 'community', 'social_economy'], target_beneficiaries: ['general_public'],
  description: 'Patient, flexible social investment from Barrow Cadbury Trust for charities and social enterprises whose work reflects its social justice aims: criminal justice, gender justice, racial justice and economic justice. Usually £50,000 to £250,000, as risk capital for new models that struggle to raise it elsewhere. Non-charitable companies considered where the mission fits. Local projects are more likely to be backed in or around Birmingham. Rolling; apply with a two-page proposal.',
  funder_brief: {
    source: 'live_fetch', is_local: false, location_tag: 'UK', last_enriched: TODAY, open_status: 'open',
    who_can_apply: 'Charities and social enterprises whose work reflects the Trust\'s criminal, gender, racial or economic justice aims. Non-charitable companies are considered where the social mission is in line with the Trust\'s aims and any private benefit is necessary and reasonable.',
    what_they_fund: 'Investments with clear evidence of social impact that provide risk capital to test new models, often for organisations that find it hard to raise risk capital elsewhere, and that catalyse present and future investment.',
    typical_award: 'Usually between £50,000 and £250,000. Terms are agreed individually; the Trust holds a mix of short and longer term investments.',
    exclusions: 'None stated beyond fit with the four justice aims. Local or regional projects are more likely to be backed if based in or around Birmingham.',
    decision_timeline: 'Rolling. The Trust contacts applicants about next steps after reading the summary.',
    how_to_apply: 'Send a summary of no more than two pages to the Social Investment Manager covering the organisation, how the investment will be used, how much is sought, how the project generates income, and the social impact.',
    geographic_focus: 'UK, with a preference for Birmingham on local projects.',
    funder_tips: 'The Trust says social investment is not always the right answer and may be one of several options; show why repayable finance fits your income model.',
    _citations: {
      typical_award: { snippet: 'We will usually invest between £ 50,000 and £ 250,000.', confidence: 'high', source_url: URL_ },
      who_can_apply: { snippet: 'Will Barrow Cadbury Trust invest in non-charitable companies? Yes, provided that: the social mission of the non-charitable company is in line with our aims', confidence: 'high', source_url: URL_ },
      what_they_fund: { snippet: 'Provide risk capital to test new models of investment and working, often to organisations which find it difficult to raise the risk capital elsewhere', confidence: 'high', source_url: URL_ },
      how_to_apply: { snippet: 'send a summary of the proposal to Kumar Ghosh, Social Investment Manager . This should be a maximum of two pages', confidence: 'high', source_url: URL_ },
      exclusions: { snippet: 'If an investment is in a local or regional project, we are more likely to invest if it is based in or around Birmingham', confidence: 'high', source_url: URL_ },
    },
    _walk_note: 'Instrument not stated beyond "investment"; portfolio shows loans, equity and community shares. Tagged social_investment, loan, equity accordingly.',
  },
}

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  // Precondition: the page still says what the row says.
  const html = await (await fetch(URL_, { headers: { 'user-agent': 'Mozilla/5.0 Chrome/124' } })).text()
  for (const must of ['50,000', '250,000', 'How to apply']) if (!html.includes(must)) throw new Error(`page no longer contains "${must}"; stop`)
  console.log('page precondition: amounts and apply route present')

  const { data: dupes, error } = await db.from('scraped_grants').select('id,title,pipeline_state').or('apply_url.ilike.%barrowcadbury.org.uk/finance/social-investment%,and(funder.ilike.%barrow cadbury%,funding_type.eq.investment)')
  if (error) throw error
  if (dupes!.length) { console.log('already held:', dupes); return }
  const { data: sib } = await db.from('scraped_grants').select('funder_type').ilike('funder', '%barrow cadbury%').not('funder_type', 'is', null).limit(1).single()
  const funder_type = sib?.funder_type ?? 'trust_foundation'
  console.log(`stage ${ROW.title} (funder_type ${funder_type}) ${ROW.amount_min}-${ROW.amount_max}`)
  if (!APPLY) return
  const stamped = { ...stampNewGrant({ ...ROW, funder_type, source: SRC, is_active: false }, SRC), pipeline_state: 'tagged_awaiting_review' as const }
  const { data, error: ie } = await db.from('scraped_grants').insert(stamped).select('id').single()
  if (ie) throw ie
  console.log('inserted', data.id)
}
main().catch(e => { console.error(e); process.exit(1) })
