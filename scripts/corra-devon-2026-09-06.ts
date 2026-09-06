// Two decisions from Paul, 2026-09-06.
//   Corra Micro Grants: rolling. The page says "It is a rolling fund, so
//   there is no fixed closing date." The 21 August ruling read the bimonthly
//   panels as dated rounds; they are decision dates, not closing dates.
//   Admin source, because it overrides an admin ruling.
//   Devon Community Foundation: off live. Every current fund is longlist,
//   randomised shortlist and invitation; there is no open application.
//   npx tsx --env-file=.env.local scripts/corra-devon-2026-09-06.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  const get = async (id: string, re: RegExp) => {
    const { data } = await db.from('scraped_grants').select('id, title').eq('id', id).single()
    if (!data || !re.test(data.title)) throw new Error(`${id}: ${data?.title}`)
    return data
  }
  const corra = await get('08bdec62-f80f-43dd-ad82-43f80787494c', /Corra.*Micro Grants/)
  const devon = await get('c34f6859-efee-491f-98e8-aa560f2c0b35', /Devon Community Foundation/)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', '\n ', corra.title, '-> rolling\n ', devon.title, '-> rejected (invitation only)')
  if (!APPLY) return
  const a = await mergeGrantUpdate({ id: corra.id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_rolling: true, deadline: null },
    citations: { is_rolling: { snippet: 'It is a rolling fund, so there is no fixed closing date.', confidence: 'high', source_url: 'https://www.corra.scot/grants/alcohol-and-drugs-fund-local-support-fund-micro-grants/' } } })
  console.log('  corra applied', a.applied, a.rejected.filter(x => x.reason !== 'idempotent'))
  const b = await mergeGrantUpdate({ id: devon.id, source: 'admin:paulkilty1@gmail.com', db, fields: { is_active: false, pipeline_state: 'rejected',
    rejection_reason: formatRejectReason('out_of_scope', 'invitation only: every current fund is longlist, randomised shortlist and invitation, no open application. Page: "Invitation to apply; we will invite the number of organisations we are able to fund"') } })
  console.log('  devon applied', b.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
