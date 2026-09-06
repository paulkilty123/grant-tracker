// Percy Bilton Charity: two live rows, one on the homepage (3.5KB, two
// sentences) and one on the applyOrg page (both grant strands, exclusions).
// Keep the applyOrg row, reject the homepage row as a duplicate.
// The kept row's £750 to £5,000 is mis-shaped: the page says small grants
// "up to £750" and large grants "of approximately £2,000 and over (the
// majority of grants fall within the range of £2,000 to £5,000)". No hard
// ceiling is stated, so under the amounts rule the range goes to prose.
//   npx tsx --env-file=.env.local scripts/percy-bilton-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const KEEP = 'ec9ece5f-4d9b-48fc-a117-8347391f5197', DROP = '50203489-dcd2-44ec-9a3e-7035b825b4fb'
const URL = 'https://www.percy-bilton-charity.org/applyOrg'
async function main() {
  const db = getAdminDb()
  const { data: keep } = await db.from('scraped_grants').select('title, apply_url, funder_brief, amount_min, amount_max').eq('id', KEEP).single()
  const { data: drop } = await db.from('scraped_grants').select('title, apply_url').eq('id', DROP).single()
  if (!keep || keep.apply_url !== URL || !drop || !/Percy Bilton/.test(drop.title)) throw new Error('rows not as expected')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', '\n  keep', keep.title, `${keep.amount_min}-${keep.amount_max} -> null-null, range in prose\n  drop`, drop.title, drop.apply_url, '-> duplicate')
  if (!APPLY) return
  const brief = { ...(keep.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.typical_award = 'Small grants up to £750 for furniture and equipment. Large grants of approximately £2,000 and over, with most between £2,000 and £5,000; no ceiling is stated.'
  cits.typical_award = { snippet: 'approximately £2,000 and over (the majority of grants fall within the range of £2,000 to £5,000)', confidence: 'high', source_url: URL }
  brief._citations = cits
  const a = await mergeGrantUpdate({ id: KEEP, source: 'user_verified:amounts-2026-09-06', db, fields: { amount_min: null, amount_max: null, funder_brief: brief },
    citations: { amount_max: { snippet: 'approximately £2,000 and over (the majority of grants fall within the range of £2,000 to £5,000)', confidence: 'high', source_url: URL } } })
  console.log('  keep applied', a.applied, a.rejected.filter(x => x.reason !== 'idempotent'))
  const b = await mergeGrantUpdate({ id: DROP, source: 'user_verified:amounts-2026-09-06', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('duplicate', `same charity as Percy Bilton Charity Grants ${KEEP}, which links to the fuller applyOrg page`) } })
  console.log('  drop applied', b.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
