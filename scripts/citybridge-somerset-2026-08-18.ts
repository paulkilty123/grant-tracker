// The three City Bridge programmes and the Somerset Alliance row.
// Approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/citybridge-somerset-2026-08-18.ts [--dry]
//
// TWO OF THESE WERE `no_brief`, AND NEITHER NEEDED A BRIEF.
//
// Racial Justice and Economic Justice were blocked as "never enriched", which
// reads as a job for the enrichment pipeline. Both pages say the programme is
// still in development and not receiving applications. Enriching them would
// have spent a page read and an LLM call to produce a well-written description
// of a fund nobody can apply to, and left the row exactly as unpublishable.
// What they needed was a state. Worth remembering when sizing the other
// `no_brief` rows: the code means the brief is null, not that a brief is the
// missing thing.
//
// between_rounds_scheduled rather than archived, deliberately: migration 057
// fires on entering that state and enrols the funder on the watchlist, which is
// the mechanism that notices City Bridge reopening. Archiving would make these
// invisible to expire-grants forever, since that cron only selects is_active.
// No next_open_date_parsed is set, because none of the three pages gives a date
// — the watchlist is the return path here, not a date.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { writeFileSync } from 'node:fs'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')

const BETWEEN_ROUNDS = [
  {
    id: 'e28f625b-3041-490d-9c52-193c2328c58f',
    title: 'City Bridge Foundation — Access to Justice',
    quote: 'We are not currently receiving applications. We\'ll share details of future funding opportunities on this page as they\'re confirmed. In May 2026, we awarded £6.5m of funding to 20 organisations across London in round one.',
    next_open: 'Round one closed; funded cohort announced May 2026. City Bridge says future opportunities will be posted on the programme page. No date given.',
  },
  {
    id: '54eca97d-8580-48a6-a3ad-812f2fcff625',
    title: 'City Bridge Foundation — Racial Justice',
    quote: 'We are not currently receiving applications. The Racial Justice programme is currently in development.',
    next_open: 'Programme in development, not receiving applications. No date given.',
  },
  {
    id: '1805dc7a-5123-42d2-b283-dce6b6098556',
    title: 'City Bridge Foundation — Economic Justice',
    quote: 'We are not currently receiving applications. While this funding programme is still in development, we\'re not able to accept applications.',
    next_open: 'Programme in development, not receiving applications. No date given.',
  },
]

const TAG = [
  {
    id: '471c6f5f-3bab-4cd1-b472-a1807f991c10',
    title: 'Somerset Crisis and Resilience Alliance',
    quote: "We're looking for 2 types of Voluntary, Community, Faith, and Social Enterprise (VCFSE) partners to establish a joined-up, visible local support network: Community Anchors, which will be larger, established VCSFE groups with paid staff and a physical presence. Community Connectors, which will be smaller.",
    fields: {
      eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    },
    note: 'Unincorporated included on purpose: the page explicitly wants smaller Community Connectors and faith groups, which are frequently unconstituted. Deadline of 4 Sep already stored and confirmed by the page ("Apply by: Friday 4 September 2026, by 5pm").',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const ids = [...BETWEEN_ROUNDS.map(r => r.id), ...TAG.map(r => r.id)]
  const { data: before } = await db
    .from('scraped_grants')
    .select('id, title, is_active, pipeline_state, next_open_date, next_open_date_parsed, eligible_structures, deadline')
    .in('id', ids)
  if (!DRY) {
    writeFileSync('reports/citybridge-somerset-2026-08-18.json', JSON.stringify({
      written_at_utc: new Date().toISOString(), approved_by: 'Paul, 2026-08-18',
      between_rounds: BETWEEN_ROUNDS, tag: TAG, before,
    }, null, 2))
    console.log('report → reports/citybridge-somerset-2026-08-18.json')
  }

  for (const r of BETWEEN_ROUNDS) {
    console.log(`\n── BETWEEN ROUNDS ${r.title}`)
    if (DRY) { console.log('   (dry)'); continue }
    const res = await mergeGrantUpdate({
      id: r.id,
      fields: { pipeline_state: 'between_rounds_scheduled', is_active: false, next_open_date: r.next_open },
      source: SOURCE, db,
      citations: { next_open_date: { snippet: r.quote.slice(0, 300), confidence: 'high' as const } },
    })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }

  for (const r of TAG) {
    console.log(`\n── TAG ${r.title}`)
    console.log(`   ${r.note}`)
    if (DRY) { console.log(`   ${JSON.stringify(r.fields)} (dry)`); continue }
    const res = await mergeGrantUpdate({
      id: r.id, fields: r.fields, source: SOURCE, db,
      citations: { eligible_structures: { snippet: r.quote.slice(0, 300), confidence: 'high' as const } },
    })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
