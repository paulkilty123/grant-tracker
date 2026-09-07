// Fill funding_subtypes on live grants that have none, from the spending
// facts the row already holds (read off pages by earlier enrichment):
//   spend_types includes 'capital'      -> 'capital'
//   spend_restriction = 'unrestricted'  -> 'unrestricted'
//   spend_restriction = 'restricted'    -> 'restricted'
// Rows with neither fact recorded are left for a reading job. Rows that
// already carry a subtype are not touched. Paul, 7 Sept: the card's type
// label should say Restricted, Unrestricted or Capital, and most did not.
//   npx tsx --env-file=.env.local scripts/derive-grant-subtypes-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  const { data, error } = await db.from('scraped_grants').select('id, title, spend_types, spend_restriction, funding_subtypes')
    .eq('is_active', true).eq('pipeline_state', 'published').eq('funding_type', 'grant')
  if (error) throw error
  const plan: { id: string; title: string; to: string[] }[] = []
  let already = 0, nothing = 0
  for (const r of data ?? []) {
    if (Array.isArray(r.funding_subtypes) && r.funding_subtypes.length) { already++; continue }
    const spend = Array.isArray(r.spend_types) ? r.spend_types as string[] : []
    const to: string[] = []
    if (spend.includes('capital')) to.push('capital')
    if (r.spend_restriction === 'unrestricted') to.push('unrestricted')
    else if (r.spend_restriction === 'restricted') to.push('restricted')
    if (!to.length) { nothing++; continue }
    plan.push({ id: r.id, title: r.title, to })
  }
  const byCombo = plan.reduce<Record<string, number>>((a, p) => { const k = p.to.join('+'); a[k] = (a[k] ?? 0) + 1; return a }, {})
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${data?.length} live grants, ${already} already tagged, ${nothing} with nothing recorded, ${plan.length} to derive`, byCombo)
  if (!APPLY) { plan.slice(0, 8).forEach(p => console.log('  ', p.title.slice(0, 50).padEnd(50), p.to.join('+'))); return }
  let done = 0
  for (const p of plan) {
    const r = await mergeGrantUpdate({ id: p.id, source: 'system:derive-subtypes-2026-09-07', db, fields: { funding_subtypes: p.to } })
    if (r.applied.includes('funding_subtypes')) done++
  }
  const { count } = await db.from('scraped_grants').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('pipeline_state', 'published').eq('funding_type', 'grant').or('funding_subtypes.is.null,funding_subtypes.eq.{}')
  console.log(`applied ${done}; live grants still without a subtype: ${count}`)
}
main().catch(e => { console.error(e); process.exit(1) })
