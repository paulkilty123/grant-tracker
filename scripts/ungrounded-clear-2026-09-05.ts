// Ffilm Cymru and StreetGames: "amount ungrounded" reads the brief's
// _ungrounded_amounts list, written by enrich-grant when typical_award
// carried a £ figure its citation did not. The figures came out of
// typical_award earlier today; the list is the leftover. Cleared, so the
// row is judged on what its brief now says.
//   npx tsx --env-file=.env.local scripts/ungrounded-clear-2026-09-05.ts --apply
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
async function main() {
  const db = getAdminDb()
  for (const id of ['c1ca1f42-98fa-471c-ad65-b078bf97c20c', 'f7e51198-d22b-484a-bec3-aadbe08fb748']) {
    const { data } = await db.from('scraped_grants').select('title, funder_brief').eq('id', id).single()
    const brief = { ...((data?.funder_brief ?? {}) as Record<string, unknown>) }
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${data?.title} _ungrounded_amounts=${JSON.stringify(brief._ungrounded_amounts)} typical_award has £: ${/£/.test(String(brief.typical_award ?? ''))}`)
    if (!APPLY) continue
    delete brief._ungrounded_amounts
    const r = await mergeGrantUpdate({ id, fields: { funder_brief: brief }, source: 'user_verified:live-and-wrong-2026-09-05', db })
    console.log('  applied:', r.applied.join(', ') || 'nothing')
  }
}
main().catch(e => { console.error(e); process.exit(1) })
