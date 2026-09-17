// Allen Lane Foundation: Paul read the how-to-apply page (captcha for
// machines) on 7 Sept. "You can apply anytime – we process applications all
// through the year"; trustees meet February, June and October; "OUR OCTOBER
// MEETING IS NOW CLOSED FOR NEW APPLICATIONS". The row's 1 October deadline
// was wrong: the fund is rolling, with the next round in February.
//   npx tsx --env-file=.env.local scripts/allen-lane-timing-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const URL = 'https://allenlane.org.uk/applying-for-funding/'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, deadline, is_rolling, funder_brief').eq('title', 'Allen Lane Foundation').eq('is_active', true).single()
  if (!data) throw new Error('row not found')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `deadline ${data.deadline}, rolling ${data.is_rolling} -> rolling, no deadline`)
  if (!APPLY) return
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.decision_timeline = 'Apply at any time; the foundation replies within two to three weeks with initial thoughts, and a grant usually takes two to six months. Trustees meet three times a year, in February, June and October. The October 2026 meeting is closed to new applications, so applications now go to the February round.'
  brief.how_to_apply = 'Complete the eligibility questionnaire on the foundation\'s site; if eligible you are directed to the online application form. Write in plain English in your own words. A visit may be arranged if further information is needed.'
  brief.open_status = 'open'
  cits.decision_timeline = { snippet: 'You can apply anytime – we process applications all through the year, and will come back to you within a couple of weeks with our initial thoughts.', confidence: 'high', source_url: URL }
  cits.how_to_apply = { snippet: 'To access our online application form we ask that you complete an eligibility questionnaire first.', confidence: 'high', source_url: URL }
  brief._citations = cits
  const r = await mergeGrantUpdate({ id: data.id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_rolling: true, deadline: null, funder_brief: brief,
      grant_sources: [{ url: URL, label: 'How to apply page, read by Paul 2026-09-07 (captcha blocks the checker)', added_at: '2026-09-07' }] },
    citations: { is_rolling: { snippet: 'You can apply anytime – we process applications all through the year', confidence: 'high', source_url: URL },
      deadline: { snippet: 'PLEASE NOTE: OUR OCTOBER MEETING IS NOW CLOSED FOR NEW APPLICATIONS', confidence: 'high', source_url: URL } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
