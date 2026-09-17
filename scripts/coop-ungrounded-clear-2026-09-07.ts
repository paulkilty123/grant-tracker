// Charity and Co-operative Lending Fund sat under Judgement on
// amount_ungrounded: the brief's how_to_apply names £250,000 (the page's
// threshold between the email route and a Relationship Manager), and the
// guard only looks for figures in field_evidence, where the checker quoted
// the £25,020 floor and the £10m ceiling but not this threshold. The page
// states it: "For loans under £250,000 ... £250,000 or more". Cleared, same
// as Ffilm and StreetGames on 5 Sept.
//   npx tsx --env-file=.env.local scripts/coop-ungrounded-clear-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = 'e1ae0341-15ae-4c05-98b5-18fed2989a88'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, funder_brief').eq('id', ID).single()
  if (!data || !/Co-operative Lending/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, '_ungrounded_amounts', brief._ungrounded_amounts, '-> cleared')
  if (!APPLY) return
  delete brief._ungrounded_amounts
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:verdicts-2026-09-07', db, fields: { funder_brief: brief } })
  console.log('applied', r.applied)
}
main().catch(e => { console.error(e); process.exit(1) })
