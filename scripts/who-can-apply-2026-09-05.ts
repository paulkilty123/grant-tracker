// Five live rows with no who_can_apply, 2026-09-05. Every page was read today
// in a browser (four of the five refuse plain fetches) and each sentence
// below carries the page's own words as its citation.
//
// Groundwork "Just About Managing Fund" is not on Groundwork's site: the
// apply-for-a-grant page lists every open scheme and it is not among them,
// and the row's link was the site's funding index, which redirects to a
// Yorkshire regional page. It reads as an invented seed and is rejected.
//
//   npx tsx --env-file=.env.local scripts/who-can-apply-2026-09-05.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY = process.argv.includes('--apply')
const SOURCE = 'user_verified:who-can-apply-2026-09-05'
type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>
type Brief = Record<string, unknown>

const ROWS: { id: string; re: RegExp; brief: Partial<Brief>; briefCits: Cit; fields?: Record<string, unknown>; cits?: Cit }[] = [
  { id: '6aa5d536-2a0f-4e65-b45b-892b8acdc352', re: /Chichester District Council/,
    brief: {
      who_can_apply: 'Voluntary organisations, community groups and businesses in Chichester district with a project meeting one of the three 2026/27 priorities: economy (SME growth projects), improving places and spaces, or stronger communities (established voluntary services supporting vulnerable people). You must contact a council Funding Adviser through the enquiry form before applying; applications that skip this are rejected. The council funds at most 50% of a project\'s cost.',
      exclusions: 'Projects that have already started or finished. More than 50% of the total project cost. Applications made without first going through the enquiry form.',
      how_to_apply: 'Complete the enquiry form so a Funding Adviser can contact you, then apply on the form they send. Fast Track grants up to £2,000 can be applied for at any time, allow six weeks. Grants over £2,000 go to a quarterly panel.',
      decision_timeline: 'Over £2,000: closing dates 27 November 2026 (panel 27 January 2027) and 5 February 2027 (panel 24 March 2027). Fast Track: any time, aim for six weeks before you need the money.',
      typical_award: 'Fast Track up to £2,000; larger grants in proportion to the project, from a £320,000 annual pot.',
    },
    briefCits: {
      who_can_apply: { snippet: 'applications must be from eligible organisations delivering projects or services meeting one of the priorities', confidence: 'high' },
      exclusions: { snippet: 'grants cannot be sought retrospectively for projects that have already started (or completed) ... The programme can only fund 50% of a total project cost.', confidence: 'high' },
      how_to_apply: { snippet: 'Any applications that have not followed this route will be rejected.', confidence: 'high' },
      decision_timeline: { snippet: 'Friday 27 November 2026 ... Wednesday 27 January 2027', confidence: 'high' },
      typical_award: { snippet: 'the Fast Track grant request limit has been increased to £2,000 ... The total pot for the year is £320,000.', confidence: 'high' },
    },
    fields: { deadline: '2026-11-27', is_rolling: false },
    cits: { deadline: { snippet: 'Closing date for applications by 5pm ... Friday 27 November 2026', confidence: 'high' } } },
  { id: 'aa1e8f3f-e938-4852-9bda-3294ab4c1380', re: /Crowdfunder/,
    brief: {
      who_can_apply: 'Charities, not-for-profit organisations and community interest companies, community projects and sports clubs raising money through a Crowdfunder rewards project. Each match fund has its own criteria, so check the fund before applying.',
      exclusions: 'Personal cause fundraisers and prize draws.',
    },
    briefCits: {
      who_can_apply: { snippet: 'Not-for-profit organisations and Community Interest Companies (CICs) can access match funding from our partners.', confidence: 'high' },
      exclusions: { snippet: 'Personal cause fundraisers and prize draws are not currently eligible for match funding.', confidence: 'high' },
    } },
  { id: 'b7b435e3-33de-40cf-973e-e43b9f2a95fd', re: /National Portfolio/,
    brief: {
      who_can_apply: 'Arts organisations, museums and libraries in England, applying for multi-year funding of at least £50,000 a year over the five years from 1 April 2028 to 31 March 2033, for working directly with the public, supporting the cultural sector, or both. Applicant guidance is published in September 2026.',
      decision_timeline: 'Applicant Guidance is due later in September 2026; the portfolio runs from 1 April 2028 to 31 March 2033.',
    },
    briefCits: {
      who_can_apply: { snippet: 'Who can apply: arts organisations, museums and libraries ... How much you can apply for: from £50,000 per year', confidence: 'high' },
      decision_timeline: { snippet: 'Our next update will be later in September, when we publish Applicant Guidance.', confidence: 'high' },
    },
    fields: { amount_min: 50000 },
    cits: { amount_min: { snippet: 'How much you can apply for: from £50,000 per year', confidence: 'high' } } },
  { id: '31f56c84-447a-478b-a15a-fcb19469c1aa', re: /Tree Planting/,
    brief: {
      who_can_apply: 'Community-based organisations with a social benefit in the UK, such as schools, community groups, social enterprises, non-governmental organisations and parish councils, with a bank account in the organisation\'s name and signed permission from the landowner. Projects plant 100 to 10,000 native trees a year in publicly accessible spaces and involve the community.',
      exclusions: 'Planting on private land without public access, non-native species, and projects without a maintenance plan.',
      typical_award: 'Up to £2.15 per tree including protection and mulch, plus £0.10 per tree in each of the first two summers for maintenance.',
      decision_timeline: 'Applications open from 29 June 2026. First assessments on 1 October 2026, then first come first served until the final deadline of 11 December 2026.',
      how_to_apply: 'Register on the International Tree Foundation grant platform and open the UK Community Tree Planting Application Form 2026.',
    },
    briefCits: {
      who_can_apply: { snippet: 'Your organisation must be community-based and/or have a social benefit e.g. a school, community group, social enterprise, non-governmental organisation, parish council, etc.', confidence: 'high', source_url: 'https://www.internationaltreefoundation.org/s/ITF-UK-CTP-Programme-Grant-Guidelines-26.pdf' },
      exclusions: { snippet: 'Plant trees in public/publicly-accessible spaces ... Plant indigenous tree species ... Have clear plans for maintenance and sustainability', confidence: 'med', source_url: 'https://www.internationaltreefoundation.org/s/ITF-UK-CTP-Programme-Grant-Guidelines-26.pdf' },
      typical_award: { snippet: 'a maximum price equivalent to £2.15/tree (inclusive of tree protection and mulch)', confidence: 'high', source_url: 'https://www.internationaltreefoundation.org/s/ITF-UK-CTP-Programme-Grant-Guidelines-26.pdf' },
      decision_timeline: { snippet: 'There is a final application deadline of Friday 11th December 2026.', confidence: 'high', source_url: 'https://www.internationaltreefoundation.org/s/ITF-UK-CTP-Programme-Grant-Guidelines-26.pdf' },
      how_to_apply: { snippet: 'you\'ll see a box titled "UK Community Tree Planting – Application Form 2026"', confidence: 'high', source_url: 'https://www.internationaltreefoundation.org/s/ITF-UK-CTP-Programme-Grant-Guidelines-26.pdf' },
    },
    fields: { deadline: '2026-12-11', is_rolling: false,
      grant_sources: [{ url: 'https://www.internationaltreefoundation.org/s/ITF-UK-CTP-Programme-Grant-Guidelines-26.pdf', label: 'Grant guidelines PDF, June 2026 (eligibility, per-tree rate, deadline)', added_at: '2026-09-05' }] },
    cits: { deadline: { snippet: 'There is a final application deadline of Friday 11th December 2026.', confidence: 'high' } } },
]

const REJECT = { id: 'f3c80850-b852-4de7-8708-91e3f1fc8255', re: /Just About Managing/ }

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, funder_brief').eq('id', r.id).single()
    if (!data || !r.re.test(data.title)) throw new Error(`${r.id}: ${data?.title}`)
    const brief: Brief = { ...((data.funder_brief as Brief) ?? {}) }
    const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
    for (const [k, v] of Object.entries(r.brief)) brief[k] = v
    for (const [k, v] of Object.entries(r.briefCits)) cits[k] = v
    brief._citations = cits
    console.log(`  ${data.title.slice(0, 50).padEnd(50)} brief +${Object.keys(r.brief).join(',')}${r.fields ? ' fields ' + Object.keys(r.fields).join(',') : ''}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, source: SOURCE, db, fields: { funder_brief: brief, ...(r.fields ?? {}) }, citations: r.cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${res.applied.join(', ')}]${refused.length ? ' REFUSED ' + JSON.stringify(refused) : ''}`)
  }
  const { data: jam } = await db.from('scraped_grants').select('title').eq('id', REJECT.id).single()
  if (!jam || !REJECT.re.test(jam.title)) throw new Error(`reject: ${jam?.title}`)
  console.log(`  ${jam.title.slice(0, 50).padEnd(50)} REJECT dead_url`)
  if (!APPLY) return
  const res = await mergeGrantUpdate({ id: REJECT.id, source: SOURCE, db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('dead_url', 'not on Groundwork\'s site: the apply-for-a-grant page lists every open scheme and this is not one of them; the row\'s link was the funding index, which redirects to a Yorkshire regional page') } })
  console.log(`     applied [${res.applied.join(', ')}]`)
}
main().catch(e => { console.error(e); process.exit(1) })
