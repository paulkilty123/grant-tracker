// Aviva, worked 2026-09-02.
//
// Paul saw "Aviva Communities Fund" (discovery, 15 Aug) in review and asked
// whether it should be split into two funds. It should not: both funds it
// describes are already published as their own rows, each pointing at the
// fund's own page.
//
//   2d0a123a  Aviva Foundation Communities Fund   communitiesfund.avivafoundation.org.uk
//   e0c1a655  Financial Futures Fund              avivafoundation.org.uk/financial-futures-fund
//
// The discovery row points at a general aviva.co.uk page, which is why the
// checker said "page is about a different fund". Rejected as a duplicate,
// the same way the sweep rejects (through the merger, with is_active false,
// so it cannot stay visible while marked rejected).
//
// Deadlines on the two live rows were read off the pages in a browser today:
// Communities Fund "any time throughout the year" (row: rolling, no date);
// Financial Futures "Round two: 7th of October 2026" (row: 2026-10-07). Both
// correct, nothing changed.
//
// The live Communities Fund title carried an em dash, against house copy.
//
//   npx tsx --env-file=.env.local scripts/aviva-duplicate-2026-09-02.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:aviva-2026-09-02'

const DUPLICATE = '03cdaa5a-7ee4-46d2-a724-0b1bbf00a1aa'
const LIVE      = '2d0a123a-2fbd-4fa8-930f-d361d0f21d49'

async function main() {
  const db = getAdminDb()
  const { data: rows, error } = await db.from('scraped_grants')
    .select('id, title, pipeline_state, is_active')
    .in('id', [DUPLICATE, LIVE])
  if (error || !rows || rows.length !== 2) throw new Error(`expected 2 rows, got ${rows?.length}: ${error?.message}`)
  const dup  = rows.find(r => r.id === DUPLICATE)!
  const live = rows.find(r => r.id === LIVE)!
  if (dup.pipeline_state === 'published' || dup.is_active) throw new Error(`duplicate is live: ${dup.pipeline_state}`)
  if (live.pipeline_state !== 'published' || !live.is_active) throw new Error(`live row is not live: ${live.pipeline_state}`)

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log(`  reject  ${dup.title} (${dup.pipeline_state})`)
  console.log(`  retitle ${live.title} -> Aviva Foundation Communities Fund`)
  if (!APPLY) { console.log('  pass --apply to write'); return }

  const a = await mergeGrantUpdate({
    id: DUPLICATE,
    fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: 'duplicate_of_2d0a123a' },
    source: SOURCE, db,
  })
  console.log('  duplicate applied:', a.applied.join(', '), a.rejected.length ? `REJECTED ${JSON.stringify(a.rejected)}` : '')

  const b = await mergeGrantUpdate({
    id: LIVE,
    fields: { title: 'Aviva Foundation Communities Fund' },
    source: SOURCE, db,
  })
  console.log('  live applied:', b.applied.join(', '), b.rejected.length ? `REJECTED ${JSON.stringify(b.rejected)}` : '')
}

main().catch(e => { console.error(e); process.exit(1) })
