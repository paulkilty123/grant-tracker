// Anglian Water's Thriving Communities Fund, duplicate row via a community
// foundation signpost page. Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/withdraw-anglian-dup-2026-08-18.ts [--dry]
//
// The row points at Leicestershire & Rutland Community Foundation's news post
// about the fund, which says in its own text: "This fund is being delivered by
// Cambridgeshire Community Foundation." So LLR is signposting somebody else's
// fund and the page is not an application route.
//
// The catalogue already carries the fund itself as c904362e, which was worked
// earlier tonight by the other session: between_rounds_scheduled, next round
// deadline 1 February 2027, funder enrolled on the watchlist. That is the row
// to keep.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { writeFileSync } from 'node:fs'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')
const ID = 'fdd7e177-a012-4a71-bc09-eb005183ce64'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: before } = await db
    .from('scraped_grants')
    .select('id, title, funder, apply_url, is_active, pipeline_state, rejection_reason, deadline, amount_min, amount_max')
    .eq('id', ID)

  if (!DRY) {
    writeFileSync('reports/withdraw-anglian-dup-2026-08-18.json', JSON.stringify({
      written_at_utc: new Date().toISOString(),
      approved_by: 'Paul, 2026-08-18',
      reason: 'duplicate_of_c904362e',
      evidence: 'LLR Community Foundation page: "Anglian Water\'s Thriving Communities Fund ... offers grants of between £10,000 and £100,000 ... This fund is being delivered by Cambridgeshire Community Foundation."',
      before,
    }, null, 2))
    console.log('report → reports/withdraw-anglian-dup-2026-08-18.json')
  }

  console.log("\n── WITHDRAW Anglian Water's Thriving Communities Fund (LLR signpost)")
  if (DRY) { console.log('   (dry)'); return }
  const r = await mergeGrantUpdate({
    id: ID,
    fields: { pipeline_state: 'rejected', rejection_reason: 'duplicate_of_c904362e', is_active: false },
    source: SOURCE, db,
  })
  console.log(`   applied:  ${JSON.stringify(r.applied)}`)
  if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
