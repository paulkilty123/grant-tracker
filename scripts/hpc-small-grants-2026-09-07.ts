// HPC Community Fund Small Grants (Somerset CF), a pile B publish verdict.
// The page: "Grant size: Up to £30,000", "Most of our grants range from
// £5,000 to £10,000", "Local groups normally running on under £250,000",
// "This Fund is open all year round. There are 6 deadlines during the year",
// next deadline Monday 19 October. The row held £10,000 (the typical, not
// the ceiling) and a deadline on a rolling row, which the expiry cron skips.
// Ceiling to £30,000, typical to prose, income cap set, and the row is rolling
// with the next panel date in prose rather than a deadline that would strand.
//   npx tsx --env-file=.env.local scripts/hpc-small-grants-2026-09-07.ts [--apply]
import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
const APPLY = process.argv.includes('--apply')
const ID = '9cf129d2-9e1c-43d0-9627-032cf46ba18a'
const URL = 'https://www.somersetcf.org.uk/grants-funding/details/hpc-community-fund-small-grants/'
async function main() {
  const db = getAdminDb()
  const { data } = await db.from('scraped_grants').select('title, amount_max, deadline, is_rolling, funder_brief').eq('id', ID).single()
  if (!data || !/HPC Community Fund Small/.test(data.title)) throw new Error(`wrong row: ${data?.title}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN', data.title, `max ${data.amount_max} -> 30000; deadline ${data.deadline} -> null (rolling, next panel in prose); income cap 250000`)
  if (!APPLY) return
  const brief = { ...(data.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.typical_award = 'Up to £30,000 over up to three years; most grants are £5,000 to £10,000. Requests under £1,000 are welcome, and grants up to £5,000 may be decided more quickly.'
  brief.decision_timeline = 'Open all year with six deadlines a year and decisions about every two months. The next deadline is Monday 19 October 2026 at 5pm.'
  brief.open_status = 'open'
  cits.typical_award = { snippet: 'Most of our grants range from £5,000 to £10,000', confidence: 'high', source_url: URL }
  cits.decision_timeline = { snippet: 'Next deadline is Monday 19 October, by 5pm', confidence: 'high', source_url: URL }
  brief._citations = cits
  const r = await mergeGrantUpdate({ id: ID, source: 'user_verified:verdicts-2026-09-07', db,
    fields: { amount_max: 30000, deadline: null, is_rolling: true, max_org_income: 250000, funder_brief: brief },
    citations: { amount_max: { snippet: 'Grant size: Up to £30,000, to be spent in up to 3 years', confidence: 'high', source_url: URL },
      is_rolling: { snippet: 'This Fund is open all year round', confidence: 'high', source_url: URL },
      max_org_income: { snippet: 'Local groups normally running on under £250,000', confidence: 'high', source_url: URL } } })
  console.log('applied', r.applied, r.rejected.filter(x => x.reason !== 'idempotent'))
}
main().catch(e => { console.error(e); process.exit(1) })
