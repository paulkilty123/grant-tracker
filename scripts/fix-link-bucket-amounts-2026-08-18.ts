// Two amount errors in the link bucket, caught from the rows' own briefs rather
// than a fresh page read: the engine read both pages within the last week and the
// stored figures contradict what it wrote.
//
//   npx tsx --env-file=.env.local scripts/fix-link-bucket-amounts-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-link-bucket-amounts-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-fix-2026-08-18'

const CHANGES = [
  {
    id: '26029120-6cfa-4346-8834-36f77b0af3b2',
    title: 'Social Investment Business — a £5 floor',
    snippet:
      'Its own brief, enriched 2026-08-12: "Loans: £100k–£1.5m per organisation. Blended funds (energy): £25–250k per organisation." The stored floor of £5 appears nowhere and is an extraction artefact.',
    fields: { amount_min: 25000 },
  },
  {
    id: '6481c4e6-975d-4da1-bbd7-e5d6a2c40ef3',
    title: 'Greggs Foundation — ceiling ten times too low',
    snippet:
      'Its own brief, enriched 2026-08-16: "Community Action Fund offers up to £20,000 per year for up to three years." The row is the funder front door and was capped at £2,000, which is the small-grant figure only.',
    fields: { amount_max: 20000 },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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
