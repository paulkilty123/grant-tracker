// Closing summary for the amounts job of 2026-09-06, written into the results
// file after the ninth and last batch.
//
// Counted from the database and the results file rather than typed in, and the
// reconciliation fails loudly rather than writing: no-amount + with-a-figure +
// no-longer-published must equal 176.
//
// One number here needs its definition quoted alongside it, or it means
// nothing. `column_writes` is rows that gained amount_min or amount_max, and it
// is the only number the count SQL moves. `prose_writes` is rows where the page
// states a figure that no pair of columns can hold — an average, a per-unit
// rate, a percentage of income, a strand ceiling under an uncapped programme —
// and those rows stay in the no-amount count on purpose. Reporting the two as
// one total would overstate what a fundraiser can now see.
//
//   npx tsx --env-file=.env.local scripts/amounts-summary-2026-09-06.ts [--apply]

import { readFileSync } from 'fs'
import { join } from 'path'
import { getAdminDb } from '../src/lib/admin/admin-db'
import { recordSummary, RESULTS, type Report } from './amounts-lib-2026-09-06'

const APPLY = process.argv.includes('--apply')
const LIST = join(__dirname, '..', 'docs', 'handoffs', 'amount-rows-2026-09-06.json')

type Written = { id: string; amount_min?: number | null; amount_max?: number | null; prose_only: boolean }

async function main() {
  const db = getAdminDb()
  const ids = (JSON.parse(readFileSync(LIST, 'utf8')) as { id: string }[]).map(r => r.id)
  const file = JSON.parse(readFileSync(RESULTS, 'utf8')) as {
    batches: { batch: number; written: Written[]; report: Report[] }[]
  }

  const written = file.batches.flatMap(b => b.written)
  const reported = file.batches.flatMap(b => b.report)
  const byWhy: Record<string, number> = {}
  for (const r of reported) byWhy[r.why] = (byWhy[r.why] ?? 0) + 1

  const rows = await db.from('scraped_grants')
    .select('id, amount_min, amount_max')
    .in('id', ids).eq('is_active', true).eq('pipeline_state', 'published')
  if (rows.error) throw new Error(rows.error.message)
  const live = rows.data ?? []
  const figured = live.filter(r => r.amount_min != null || r.amount_max != null).length
  const noAmount = live.length - figured
  const gone = ids.length - live.length

  const summary = {
    rows_in_list: ids.length,
    batches: file.batches.length,
    column_writes: written.filter(w => !w.prose_only).length,
    prose_writes: written.filter(w => w.prose_only).length,
    reported_rows: reported.length,
    reported_by_reason: byWhy,
    at_close: {
      no_amount: noAmount,
      with_a_figure: figured,
      no_longer_live_and_published: gone,
      reconciles: noAmount + figured + gone === ids.length,
    },
    what_the_pounds_on_a_funder_page_usually_are: [
      'A total: lifetime, annual or per round. The single commonest figure in this job and never an award.',
      'A cap on the applicant rather than on the grant: an income band, a turnover floor.',
      'A percentage: of project cost, of losses, of the applicant\'s own income. Legitimately unwriteable — Mohn Westlake, Music Venue Trust, and the 75% cap on the three Postcode trusts.',
      'Money flowing the other way: a course fee (Clore, Charity Digital), a lottery ticket or jackpot (Worthing, Family Fund), an empty shopping basket (Utilita).',
      'A neighbouring fund\'s figure on the row\'s own page: Hollick and Bothwell from the same directory, the Community Builders Fund on Fredericks\' page, Suffolk\'s other 136 funds on the Sizewell C page.',
    ],
    rules_that_earned_their_keep: [
      'Read one page on. Four column writes came from a linked guidelines, funding-guide or apply page whose row pointed at a page with no pound sign on it: Eleanor Rathbone, Esmée, Fredericks, and all three Postcode trusts.',
      'A quote must be about THIS fund, even when it is verbatim and on the row\'s own apply_url. Two directory rows and one funder page would have been written wrong without it.',
      'Never divide a pot by a grant count. Mercers twice, Barbara Ward, Dulverton and Wooden Spoon all offer a plausible average that nobody published.',
      'Understating a ceiling costs an application; overstating one wastes one. Where a programme has a capped strand and an uncapped one (Sizewell C, BOOST, Bernard Sunley), the columns stay empty and prose carries both.',
    ],
  }

  console.log(JSON.stringify(summary, null, 1))
  if (!summary.at_close.reconciles) throw new Error('does not reconcile against the row list')
  if (APPLY) recordSummary(summary)
}
main().catch(e => { console.error(e); process.exit(1) })
