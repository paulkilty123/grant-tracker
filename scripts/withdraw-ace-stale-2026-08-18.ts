// Arts Council England "Capital Investment Programme" — withdrawn as a stale
// news capture. Approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/withdraw-ace-stale-2026-08-18.ts [--dry]
//
// The row's apply_url is an artsprofessional.co.uk news story, which I first
// judged to be a re-point job: find ACE's own page and move the link. Reading
// the article changed the disposition. It is dated Tue 6 June 2023 and
// describes a round whose expression-of-interest stage closed on 3 July 2023,
// with full bids from 25 July to 3 October 2023 and decisions in April 2024.
//
// So the row is not a live fund behind a bad link. It is a three-year-old news
// item about a closed round, and its blocking code `no_current_timing` was
// exactly right. Re-pointing it at an ACE page would have produced a row that
// looked fixed and asserted a round nothing has evidenced — the failure the
// ledger's floor rule exists to prevent. If ACE reopens the programme,
// discovery can find it from the funder's own site.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { writeFileSync } from 'node:fs'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')
const ID = 'd8df8fd2-980e-4bb0-80ac-6718ff64916e'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: before } = await db
    .from('scraped_grants')
    .select('id, title, funder, apply_url, is_active, pipeline_state, rejection_reason, deadline, source')
    .eq('id', ID)

  if (!DRY) {
    writeFileSync('reports/withdraw-ace-2026-08-18.json', JSON.stringify({
      written_at_utc: new Date().toISOString(),
      approved_by: 'Paul, 2026-08-18',
      reason: 'stale_news_capture_2023_round',
      evidence: 'artsprofessional.co.uk article dated Tue 6 June 2023; EOI stage closed 3 July 2023, full bids 25 July to 3 October 2023, decisions April 2024.',
      before,
    }, null, 2))
    console.log('report → reports/withdraw-ace-2026-08-18.json')
  }

  console.log('\n── WITHDRAW Arts Council England — Capital Investment Programme')
  if (DRY) { console.log('   (dry)'); return }
  const res = await mergeGrantUpdate({
    id: ID,
    fields: { pipeline_state: 'rejected', rejection_reason: 'stale_news_capture_2023_round', is_active: false },
    source: SOURCE, db,
  })
  console.log(`   applied:  ${JSON.stringify(res.applied)}`)
  if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
