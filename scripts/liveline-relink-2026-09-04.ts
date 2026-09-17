// Music Venue Trust Liveline Fund, 2026-09-04. Paul: point it at
// livelinefund.uk/funding-overview#find-your-fund, which is current. Read
// today: four strands (Guarantorship Scheme, Local Scene Development Fund,
// Tour Extension & Regional Access Fund, Genre Specific Safety & Access
// Fund), "Round 1 applications are now closed" and "applications for
// Liveline Round 2 Funding will open in October". No amounts on the page.
// Applicants are "promoters, in-house bookers, artists or their
// representatives", "independent promoters or venues", "collectives"; no
// legal form is named, so structures are left as they are.
//
//   npx tsx --env-file=.env.local scripts/liveline-relink-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:liveline-2026-09-04'
const ID     = 'af62f99d-c5c0-44bf-a653-27bdc8a69081'
const URL    = 'https://livelinefund.uk/funding-overview#find-your-fund'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, apply_url, funder_brief').eq('id', ID).single()
  if (!/Liveline/.test(row?.title ?? '')) throw new Error(`wrong row: ${row?.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${row!.apply_url} -> ${URL}`)
  if (!APPLY) return
  const brief = { ...(row!.funder_brief as Record<string, unknown>) }
  const cits = { ...((brief._citations as Record<string, unknown>) ?? {}) }
  brief.what_they_fund = 'Four strands for the grassroots music ecosystem: a Guarantorship Scheme covering up to 80% of losses on individual shows or tours; a Local Scene Development Fund covering venue hire for regular programming; a Tour Extension and Regional Access Fund for travel and accommodation to reach remote areas such as the Highlands and Islands, West Wales and Northern Ireland; and a Genre Specific Safety and Access Fund for genres facing structural or operational barriers.'
  brief.who_can_apply = 'Promoters, in-house bookers, artists or their representatives, independent promoters or venues, and collectives working in grassroots live music across the UK. The page names no legal form.'
  brief.how_to_apply = 'Choose a strand under Find your fund on livelinefund.uk. Round 1 has closed; Round 2 applications open in October 2026.'
  brief.decision_timeline = 'Round 1 closed. Round 2 opens in October 2026.'
  brief.open_status = 'between_rounds'
  cits.what_they_fund = { snippet: 'a range of funding models designed to unlock activity across the grassroots music ecosystem', confidence: 'high', source_url: URL }
  cits.who_can_apply = { snippet: 'promoters, in-house bookers, artists or their representatives ... independent promoters or venues ... collectives', confidence: 'high', source_url: URL }
  cits.decision_timeline = { snippet: 'Round 1 applications are now closed ... applications for Liveline Round 2 Funding will open in October', confidence: 'high', source_url: URL }
  brief._citations = cits
  brief.last_enriched = '2026-09-04'

  const r = await mergeGrantUpdate({
    id: ID,
    fields: {
      title: 'Music Venue Trust Liveline Fund',
      apply_url: URL, url_status: 'unchecked',
      description: 'The Liveline Fund, delivered by Music Venue Trust with Save Our Scene UK, AIP and Live Trust, backs grassroots live music through four strands: a guarantorship scheme covering up to 80% of losses on shows or tours, a local scene development fund for venue hire, a tour extension and regional access fund for remote areas, and a genre-specific safety and access fund. For promoters, bookers, venues, artists and collectives across the UK. Round 1 closed; Round 2 opens in October 2026.',
      next_open_date: 'Round 2 applications open in October 2026',
      next_open_date_parsed: '2026-10-01',
      funder_brief: brief,
    },
    source: SOURCE, db,
    citations: {
      apply_url:      { snippet: 'Find your fund', confidence: 'high' },
      next_open_date: { snippet: 'applications for Liveline Round 2 Funding will open in October', confidence: 'high' },
    },
  })
  console.log('applied:', r.applied.join(', '))
  const refused = r.rejected.filter(x => x.reason !== 'idempotent')
  if (refused.length) console.log('REFUSED:', JSON.stringify(refused))
}
main().catch(e => { console.error(e); process.exit(1) })
