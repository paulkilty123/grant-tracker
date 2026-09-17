// Two pile B publish rows, checked before Paul sees them.
//   Focus Foundation: the row's £1,000 to £1,000,000 was a scrape reading the
//   applicant income cap ("annual income of less than £1m") as a ceiling and
//   the quick-grant size ("typically funding tangible items for under
//   £1,000") as a floor. Both wrong. Amounts cleared, the cap goes to
//   max_org_income, the quick-grant size to prose.
//   D'Oyly Carte: the checker read "Charities with an annual income under
//   £250,000 may apply for unrestricted funding"; the row held no cap.
//   npx tsx --env-file=.env.local scripts/pileb-batch3-followups-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const SRC = 'user_verified:verdicts-2026-09-07'
async function main() {
  const db = getAdminDb()
  const { data: focus } = await db.from('scraped_grants').select('id, title, amount_min, amount_max, funder_brief').eq('id', '67025b88-4512-44ec-ae3b-d5c9329038b4').single()
  const { data: doyly } = await db.from('scraped_grants').select('id, title, max_org_income').eq('id', '6add973c-430a-482b-98e9-366ecd2e6a7a').single()
  if (!focus || focus.title !== 'Focus Foundation' || !doyly || !/D'Oyly Carte/.test(doyly.title)) throw new Error('rows not as expected')
  console.log(APPLY ? 'APPLY' : 'DRY RUN', `\n  Focus Foundation ${focus.amount_min}-${focus.amount_max} -> null-null, max_org_income 1000000\n  D'Oyly Carte max_org_income ${doyly.max_org_income} -> 250000`)
  if (!APPLY) return
  const FURL = 'https://www.focusfoundation.org.uk/apply-for-a-grant'
  const brief = { ...(focus.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.typical_award = 'Quick grants are typically for tangible items under £1,000, decided in about four weeks. The page states no ceiling for larger requests.'
  cits.typical_award = { snippet: 'typically funding tangible items for under £1,000, with a turnaround time of approximately 4 weeks', confidence: 'high', source_url: FURL }
  brief._citations = cits
  const a = await mergeGrantUpdate({ id: focus.id, source: SRC, db, fields: { amount_min: null, amount_max: null, max_org_income: 1000000, funder_brief: brief },
    citations: { amount_max: { snippet: 'The charity or community group needs to have an annual income of less than £1m', confidence: 'high', source_url: FURL },
      max_org_income: { snippet: 'The charity or community group needs to have an annual income of less than £1m', confidence: 'high', source_url: FURL } } })
  console.log('  focus applied', a.applied, a.rejected.filter(x => x.reason !== 'idempotent'))
  const b = await mergeGrantUpdate({ id: doyly.id, source: SRC, db, fields: { max_org_income: 250000 },
    citations: { max_org_income: { snippet: 'Charities with an annual income under £250,000 may apply for unrestricted funding.', confidence: 'high', source_url: 'https://doylycartecharitabletrust.org/our-work/' } } })
  console.log('  doyly applied', b.applied, b.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
