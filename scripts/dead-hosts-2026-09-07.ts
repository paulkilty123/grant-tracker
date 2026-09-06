// Two hidden rows whose hosts are gone, found by the verdicts session:
//   Foundation East CDFI Loans: foundationeast.org now serves a gambling
//   affiliate site under the charity's name ("EE Pay By Mobile Casino UK ...
//   | Foundation East"). A 200 that is not the funder.
//   FSI Small Charity Training: thefsi.org serves a bare directory index.
// Both rejected as dead_url. Neither was live.
//   npx tsx --env-file=.env.local scripts/dead-hosts-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { id: '29d000d3-e3fa-439e-89f8-e03109af0f44', re: /Foundation East/, note: 'domain taken over: foundationeast.org serves a casino affiliate site titled "EE Pay By Mobile Casino UK ... | Foundation East" (read 7 Sept 2026)' },
  { id: 'e31c28ad-10a0-4d7c-9076-33c8f8cf91e9', re: /FSI/, note: 'thefsi.org serves a bare Apache directory index; the Foundation for Social Improvement site is gone (read 7 Sept 2026)' },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title, is_active').eq('id', r.id).single()
    if (!data || !r.re.test(data.title) || data.is_active) throw new Error(`${r.id}: ${data?.title} active=${data?.is_active}`)
    console.log('  reject', data.title)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, source: 'user_verified:verdicts-2026-09-07', db, fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason('dead_url', r.note) } })
    console.log('     applied', res.applied)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
