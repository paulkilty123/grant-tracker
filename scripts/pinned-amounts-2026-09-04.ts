// Two pinned amounts the funders' own pages contradict, 2026-09-04.
//
// Both were pinned by Paul on 1 June and both blocked a user_verified write
// during the newsletter batch. Read today:
//
//   One Stop Community Partnership — we hold £1,000. groundwork.org.uk:
//     "invites local community groups to apply for funding of up to £500".
//   Shoosmiths Foundation — we hold £230,000. The foundation page states no
//     grant figure at all, and £230,000 appears nowhere on it. Nulled rather
//     than replaced: the honest state is "no figure published".
//
// This is the "wrong, not missing" case from the publish gate: a figure a
// fundraiser is sized against that the funder never published. Admin trust,
// because only admin outranks the pin.
//
//   npx tsx --env-file=.env.local scripts/pinned-amounts-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'admin:paulkilty1@gmail.com'

const ROWS = [
  {
    id: 'b57b4b82-8fc5-4a5c-8aa9-9563293c8823', title: 'One Stop Community Partnership Programme',
    fields: { amount_max: 500 },
    quote: 'The One Stop Community Partnership programme invites local community groups to apply for funding of up to £500.',
  },
  {
    id: 'f635ceba-ed4a-4d76-8260-fe10bf6adf0e', title: 'Shoosmiths Foundation',
    fields: { amount_max: null },
    quote: 'The foundation page states no grant amount; the £230,000 held appears nowhere on it. Read 2026-09-04.',
  },
]

async function main() {
  const db = getAdminDb()
  console.log(APPLY ? 'APPLY' : 'DRY RUN')
  for (const r of ROWS) {
    const { data: row } = await db.from('scraped_grants').select('title, amount_max').eq('id', r.id).single()
    if (!row || !row.title.toLowerCase().startsWith(r.title.slice(0, 10).toLowerCase())) throw new Error(`wrong row: ${row?.title}`)
    console.log(`  ${r.title.padEnd(42)} ${row.amount_max} -> ${r.fields.amount_max}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({
      id: r.id, fields: r.fields, source: SOURCE, pinned: true, db,
      citations: { amount_max: { snippet: r.quote, confidence: 'high' } },
    })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`     applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? ` REFUSED ${JSON.stringify(refused)}` : ''}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
