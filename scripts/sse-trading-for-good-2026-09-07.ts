// School for Social Entrepreneurs, read 7 Sept from the programmes index and
// the Trading for Good pages. Every Trading for Good programme is closed:
// Community Business says "when the application window opens in Spring 2027
// we will send you information about applying"; Bury, Milton Keynes and
// Stockport run from November 2027. Under the one-month rule all five rows
// are parked with Spring 2027, including the umbrella row, which was rolling
// with no date. Nothing here goes live.
//   npx tsx --env-file=.env.local scripts/sse-trading-for-good-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const CB = 'https://www.the-sse.org/programme/trading-for-good-community-business/'
const ROWS = ['b4b7b06a-3916-48eb-a633-5c21a0d563c1', 'a06424c3-643c-458c-8f97-a228cef657a6', '8b5c4025-318d-4354-a766-228b361ffba3', '15eaab1e-d531-403b-a4da-d7c75c3b113b', 'dc32afec-6ae0-4e3c-aca0-50792a6b9b40']
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, is_active, pipeline_state, next_open_date, next_open_date_parsed, is_rolling, deadline').in('id', ROWS)
  if (!data || data.length !== 5 || data.some(r => r.is_active)) throw new Error('expected five hidden rows')
  console.log(APPLY ? 'APPLY' : 'DRY RUN'); data.forEach(r => console.log('  ', r.title.padEnd(40), r.pipeline_state, r.next_open_date ?? '(no date)', '-> between_rounds_scheduled, Spring 2027'))
  if (!APPLY) return
  for (const r of data) {
    const a = await mergeGrantUpdate({ id: r.id, source: 'user_verified:sse-2026-09-07', db, fields: { next_open_date: 'Spring 2027', is_rolling: false, deadline: null },
      citations: { next_open_date: { snippet: 'Register interest below and when the application window opens in Spring 2027 we will send you information about applying.', confidence: 'high', source_url: CB } } })
    const parsedOk = a.applied.includes('next_open_date') || r.next_open_date === 'Spring 2027'
    const b = await mergeGrantUpdate({ id: r.id, source: 'user_verified:sse-2026-09-07', db, fields: { ...(parsedOk ? { next_open_date_parsed: '2027-03-01' } : {}), is_active: false, pipeline_state: 'between_rounds_scheduled' } })
    console.log('  ', r.title.padEnd(40), [...a.applied, ...b.applied].join(','), a.rejected.filter(x => x.reason !== 'idempotent').map(x => x.field + ':' + x.reason).join(',') || '')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
