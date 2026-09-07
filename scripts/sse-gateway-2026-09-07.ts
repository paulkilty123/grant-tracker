// SSE Social Investment Gateway Programme: round 2 is real, deadline 6
// November 2026 (page: "Please register your interest in round 2 of the
// programme (March 2027 – February 2028). Deadline: November 6, 2026.").
// The deadline was admin-held at 17 July; Paul, 7 Sept: refresh and publish.
//   npx tsx --env-file=.env.local scripts/sse-gateway-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = '5b3ee9d2-efea-43ca-b4e6-94005e070a09'
const URL = 'https://www.the-sse.org/programme/social-investment-gateway-programme/'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, deadline, is_active, funder_brief').eq('id', ID).single()
  if (!data || !/Social Investment Gateway/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `${data.deadline} -> 2026-11-06, ${data.is_active ? 'live' : 'hidden'} -> live`)
  if (!APPLY) return
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.decision_timeline = 'Round 1 has closed. Round 2 runs March 2027 to February 2028; register interest by 6 November 2026.'
  brief.open_status = 'open'
  cits.decision_timeline = { snippet: 'Please register your interest in round 2 of the programme (March 2027 – February 2028). Deadline: November 6, 2026.', confidence: 'high', source_url: URL }
  brief._citations = cits
  const a = await mergeGrantUpdate({ id: ID, source: 'admin:paulkilty1@gmail.com', db, fields: { deadline: '2026-11-06', is_rolling: false, next_open_date: null, funder_brief: brief },
    citations: { deadline: { snippet: 'Please register your interest in round 2 of the programme (March 2027 – February 2028). Deadline: November 6, 2026.', confidence: 'high', source_url: URL } } })
  if (!a.applied.includes('deadline')) throw new Error(`deadline refused: ${JSON.stringify(a.rejected)}`)
  const b = await mergeGrantUpdate({ id: ID, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: true, pipeline_state: 'published' } })
  console.log('applied', [...a.applied, ...b.applied])
}
main().catch(e => { console.error(e); process.exit(1) })
