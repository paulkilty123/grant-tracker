// Rows with a deadline_cycle, no deadline and not rolling: give each the next
// cut-off its own cycle implies, through the merger so pins hold. The rule
// itself now lives in mergeGrantUpdate (firstDeadlineFromCycle); this is the
// one-off for rows written before it existed. Found 21 Sept 2026 on Britford.
//
//   npx tsx --env-file=.env.local scripts/backfill-cycle-first-deadline-2026-09-21.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate, firstDeadlineFromCycle } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'system:expire_grants:first-date-backfill-2026-09-21'
async function main() {
  const db = getAdminDb()
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db.from('scraped_grants').select('id,title,is_active,pipeline_state,deadline_cycle,deadline,is_rolling')
    .is('deadline', null).not('is_rolling', 'is', true).not('deadline_cycle', 'is', null).not('pipeline_state', 'in', '("rejected","archived")')
  if (error) throw error
  const rows = (data ?? []).filter(r => Array.isArray(r.deadline_cycle) && r.deadline_cycle.length > 0)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', '| candidates', rows.length)
  let would = 0, none = 0, applied = 0, refused = 0
  for (const r of rows) {
    const next = firstDeadlineFromCycle({ cycle: r.deadline_cycle, deadline: r.deadline, isRolling: r.is_rolling, todayISO: today })
    if (!next) { none++; continue }
    would++
    console.log(`${r.is_active ? 'LIVE ' : '     '} ${next}  ${r.title.slice(0, 60)}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ db, id: r.id, source: SRC, fields: { deadline: next } })
    if (res.applied.includes('deadline')) applied++
    else { refused++; console.log('   refused', JSON.stringify(res.rejected)) }
  }
  console.log(`\ncycle names a closing date: ${would}; cycle has no closing entry (left alone): ${none}${APPLY ? `; applied ${applied}, refused ${refused}` : ''}`)
}
main().catch(e => { console.error(e); process.exit(1) })
