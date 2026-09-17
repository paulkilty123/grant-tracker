// Paul, 7 Sept: publish Henry Smith Christian Grants (Clergy) and the two
// Freemasons' Charity grants, with decent insights. Henry Smith's brief was
// from May; its page today states everything and is rewritten from it. The
// Freemasons small-grants exclusions were one line; the eligibility page
// lists the full set, shared with the large grants row.
//   npx tsx --env-file=.env.local scripts/publish-three-hidden-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const HS = 'b5b74039-791e-47be-b283-4b03eff238ba', LARGE = '6566a492-f6e9-4146-99eb-887aedb4f0a1', SMALL = 'd6c9730d-022b-4ad2-b57b-0e28e2131741'
const HSU = 'https://henrysmith.foundation/grants/clergy/', FE = 'https://freemasonscharity.org.uk/get-support/grants-to-charities/eligibility/'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, is_active, funder_brief').in('id', [HS, LARGE, SMALL])
  if (!data || data.length !== 3 || data.some(r => r.is_active)) throw new Error('expected three hidden rows')
  console.log(APPLY ? 'APPLY' : 'DRY RUN'); data.forEach(r => console.log('  ', r.title, '-> live'))
  if (!APPLY) return
  const cite = (url: string) => (snippet: string, confidence: 'high' | 'med' = 'high') => ({ snippet, confidence, source_url: url })
  // Henry Smith Clergy, from today's page
  const hs = data.find(r => r.id === HS)!; const hb = { ...(hs.funder_brief as Record<string, unknown>) }; const hc = { ...((hb._citations as Record<string, unknown>) ?? {}) }; const h = cite(HSU)
  hb.who_can_apply = 'Churches, charities and not-for-profit organisations in the UK with an annual income up to £1 million, established for at least 18 months with a track record of similar work. Ring the foundation first if your income is above £1 million.'
  hb.what_they_fund = 'Initiatives that promote the wellbeing of Anglican clergy. Grants of £10,000 or more a year for up to three years; contact the foundation before asking for longer.'
  hb.how_to_apply = 'Complete the eligibility quiz on the Clergy grants page, then create an account on the application portal, read the guidance and submit online. You get an email confirmation, and an explanation if unsuccessful.'
  hb.exclusions = 'Requests under £10,000 a year. Grants totalling more than £100,000 are unlikely. Unsuccessful applicants wait at least 12 months before reapplying.'
  hb.decision_timeline = 'Applications can be submitted at any time and the foundation aims to decide in under five months.'
  hb.typical_award = '£10,000 or more a year for up to three years; there is no maximum, but totals above £100,000 are unlikely.'
  hb.open_status = 'open'; hb.last_enriched = '2026-09-07'; hb.source = 'live_fetch'
  Object.assign(hc, { who_can_apply: h('Eligible applicants include churches, charities, and not-for-profit organisations within the UK, with an annual income up to £1 million.'), what_they_fund: h('The Christian Grants programme supports initiatives that promote Anglican Clergy Wellbeing.'), how_to_apply: h('To apply, start by completing the eligibility checker.'), exclusions: h('There is no maximum but grants of more than a total of £100,000 are unlikely to be awarded'), decision_timeline: h('Applications can be submitted at any time, and we aim to make decisions in under five months.'), typical_award: h('Grants of £10,000 or more per year are available for up to three years.') })
  hb._citations = hc
  const a = await mergeGrantUpdate({ id: HS, source: 'admin:paulkilty1@gmail.com', db, fields: { funder_brief: hb, max_org_income: 1000000, is_active: true, pipeline_state: 'published' },
    citations: { max_org_income: h('with an annual income up to £1 million') } })
  console.log('  henry smith applied', a.applied, a.rejected.filter(x => x.reason !== 'idempotent'))
  // Freemasons small: full exclusions and an honest timeline; both rows published
  const f = cite(FE)
  const excl = 'Statutory obligations, routine delivery of the national curriculum, promoting civil liberties or human rights as a sole aim, political or lobbying activity, new build or large capital projects, capital repairs and maintenance, hospital equipment, promotion of religious doctrine, general appeals and retrospective funding. Beneficiaries must be in England and Wales.'
  for (const id of [SMALL, LARGE]) {
    const row = data.find(r => r.id === id)!; const b = { ...(row.funder_brief as Record<string, unknown>) }; const c = { ...((b._citations as Record<string, unknown>) ?? {}) }
    if (id === SMALL) { b.exclusions = excl; c.exclusions = f('Statutory obligations Routine delivery of the National Curriculum in schools The sole aim of promoting civil liberties and human rights Political or lobbying activities') }
    b.decision_timeline = 'The page states no decision timescale. Applications start with an eligibility quiz and an expression of interest; the charity prefers multi-year funding.'
    c.decision_timeline = f('Click here to take our eligibility quiz and submit an expression of interest.')
    b.how_to_apply = 'Read the priority groups, take the eligibility quiz on the charity\'s site and submit an expression of interest; a full application follows if invited. FAQs and form guides are on the application resources page.'
    c.how_to_apply = f('Before submitting an expression of interest please ensure you have read about our funding priority groups.')
    b.open_status = 'open'; b.last_enriched = '2026-09-07'; b.source = 'live_fetch'; b._citations = c
    const r = await mergeGrantUpdate({ id, source: 'admin:paulkilty1@gmail.com', db, fields: { funder_brief: b, is_active: true, pipeline_state: 'published' } })
    console.log('  freemasons', id === SMALL ? 'small' : 'large', 'applied', r.applied)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
