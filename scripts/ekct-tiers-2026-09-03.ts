// Ernest Kleinwort Charitable Trust, the three grant ranges, 2026-09-03.
//
// ekct.org.uk/apply/ (read in a browser today; the host bot-walls fetches):
//   Small   up to £10,000            accepted throughout the year
//   Medium  £10,001 to £20,000       four windows: 4 Jan–4 Feb, 18 Apr–12 May,
//                                    10 Jul–13 Aug, 9 Oct–12 Nov
//   Large   over £20,001             two windows, but "restricted to charities
//                                    with whom the trustees have built up a deep
//                                    understanding and/or close relationship
//                                    over a period of several years", form
//                                    password protected. Not a public route,
//                                    so no row: a confirmed no-route is not a
//                                    fund a user can apply to.
//
// The Medium row's cycle held eight dates, opens and closes alike, so the
// expire cron would have rolled a closing date onto an OPENING date. Closes
// only now. The Small row had no amount, no rolling flag.
//
//   npx tsx --env-file=.env.local scripts/ekct-tiers-2026-09-03.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:ekct-tiers-2026-09-03'
const MEDIUM = 'b6add755-6f1c-453b-9cfe-54e6b88b3f6d'
const SMALL  = 'daf20da3-2ce9-498f-a0bd-e6f3abce6651'

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  if (!APPLY) return

  const m = await mergeGrantUpdate({
    id: MEDIUM,
    fields: {
      title: 'Ernest Kleinwort Charitable Trust Medium Grants',
      amount_min: 10001, amount_max: 20000,
      deadline: '2026-11-12', is_rolling: false,
      deadline_cycle: [
        { day: 4,  month: 2,  label: 'Winter window closes' },
        { day: 12, month: 5,  label: 'Spring window closes' },
        { day: 13, month: 8,  label: 'Summer window closes' },
        { day: 12, month: 11, label: 'Autumn window closes' },
      ],
      next_open_date: 'Next window 9 October to 12 November 2026; four windows a year',
      next_open_date_parsed: '2026-10-09',
    },
    source: SOURCE, db,
    citations: {
      deadline:       { snippet: 'Medium Grant — £10,001 to £20,000 ... 9th October – 12th November', confidence: 'high' },
      deadline_cycle: { snippet: '4th January – 4th February, 18th April – 12th May, 10th July – 13th August, 9th October – 12th November', confidence: 'high' },
      amount_min:     { snippet: 'Medium Grant — £10,001 to £20,000', confidence: 'high' },
    },
  })
  console.log('Medium applied:', m.applied.join(', '), m.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(m.rejected) : '')

  const s = await mergeGrantUpdate({
    id: SMALL,
    fields: {
      title: 'Ernest Kleinwort Charitable Trust Small Grants',
      amount_min: null, amount_max: 10000, is_rolling: true, deadline: null,
    },
    source: SOURCE, db,
    citations: {
      amount_max: { snippet: 'Small Grant — up to £10,000. Applications accepted throughout the year.', confidence: 'high' },
      is_rolling: { snippet: 'Small grant applications are accepted throughout the year.', confidence: 'high' },
    },
  })
  console.log('Small applied:', s.applied.join(', '), s.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(s.rejected) : '')
}
main().catch(e => { console.error(e); process.exit(1) })
