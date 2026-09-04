// Albert Gubay Charitable Foundation, second pass 2026-09-04.
//
// This morning's edit put the round wording in next_open_date on a row with
// no deadline and is_rolling false. matching.ts reads that combination as a
// closed watch-list fund and caps the score at 35; Bramble's card dropped
// from 74% to 35% within the hour. The foundation accepts applications at
// any time and considers them at trustee meetings, so the row is rolling
// and the meeting wording lives in decision_timeline.
//
//   npx tsx --env-file=.env.local scripts/gubay-rolling-2026-09-04.ts --apply

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:yapp-gubay-2026-09-04'
const ID     = '9d9da328-3680-4c33-9da2-4e7cdcbaca8c'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, is_rolling, next_open_date, funder_brief').eq('id', ID).single()
  if (!/Gubay/.test(row?.title ?? '')) throw new Error(`wrong row: ${row?.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: rolling ${row!.is_rolling} -> true; next_open_date -> null`)
  if (!APPLY) return
  const brief = { ...(row!.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.decision_timeline = 'Applications are accepted at any time and considered at trustee meetings. Applications submitted now go to the December 2026 meeting, for project costs from 1 January 2027.'
  brief.open_status = 'open'
  cits.decision_timeline = { snippet: 'Applications submitted now will be considered at our December 2026 trustee meeting, for project costs incurred from the 1st of January 2027.', confidence: 'high', source_url: 'https://www.albertgubayfoundation.org/applications/' }
  brief._citations = cits
  const r = await mergeGrantUpdate({
    id: ID,
    fields: { is_rolling: true, deadline: null, next_open_date: null, next_open_date_parsed: null, funder_brief: brief },
    source: SOURCE, db,
    citations: { is_rolling: { snippet: 'Applications submitted now will be considered at our December 2026 trustee meeting', confidence: 'high' } },
  })
  console.log('applied:', r.applied.join(', '), r.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(r.rejected) : '')
}
main().catch(e => { console.error(e); process.exit(1) })
