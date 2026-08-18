// "The page does not describe this fund" — the structural half, worked 2026-08-18.
//
// 33 not-live rows carry this code. Before reading a single funder page, four
// resolve from what we already hold, and none of the four is a link problem:
//
//   - two pairs of rows for one fund, both pairs from `discovery_queue`
//   - a funding SEARCH PORTAL carried as a fund
//   - a news headline carried as a fund title, but pointing at the funder's own
//     grants page, so it is repairable rather than junk
//
// The same three shapes as the dead-link half: duplication, wrong-thing-is-a-fund,
// and a title that never described a fund in the first place.
//
//   npx tsx --env-file=.env.local scripts/fix-different-fund-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-different-fund-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-fix-2026-08-18'

type Change = { id: string; title: string; snippet: string; fields: Record<string, unknown> }

const CHANGES: Change[] = [
  {
    id: 'ee13e1f9-84ed-4f34-aa1d-3af3c8073f02',
    title: 'Creative Foundations Fund (Round 2) — duplicate of the CFF row',
    snippet:
      'Two discovery_queue rows for one Arts Council fund: discovery-creative-foundations-fund-cff-round-2 points at the fund\'s own page, this one at the /our-open-funds hub. Same fund, same round.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'duplicate: same Arts Council fund and round as Creative Foundations Fund (CFF) Round 2, which points at the fund\'s own page rather than the open-funds hub. Both were created by discovery_queue. Withdrawn 2026-08-18.',
    },
  },
  {
    id: '0ab57b5d-a2ae-4c44-879b-80fb1e4d06cf',
    title: 'Power to Change /our-funds/ — duplicate, and the URL is a soft 404',
    snippet:
      'powertochange.org.uk/our-funds/ returns the site\'s "We could not find that" page while url_status records ok, so it is a soft 404. The sibling row on /our-funding/ carries the same funder and the same offer with a working page.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'duplicate: same funder and same offer as the Community Business Funding Programmes row on /our-funding/, and this row\'s /our-funds/ URL is a soft 404 that url_status still records as ok. Withdrawn 2026-08-18.',
    },
  },
  {
    id: '7a217b55-4b41-46c0-b9c4-c126eccb1361',
    title: 'Find a Grant (GLA portal) — a directory, not a fund',
    snippet:
      'Our own description says it: "A searchable directory of current funding opportunities offered by the Greater London Authority across multiple programmes." There is no fund here to apply to.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'non_funder: a funding search portal listing other GLA opportunities, not a fund. Nothing here to apply for. Withdrawn 2026-08-18.',
    },
  },
  {
    id: 'c51eaae1-0000-0000-0000-000000000000', // resolved by external_id below
    title: 'Bernard Sunley — a news headline as a title, over a real grants page',
    snippet:
      'The stored link resolves to a live page titled "Social Welfare Grants - Bernard Sunley Foundation" on the foundation\'s own domain. The row title was the headline of the Homeless Link listing that found it, and the funder field was never set.',
    fields: {
      title: 'Bernard Sunley Foundation — Social Welfare Grants',
      funder: 'Bernard Sunley Foundation',
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve the Bernard Sunley row by its external_id rather than a truncated id.
  const { data: bs } = await db
    .from('scraped_grants')
    .select('id')
    .eq('external_id', 'homeless_link_funding-opportunity-bernard-sunley')
    .maybeSingle()
  if (bs?.id) CHANGES[3].id = bs.id
  else {
    CHANGES.splice(3, 1)
    console.log('(Bernard Sunley row not found by external_id — skipped)')
  }

  let applied = 0
  let refused = 0
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) {
      console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
      refused += r.rejected.length
    }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
