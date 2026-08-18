// Live and wrong, second pass — the rows that were not in the gate's set when I
// started, so they were never worked.
//
//   npx tsx --env-file=.env.local scripts/fix-live-and-wrong-batch2-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-live-and-wrong-batch2-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:live-and-wrong-2026-08-18'

const CHANGES = [
  {
    id: '6e6fc005-7390-4000-b43c-8220faafb17b',
    title: 'Leeds CF mental health fund — live, but already awarded',
    snippet:
      'The whole of the funder\'s page, read via the reader proxy: "Almost £85,000 has been invested in 10 Community Organisations through Addressing Mental Health Inequalities in Minority Ethnic Groups Grants, in partnership with Synergi." Past tense, ten grants made, no open round and no reopening stated.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'historical_deadline: the funder\'s page reports the round in the past tense, almost £85,000 already invested across 10 organisations with Synergi, and states no open round or reopening. The row was live and invited applications to a fund that has been awarded. Withdrawn 2026-08-18.',
    },
  },
  {
    id: '1765c329-ba73-4c58-b779-1eb0db6fc87a',
    title: 'Microsoft Tech for Social Impact — duplicate of Microsoft for Nonprofits',
    snippet:
      'Two live rows for the same Microsoft offer: free and discounted Microsoft software and cloud services for nonprofits. This row points at microsoft.com/en-us/nonprofits, the sibling at nonprofit.microsoft.com/en-us/getting-started, which is the page that actually starts an application.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'duplicate: same offer as the Microsoft for Nonprofits row, which points at the getting-started page rather than the marketing landing page. Both were live, so a user searching for donated software saw Microsoft twice. Withdrawn 2026-08-18.',
    },
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
