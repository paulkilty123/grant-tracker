// Two rows the amounts session flagged in batch 3, neither about amounts.
//   Family Fund: grants to families with disabled children, not organisations.
//   Out of scope under the audience rule.
//   Donate Computers Programme: the Turing Trust's page for giving them
//   equipment, not receiving any. Nothing for a fundraiser to apply for.
//   npx tsx --env-file=.env.local scripts/amounts-batch3-followups-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
const ROWS = [
  { id: '7e5b73df-1210-42a9-9c24-fafeb8357cef', re: /Family Fund/, code: 'out_of_scope', note: 'grants go to families with disabled or seriously ill children, not to organisations. Brief: "Families with disabled or seriously ill children and young adults on a low income"' },
  { id: '67f13b86-837d-4202-a94c-6e638eb6f14f', re: /Donate Computers/, code: 'non_funder', note: 'the Turing Trust page is for giving them computers, not receiving any; nothing to apply for' },
]
async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data } = await db.from('scraped_grants').select('title').eq('id', r.id).single()
    if (!data || !r.re.test(data.title)) throw new Error(`${r.id}: ${data?.title}`)
    console.log('  reject', data.title, r.code)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: r.id, source: 'user_verified:amounts-2026-09-06', db, fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(r.code, r.note) } })
    console.log('     applied', res.applied)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
