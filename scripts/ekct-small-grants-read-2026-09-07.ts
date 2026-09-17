// Ernest Kleinwort Small Grants: Paul read the apply page (bot wall for
// machines) on 7 Sept. "Small Grant — up to £10,000. Applications accepted
// throughout the year. Trustees aim to review applications within 60 days."
// The row already held up to £10,000, rolling: confirmed. The evidence stamp
// is written by hand so the checker's "unsupported amount" flag clears; the
// medium and large windows go into the insights for context.
//   npx tsx --env-file=.env.local scripts/ekct-small-grants-read-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const URL = 'https://ekct.org.uk/apply/'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, amount_max, is_rolling, funder_brief, field_evidence').eq('title', 'Ernest Kleinwort Charitable Trust Small Grants').eq('is_active', true).single()
  if (!data) throw new Error('row not found')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `max ${data.amount_max} rolling ${data.is_rolling}: confirmed by Paul's read`)
  if (!APPLY) return
  const now = new Date().toISOString()
  const ev = { ...((data.field_evidence as Record<string, unknown>) ?? {}) }
  ev.amount_max = { by: 'admin:paulkilty1@gmail.com', quote: 'Small Grant — up to £10,000', agrees: true, checked_at: now, source_url: URL }
  ev.is_rolling = { by: 'admin:paulkilty1@gmail.com', quote: 'Small grant applications are accepted throughout the year.', agrees: true, checked_at: now, source_url: URL }
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.typical_award = 'Small grants up to £10,000. Medium grants of £10,001 to £20,000 have four application windows a year, and large grants over £20,001 are restricted to charities the trustees already know well.'
  brief.decision_timeline = 'Small grants: apply at any time, trustees aim to review within 60 days. Medium grants: windows 4 January to 4 February, 18 April to 12 May, 10 July to 13 August, 9 October to 12 November, reviewed in 8 to 12 weeks.'
  brief.how_to_apply = 'Take the eligibility questionnaire on the trust\'s apply page, then complete the Small Grant application form online.'
  brief.open_status = 'open'
  Object.assign(cits, { typical_award: { snippet: 'Small Grant — up to £10,000', confidence: 'high', source_url: URL }, decision_timeline: { snippet: 'Trustees aim to review applications within 60 days of application submission.', confidence: 'high', source_url: URL }, how_to_apply: { snippet: 'Take our eligibility questionnaire', confidence: 'high', source_url: URL } })
  brief._citations = cits
  const r = await mergeGrantUpdate({ id: data.id, source: 'admin:paulkilty1@gmail.com', db, fields: { funder_brief: brief, field_evidence: ev,
    grant_sources: [{ url: URL, label: 'Apply page, read by Paul 2026-09-07 (bot wall blocks the checker)', added_at: '2026-09-07' }] } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
