// Pinned deadlines on recurring funds. A pin stops expire-grants rolling the
// date along the row's own cycle, so when the date passes the row goes dark
// and stays dark. Wise Music (21 Sept) was the second found; this is the sweep.
//
// For every row with a pinned deadline AND a deadline_cycle:
//   * unpin the deadline (provenance edit only; the admin source and trust stay)
//   * if the date has passed and the cycle names a next closing date, write it
//     and bring the row back live, which is exactly what the cron does for an
//     unpinned row (route.ts: "advance the deadline instead of deactivating")
//   * if the cycle names no closing date, leave the row dark and list it
//   * a live row with a future date is only unpinned, so its next roll works
//
//   npx tsx --env-file=.env.local scripts/unpin-cycle-deadlines-2026-09-21.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { nextCycleDeadline, type CycleEntry } from '../src/lib/deadline-cycle'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:expire_grants:unpin-sweep-2026-09-21'
async function main() {
  const db = getAdminDb()
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db.from('scraped_grants')
    .select('id,title,is_active,pipeline_state,deadline,deadline_cycle,field_provenance,next_open_date')
    .not('deadline_cycle', 'is', null).not('pipeline_state', 'in', '("rejected","archived")')
  if (error) throw error
  const rows = (data ?? []).filter(r => {
    const p = (r.field_provenance as Record<string, { pinned?: boolean }> | null)?.deadline
    return p?.pinned === true && Array.isArray(r.deadline_cycle) && r.deadline_cycle.length > 0
  })
  console.log(APPLY ? 'APPLY' : 'DRY RUN', '| pinned deadlines on recurring funds:', rows.length)
  const tally = { unpinOnly: 0, rolledLive: 0, noClosingEntry: 0, refused: 0 }
  for (const r of rows) {
    const passed = typeof r.deadline === 'string' && r.deadline < today
    const dark = !r.is_active
    const next = passed || r.deadline === null ? nextCycleDeadline(r.deadline_cycle as CycleEntry[], today) : null
    const action = (passed || r.deadline === null) ? (next ? `roll to ${next}, back live` : 'no closing entry in cycle, stays dark') : 'unpin only (date still ahead)'
    console.log(`${dark ? 'dark' : 'LIVE'}  ${r.deadline ?? 'no date  '}  ${action.padEnd(36)} ${String(r.title).slice(0, 50)}`)
    if (!APPLY) { if (action.startsWith('roll')) tally.rolledLive++; else if (action.startsWith('no closing')) tally.noClosingEntry++; else tally.unpinOnly++; continue }
    // 1. unpin: provenance only, so the merger's idempotent-by-value rule is not in the way
    const prov = { ...(r.field_provenance as Record<string, unknown>) }
    const dp = { ...(prov.deadline as Record<string, unknown>), pinned: false, note: 'unpinned 21 Sept 2026 so the cycle can roll it' }
    prov.deadline = dp
    const { error: e1 } = await db.from('scraped_grants').update({ field_provenance: prov }).eq('id', r.id)
    if (e1) throw e1
    if (!next) { tally[action.startsWith('no closing') ? 'noClosingEntry' : 'unpinOnly']++; continue }
    // 2. roll, as the cron would
    const res = await mergeGrantUpdate({ db, id: r.id, source: SRC, fields: { deadline: next, is_active: true, next_open_date: null } })
    if (res.applied.includes('deadline')) tally.rolledLive++
    else { tally.refused++; console.log('   refused', JSON.stringify(res.rejected)) }
  }
  console.log('\n', JSON.stringify(tally))
}
main().catch(e => { console.error(e); process.exit(1) })
