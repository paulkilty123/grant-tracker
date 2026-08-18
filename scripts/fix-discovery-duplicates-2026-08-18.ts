// The two discovery duplicates that are LIVE to users.
//
// Measured 2026-08-18: of 93 rows discovery has ever created, 24 duplicate a fund
// already in the catalogue. 11 of those are still sitting in the review queue and
// 3 are live. One of the three is the CAST row consolidated separately; these are
// the other two.
//
// Why dedup missed them: it keys on exact title and URL, and discovery varies
// both. "Postcode Society Trust Grants" against "Postcode Society Trust (South
// England including London)", /funding-guide/ against /apply-for-a-grant. Social
// Business Trust is worse — the same funder on two different domains,
// socialbusinesstrust.org and sbtrust.org.uk, so even a domain match fails.
//
// The live duplicate is the harmful one in the Postcode case: it carries no round
// dates, so it reads as open, while the canonical row correctly sits out until
// round 3 opens on 25 August. Its £20,000 ceiling is real and is carried across
// rather than discarded with the row.
//
//   npx tsx --env-file=.env.local scripts/fix-discovery-duplicates-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-discovery-duplicates-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:discovery-dedup-2026-08-18'

const CHANGES = [
  {
    id: 'ec676c7f-93b3-404c-aaf9-7bb1ec71b83b',
    title: 'Postcode Society Trust (canonical) — inherit the £20,000 ceiling',
    snippet:
      'From the duplicate discovery row being withdrawn, whose funding-guide page states: grants of up to £20,000 to help small and medium UK charities strengthen civil society and tackle inequality.',
    fields: { amount_max: 20000 },
  },
  {
    id: '87669e69-0000-0000-0000-000000000000', // resolved by URL below
    title: 'Postcode Society Trust Grants (discovery copy) — withdrawn',
    snippet:
      'Second row for the same trust, created by discovery_queue on 26 July against /funding-guide/ while the March row sits on /apply-for-a-grant. It is live and carries no round dates, so it reads as open; the canonical row is correctly out of view until round 3 opens at 9am on 25 August 2026.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'duplicate: same trust as Postcode Society Trust (South England including London), which carries the verified 2026 round dates. This copy was live with no dates, implying the fund was open when round 3 does not open until 25 August. Its £20,000 ceiling has been carried across. Withdrawn 2026-08-18.',
    },
  },
  {
    id: 'a846666d-0000-0000-0000-000000000000', // resolved by URL below
    title: 'Social Business Trust Growth Programme (discovery copy) — withdrawn',
    snippet:
      'Third row for Social Business Trust, after a catalogue-seed row from April and another discovery row from 11 August. Both live rows describe the same offer: funding plus intensive pro bono business support for scaling social enterprises.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'duplicate: same funder and same offer as Social Business Trust — Strategic Growth Support, which is live and describes the pro bono package in more detail. Social Business Trust was entered three times across two domains, socialbusinesstrust.org and sbtrust.org.uk. Withdrawn 2026-08-18.',
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Resolve the two discovery rows by their URL rather than a padded id.
  for (const [idx, url] of [
    [1, 'https://www.postcodesocietytrust.org.uk/funding-guide/'],
    [2, 'https://www.socialbusinesstrust.org/'],
  ] as [number, string][]) {
    const { data } = await db.from('scraped_grants').select('id').eq('apply_url', url).maybeSingle()
    if (data?.id) CHANGES[idx].id = data.id
    else { console.log(`(row for ${url} not found — aborting)`); process.exit(1) }
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
    if (r.rejected?.length) { console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
