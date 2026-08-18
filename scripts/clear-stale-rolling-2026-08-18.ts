// Two stale `is_rolling` flags, cleared through mergeGrantUpdate so the trust
// ladder and provenance apply. Both carry a verbatim quote from the funder's
// own page. Approved by Paul, 2026-08-18.
//
//   npx tsx scripts/clear-stale-rolling-2026-08-18.ts [--dry]
//
// Neither row is activated or deactivated here. One field each.
//
// Source is `user_verified:` (trust 70) rather than `system:` (50) on purpose.
// Both current values are `scraper:` writes flagged backfilled, so they sit at
// 35 and either source would win — but 70 is what a reviewed-and-decided value
// is worth on this ladder, and unlike `admin:` (100) it does NOT auto-pin, so a
// later page read can still correct these if a fund genuinely becomes rolling.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:paul-review-2026-08-18'
const DRY = process.argv.includes('--dry')

type Change = { id: string; title: string; snippet: string; fields: Record<string, unknown> }

const CHANGES: Change[] = [
  // Deadline verified against the funder's page on 11 Aug; the rolling flag was
  // never revisited after an April scraper set it. Closes in 3 days.
  {
    id: '2d515d44-595b-421a-8d7d-90b2b32b50e8',
    title: "Skinners' Company Charity Programme — clear stale rolling flag",
    snippet: 'the deadline for full applications falling a week later, on 21 August 2026',
    fields: { is_rolling: false },
  },
  // Left behind by the reopen-date fix earlier today: the row is now between
  // rounds with a scheduled re-open, so "rolling" is wrong. It matters because
  // check-coming-soon hands this row back on 1 September, and it would return
  // asserting Rolling with no deadline — ledger item A6.
  {
    id: 'b57b4b82-8fc5-4a5c-8aa9-9563293c8823',
    title: 'One Stop Community Partnership Programme — clear stale rolling flag',
    snippet: 'This programme is currently closed for applications and will re-open on Tuesday 1 September 2026.',
    fields: { is_rolling: false },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
