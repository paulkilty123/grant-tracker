// Withdraw the rows in the Needs-reading / Nothing-truthful lot that need no
// page read: one news article ingested as a fund, and two duplicates of rows
// that already cover them. Approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/withdraw-no-read-2026-08-18.ts [--dry]
//
// Writes reports/withdrawals-2026-08-18.json BEFORE touching a row, because a
// withdrawal has no other copy. Every row here is already is_active = false, so
// nothing changes for a user either way.
//
// THREE, NOT SIX. The first pass classified four rows as "news articles" from
// their headline-shaped titles. The URLs disagreed on two of them: LNER and
// Bernard Sunley point at the FUNDER'S OWN grant page, so they are real funds
// carrying a bad title and, for LNER, a null funder. Those go to the reading
// work instead. Arts Council England's Capital Investment Programme is a real
// programme whose apply_url points at an artsprofessional.co.uk news story —
// a re-point, not a withdrawal. Judging by title is what CLAUDE.md warns about
// and it got 3 of 6 wrong here.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { writeFileSync } from 'node:fs'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')
const REPORT = 'reports/withdrawals-2026-08-18.json'

type Withdrawal = { id: string; title: string; reason: string; why: string }

const ROWS: Withdrawal[] = [
  {
    id: '5fac2acd-2a0b-4fdd-ab41-cb1e212f87d7',
    title: 'Bentley opens new national grants programme to strengthen support for charities',
    reason: 'news_article_not_a_fund',
    why: 'apply_url is https://www.bentleymedia.com/en/newsitem/1787-... — a press release on Bentley\'s media site, not a fund page. funder is null and the title is the headline verbatim. Ingested by source "homeless_link".',
  },
  {
    id: 'dfb1f774-4977-4466-b756-f48af6472bf1',
    title: 'Heart of Yorkshire Fund for the Selby District',
    reason: 'duplicate_of_48dcfee3',
    why: 'Identical title AND identical apply_url to 48dcfee3, which is the older row (first seen 22 Jun vs 27 Jul), is pipeline_state=published and carries the fund\'s deadline history. This is the later duplicate capture from source "two_ridings_cf".',
  },
  {
    id: '22e1c850-9454-47f7-85b5-c2f05a1a3556',
    title: 'Supporting people aged over 65 to be independent, healthy and socially included',
    reason: 'duplicate_of_7f128498',
    why: 'Same apply_url as 7f128498 "The Pargiter Trust Fund", which is LIVE, published, has a brief and a deadline of 31 Aug. This row has no brief at all and no deadline. Community Foundation Tyne & Wear titles its pages by purpose; the named fund is the row to keep. If the live row\'s title is the wrong one, that is a title fix on 7f128498, not a reason to keep an empty duplicate.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: before } = await db
    .from('scraped_grants')
    .select('id, title, funder, apply_url, is_active, pipeline_state, rejection_reason, deadline')
    .in('id', ROWS.map(r => r.id))

  const report = {
    written_at_utc: new Date().toISOString(),
    approved_by: 'Paul, 2026-08-18',
    note: 'Reversal: set pipeline_state back to the value in `before` and clear rejection_reason.',
    withdrawals: ROWS,
    before,
  }
  if (!DRY) {
    writeFileSync(REPORT, JSON.stringify(report, null, 2))
    console.log(`report → ${REPORT}`)
  }

  for (const r of ROWS) {
    console.log(`\n── ${r.title.slice(0, 62)}`)
    console.log(`   reason: ${r.reason}`)
    if (DRY) { console.log('   (dry)'); continue }
    const res = await mergeGrantUpdate({
      id: r.id,
      fields: { pipeline_state: 'rejected', rejection_reason: r.reason, is_active: false },
      source: SOURCE,
      db,
    })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
