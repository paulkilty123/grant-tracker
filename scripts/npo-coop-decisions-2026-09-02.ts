// Paul's two decisions from the queue-zero day, 2026-09-02.
//
// 1. National Portfolio Investment Programme 2028-33: publish as upcoming.
//    The existing mechanism is the "Opens …" badge: the row is live with
//    next_open_date set, and check-coming-soon clears the badge and routes the
//    row to review on next_open_date_parsed so a deadline can be set. Arts
//    Council says "Our next update will be in September, when we publish
//    Applicant Guidance", with no opening date, so the parsed date is 1
//    October 2026: the day after the month the guidance is promised, when a
//    person should look. Fully automatic go-live is not possible for this
//    host: artscouncil.org.uk bot-walls the checker.
// 2. Co-op Local Community Fund: rejected as out of scope. Causes apply, then
//    members choose where the money goes; the Waitrose token scheme went the
//    same way the same day.
//
//   npx tsx --env-file=.env.local scripts/npo-coop-decisions-2026-09-02.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:paul-decisions-2026-09-02'
const NPO  = 'b7b435e3-33de-40cf-973e-e43b9f2a95fd'
const COOP = '495e8cbc-a7b4-4de1-984f-26f856832259'

async function main() {
  const db = getAdminDb()
  const { data: rows } = await db.from('scraped_grants').select('id, title, is_active, pipeline_state').in('id', [NPO, COOP])
  if (!rows || rows.length !== 2) throw new Error('expected 2 rows')
  for (const r of rows) console.log(`  ${r.title}: ${r.pipeline_state}/${r.is_active ? 'live' : 'hidden'}`)
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  if (!APPLY) return

  const a = await mergeGrantUpdate({
    id: NPO,
    fields: {
      is_active: true, pipeline_state: 'published',
      funding_type: 'grant', amount_min: 50000,
      next_open_date: 'Applicant guidance due September 2026; applications to follow. Multi-year funding from April 2028.',
      next_open_date_parsed: '2026-10-01',
    },
    source: SOURCE, db,
    citations: {
      next_open_date: { snippet: 'Our next update will be in September, when we publish Applicant Guidance.', confidence: 'high' },
      amount_min:     { snippet: 'from £50,000 per year', confidence: 'high' },
    },
  })
  console.log('NPO applied:', a.applied.join(', '), a.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(a.rejected) : '')

  const b = await mergeGrantUpdate({
    id: COOP,
    fields: {
      is_active: false, pipeline_state: 'rejected',
      rejection_reason: formatRejectReason('out_of_scope', 'member-choice scheme: causes apply, then Co-op members pick where the money goes. Paul, 2026-09-02. Page: "Co-op Members can choose the local cause they want to support through their membership."'),
    },
    source: SOURCE, db,
  })
  console.log('Co-op applied:', b.applied.join(', '))
}
main().catch(e => { console.error(e); process.exit(1) })
