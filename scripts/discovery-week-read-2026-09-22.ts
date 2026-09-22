// Paul, 22 Sept: "read all the needs reading grants manually, not via the API".
// The 16 discovery-week rows read by fetch; what the pages changed is below.
//   npx tsx --env-file=.env.local scripts/discovery-week-read-2026-09-22.ts
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const SRC = 'system:discovery-week-read-2026-09-22'
const FIX: { id: string; why: string; fields: Record<string, unknown> }[] = [
  { id: 'dc2eb270-cf2e-4531-a7ab-77e0ebefb308', why: 'ECB Building Belonging: projects are identified and applications initiated by county cricket boards, not by clubs; nothing an organisation applies to',
    fields: { is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason('out_of_scope', 'Applications are initiated by Recreational Cricket Boards from county facilities strategies; a club or charity cannot apply directly (ecb.co.uk, read 22 Sept 2026)') } },
  { id: '798323fe-e8ea-42aa-8bf9-086a385d6773', why: 'Equity Charitable Trust: page says spending is typically in the region of £5K',
    fields: { amount_max: 5000, amount_undisclosed: false } },
  { id: 'fb2c7933-45bb-445d-aa3d-3dafdc008a50', why: 'Funding Differently: £5k tier for income under £50k, £10k tier for £40k to £150k; closes 23:59 on 21 Oct',
    fields: { max_org_income: 150000 } },
  { id: '95772b99-4cc7-48f5-8109-242d1c43cc89', why: 'Savoy: trustee meeting deadlines 7 Aug, 22 Oct, 21 Jan',
    fields: { deadline_cycle: [{ day: 7, month: 8, label: 'For the September meeting' }, { day: 22, month: 10, label: 'For the December meeting' }, { day: 21, month: 1, label: 'For the March meeting' }] } },
]
async function main() {
  const db = getAdminDb()
  for (const f of FIX) {
    const { data } = await db.from('scraped_grants').select('id,title').eq('id', f.id).single()
    if (!data) { console.log('missing', f.id); continue }
    const r = await mergeGrantUpdate({ db, id: data.id, source: SRC, fields: f.fields })
    console.log(data.title.slice(0, 50), '|', f.why.slice(0, 60), '| applied', r.applied.join(','), r.rejected.length ? '| refused ' + JSON.stringify(r.rejected.map(x => x.field + ':' + x.reason)) : '')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
