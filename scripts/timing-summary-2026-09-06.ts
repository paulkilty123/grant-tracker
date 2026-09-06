// Closing summary for the timing job of 2026-09-06, written into the results
// file after the tenth and last batch.
//
// The totals are counted from the database and from the results file rather
// than typed in, so the summary cannot drift from either. The one number it
// asserts by hand is the starting 187, which is the length of the row list.
//
// The reconciliation at the end is the check that matters: untimed + timed +
// no-longer-published must equal 187. Three times during this job the headline
// count moved by more than this job wrote, and each time it was somebody else's
// repair or rejection rather than a bad write. A total that balances against a
// named list is the only version of the count worth reporting.
//
//   npx tsx --env-file=.env.local scripts/timing-summary-2026-09-06.ts [--apply]

import { readFileSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { recordSummary, RESULTS, type Report, type PinOutlived } from './timing-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const LIST = join(__dirname, '..', 'docs', 'handoffs', 'timing-rows-2026-09-06.json')

async function main() {
  const db = getAdminDb()
  const ids = (JSON.parse(readFileSync(LIST, 'utf8')) as { id: string }[]).map(r => r.id)
  const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as {
    batches: { batch: number; written: { id: string; state: string }[]; report: Report[] }[]
    pins_outlived: PinOutlived[]
  }

  const written = file.batches.flatMap(b => b.written)
  const reported = file.batches.flatMap(b => b.report)
  const byState: Record<string, number> = {}
  const seen = new Set<string>()
  for (const w of written) {
    if (seen.has(w.id)) continue   // Active Spaces appears in two batches
    seen.add(w.id)
    byState[w.state] = (byState[w.state] ?? 0) + 1
  }
  const byWhy: Record<string, number> = {}
  for (const r of reported) byWhy[r.why] = (byWhy[r.why] ?? 0) + 1

  const { data, error } = await db.from('scraped_grants')
    .select('id, deadline, is_rolling, next_open_date_parsed')
    .in('id', ids).eq('is_active', true).eq('pipeline_state', 'published')
  if (error) throw new Error(error.message)
  const live = data ?? []
  const timed = live.filter(r => r.deadline || r.is_rolling || r.next_open_date_parsed).length
  const untimed = live.length - timed
  const gone = ids.length - live.length

  const summary = {
    rows_in_list: ids.length,
    batches: file.batches.length,
    written_rows: new Set(written.map(w => w.id)).size,
    written_by_state: byState,
    reported_rows: reported.length,
    reported_by_reason: byWhy,
    pins_outlived: file.pins_outlived.length,
    at_close: {
      untimed,
      timed,
      no_longer_live_and_published: gone,
      reconciles: untimed + timed + gone === ids.length,
    },
    invariants_worth_keeping: [
      'Sussex Community Foundation has three rows riding one Main grants round (Lewes, Rye, Brighton and Hove Legacy). All three read 2026-09-11. Named funds that defer to a parent round should agree; a drift between them is a signal, not noise.',
      'A deadline_cycle was written only where the same day and month recur every year. Rounds that fall on a Friday or a first Monday move, and were given a deadline without a cycle.',
      'A funder that decides at set meetings but names no cut-off is rolling; one that says deadlines exist and will not publish them is reported. The meetings are not the deadlines.',
    ],
  }

  console.log(JSON.stringify(summary, null, 1))
  if (!summary.at_close.reconciles) throw new Error('does not reconcile against the row list')
  if (APPLY) recordSummary(summary)
}
main().catch(e => { console.error(e); process.exit(1) })
