// Oglesby Spotlight: Local Climate Action. The checker read the income cap
// the verdict tidy did not carry: "Organisations and groups with an annual
// income of under £250,000 are invited to apply." Column only; row stays
// hidden until Paul publishes it.
//   npx tsx --env-file=.env.local scripts/oglesby-income-cap-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('id, title, apply_url, max_org_income, is_active').ilike('title', 'Spotlight: Local Climate Action%').eq('is_active', false)
  if (!data || data.length !== 1) throw new Error(`expected one row, got ${data?.length}`)
  const r = data[0]
  console.log(APPLY ? 'APPLY' : 'DRY RUN', r.title, r.max_org_income, '-> 250000')
  if (!APPLY) return
  const res = await mergeGrantUpdate({ id: r.id, source: 'user_verified:verdicts-2026-09-07', db, fields: { max_org_income: 250000 },
    citations: { max_org_income: { snippet: 'Organisations and groups with an annual income of under £250,000 are invited to apply.', confidence: 'high', source_url: r.apply_url } } })
  console.log('applied', res.applied, res.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
