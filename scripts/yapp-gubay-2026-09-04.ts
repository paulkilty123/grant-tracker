// Yapp Charitable Trust and Albert Gubay Charitable Foundation, 2026-09-04.
// Paul wants both cards right for the demo video.
//
// Yapp: the card said "Amount not disclosed" under a description that says
// £3,000. The 2 September sweep read how-to-apply, which states no figure;
// the homepage does: "Grants are normally for a maximum of £3,000 per year
// and we will fund for up to three years." Restored, homepage attached as a
// source. Same shape as The Fore earlier today.
//
// Gubay: the applications page states no amount at all, so "Amount on
// application" is the truth and stays. What it does state is the round:
// "Applications submitted now will be considered at our December 2026
// trustee meeting, for project costs incurred from the 1st of January 2027."
// That replaces "Check website" on the card.
//
//   npx tsx --env-file=.env.local scripts/yapp-gubay-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:yapp-gubay-2026-09-04'
const YAPP   = '757e41c3-07dd-4f84-9f4f-9588a4bcfd41'
const YAPP_HOME = 'https://yappcharitabletrust.org.uk/'
const GUBAY_APPS = 'https://www.albertgubayfoundation.org/applications/'

async function main() {
  const db = getAdminDb()
  const { data: yapp } = await db.from('scraped_grants').select('id, title, amount_max, amount_undisclosed, grant_sources').eq('id', YAPP).single()
  if (!/Yapp/.test(yapp?.title ?? '')) throw new Error(`wrong row: ${yapp?.title}`)
  const { data: gubays } = await db.from('scraped_grants').select('id, title, next_open_date, grant_sources').ilike('title', 'Albert Gubay%').eq('is_active', true)
  if (!gubays || gubays.length !== 1) throw new Error(`expected 1 Gubay row, got ${gubays?.length}`)
  const gubay = gubays[0]
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}`)
  console.log(`  Yapp: amount_max ${yapp!.amount_max}, undisclosed ${yapp!.amount_undisclosed} -> 3000, false`)
  console.log(`  Gubay: next_open_date ${JSON.stringify(gubay.next_open_date)} -> December 2026 trustee meeting`)
  if (!APPLY) return

  const ySources = Array.isArray(yapp!.grant_sources) ? yapp!.grant_sources as unknown[] : []
  const a = await mergeGrantUpdate({
    id: YAPP,
    fields: {
      amount_min: null, amount_max: 3000, amount_undisclosed: false,
      grant_sources: [...ySources, { url: YAPP_HOME, label: 'Homepage (grant size), read 2026-09-04', added_at: '2026-09-04' }],
    },
    source: SOURCE, db,
    citations: {
      amount_max:         { snippet: 'Grants are normally for a maximum of £3,000 per year and we will fund for up to three years.', confidence: 'high' },
      amount_undisclosed: { snippet: 'Grants are normally for a maximum of £3,000 per year and we will fund for up to three years.', confidence: 'high' },
    },
  })
  console.log('  Yapp applied:', a.applied.join(', '), a.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(a.rejected) : '')

  const gSources = Array.isArray(gubay.grant_sources) ? gubay.grant_sources as unknown[] : []
  const b = await mergeGrantUpdate({
    id: gubay.id,
    fields: {
      next_open_date: 'Applications submitted now go to the December 2026 trustee meeting, for costs from 1 January 2027',
      next_open_date_parsed: null,
      grant_sources: [...gSources, { url: GUBAY_APPS, label: 'Applications page (round), read 2026-09-04', added_at: '2026-09-04' }],
    },
    source: SOURCE, db,
    citations: { next_open_date: { snippet: 'Applications submitted now will be considered at our December 2026 trustee meeting, for project costs incurred from the 1st of January 2027.', confidence: 'high' } },
  })
  console.log('  Gubay applied:', b.applied.join(', '), b.rejected.filter(x => x.reason !== 'idempotent').length ? JSON.stringify(b.rejected) : '')
}
main().catch(e => { console.error(e); process.exit(1) })
