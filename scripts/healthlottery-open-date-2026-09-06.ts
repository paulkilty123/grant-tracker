// The Health Lottery Foundation: next_open_date_parsed was 2027-04-20, taken
// from "April–May 2026 round closed ... not yet announced". The prose names
// no next date, so the parsed date is null. Found by auditing every
// next_open_date that names two years, after the Opus timing session caught
// parseOpenDate taking the first year in a sentence (Brighton, batch 2).
//   npx tsx --env-file=.env.local scripts/healthlottery-open-date-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, next_open_date_parsed').ilike('title', '%Health Lottery Foundation%').eq('is_active', true)
  if (!data || data.length !== 1) throw new Error(`expected one row, got ${data?.length}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data[0].title, data[0].next_open_date_parsed, '-> null')
  if (!APPLY) return
  const r = await mergeGrantUpdate({ id: data[0].id, source: 'user_verified:timing-audit-2026-09-06', db, fields: { next_open_date_parsed: null },
    citations: { next_open_date_parsed: { snippet: 'Next Arts & Activity round timing not yet announced', confidence: 'high' } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
