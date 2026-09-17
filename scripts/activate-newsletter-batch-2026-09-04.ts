// Activate the eight funds staged from the 4 September newsletter batch.
// Paul reviewed the list and said go.
//
// Selected by source rather than by id, and the count is asserted, so this
// cannot quietly publish something else that has since landed in review.
//
//   npx tsx --env-file=.env.local scripts/activate-newsletter-batch-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:newsletter-batch-2026-09-04'
const STAGED = 'system:newsletter-batch-2026-09-04'
const EXPECTED = 8

async function main() {
  const db = getAdminDb()
  const { data: rows, error } = await db.from('scraped_grants')
    .select('id, title, deadline, is_active, pipeline_state')
    .eq('source', STAGED).eq('pipeline_state', 'tagged_awaiting_review')
    .order('deadline')
  if (error) throw new Error(error.message)
  if (!rows || rows.length !== EXPECTED) throw new Error(`expected ${EXPECTED} staged rows, found ${rows?.length}`)
  if (rows.some(r => r.is_active)) throw new Error('a staged row is already live')

  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of rows) {
    console.log(`  ${String(r.title).slice(0, 48).padEnd(50)} closes ${r.deadline}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, fields: { is_active: true, pipeline_state: 'published' }, source: SOURCE, db })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    if (refused.length) console.log(`     REFUSED ${JSON.stringify(refused)}`)
  }
  if (APPLY) console.log(`\npublished ${rows.length}`)
  if (!APPLY) console.log('\npass --apply to publish')
}
main().catch(e => { console.error(e); process.exit(1) })
