// Persimmon Community Champions — the card said £500–£5,000, the funder says
// up to £6,000. Reported and approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/fix-persimmon-amount-2026-08-18.ts [--dry]
//
// Verified against https://www.persimmonhomes.com/community-champions, which
// says it twice:
//
//   "each of our 30 offices across the UK makes a donation of up to £6,000
//    every quarter to local organisations"
//   "Whilst the programme is running, each of our regional offices makes a
//    donation of up to £6,000 every quarter"
//
// TWO changes, not one. The ceiling was wrong AND the floor was invented.
// The page states no minimum — it says "Smaller donations are also available",
// and the case studies on the same page describe £1,000 awards. So £500 was
// never the funder's floor; it came from `seed:legacy`, the pre-catalogue seed
// data, along with the £5,000. Setting amount_min to null is the faithful
// reading of "up to £6,000" and is what Paul described. Leaving a fabricated
// floor in place while correcting the ceiling would fix the visible half of a
// two-part error.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:paul-review-2026-08-18'
const DRY = process.argv.includes('--dry')
const ID = '3a37a464-8110-4e6f-9591-92baf6254893'
const QUOTE = 'We have 30 offices across the UK that will each make a donation of up to £6,000 every quarter to those local organisations who are the lifeblood of our communities. Smaller donations are also available.'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const fields = { amount_min: null, amount_max: 6000 }
  console.log('── Persimmon Homes — Persimmon Community Champions (LIVE)')
  console.log(`   £500–£5,000  →  up to £6,000`)
  if (DRY) { console.log(`   ${JSON.stringify(fields)} (dry)`); return }
  const citations = {
    amount_min: { snippet: QUOTE, confidence: 'high' as const },
    amount_max: { snippet: QUOTE, confidence: 'high' as const },
  }
  const r = await mergeGrantUpdate({ id: ID, fields, source: SOURCE, db, citations })
  console.log(`   applied:  ${JSON.stringify(r.applied)}`)
  if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
