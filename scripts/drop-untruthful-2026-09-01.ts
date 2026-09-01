// Drop the three "Nothing truthful to show" rows. Paul, 2026-09-01: "Nothing
// truthful to show 3: drop them."
//
// Same write the Reject button makes (ReviewQueue.tsx `reject`): is_active
// false, pipeline_state rejected, a coded rejection_reason. None of the three
// is live, none is tracked-field work, so nothing here touches provenance.
//
// Preconditions are asserted per row so a row that has moved since the queue
// was read fails loudly instead of being rejected on stale grounds. Afterwards
// the public page of each is fetched and must answer 410 (the middleware caches
// the gone set for five minutes per instance, so a 404 straight after the write
// is the cache, not a failure; the script says which it saw).
//
// DB writes and public-page fetches only. No model call.
//
// DRY BY DEFAULT.  npx tsx scripts/drop-untruthful-2026-09-01.ts [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { formatRejectReason } from '../src/lib/admin/reject-reasons'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const LIVE = process.argv.includes('--live')
const NOTE = 'Paul, 2026-09-01: nothing truthful to show, dropped'
const ORIGIN = 'https://www.shootsfunding.co.uk'

const ROWS: { id: string; title: string; code: string; why: string }[] = [
  { id: 'cc8a885c-bb12-4939-bf8e-7641851bc8c6', title: 'Resources for Charities and Community Groups (Meeting Space Listings)',
    code: 'non_funder', why: 'a London Plus resources round-up from March 2025, not a fund; the only date it holds has gone' },
  { id: '470d8fd8-3e7d-47bf-918b-4101019881c8', title: 'Get Grants FREE Virtual Conference 2026',
    code: 'non_funder', why: 'a conference listing with no funder; nobody applies to it for money' },
  { id: '35493b1d-2da1-4f6b-8814-75c16eec96c9', title: "Let's Celebrate Towns",
    code: 'closed_for_good', why: 'the page says the programme is no longer listed' },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  console.log(LIVE ? '── LIVE ──' : '── DRY RUN — nothing will be written ──')

  const { data, error } = await db.from('scraped_grants')
    .select('id, external_id, title, funder, is_active, pipeline_state, rejection_reason')
    .in('id', ROWS.map(r => r.id))
  if (error) { console.error(error.message); process.exit(1) }
  if ((data ?? []).length !== ROWS.length) { console.error(`expected ${ROWS.length} rows, found ${(data ?? []).length}`); process.exit(2) }

  let bad = 0
  for (const r of ROWS) {
    const row = (data ?? []).find(d => d.id === r.id)!
    const ok = row.is_active === false && row.pipeline_state === 'tagged' && row.title === r.title
    if (!ok) bad++
    console.log(`${ok ? 'ok ' : 'BAD'} ${row.title}  (${row.pipeline_state}, active=${row.is_active})`)
    console.log(`     -> rejected, ${formatRejectReason(r.code, NOTE)}`)
    console.log(`        ${r.why}`)
  }
  if (bad) { console.error(`\n${bad} row(s) are not where the queue said; nothing written`); process.exit(2) }
  if (!LIVE) { console.log('\nRe-run with --live to write.'); return }

  for (const r of ROWS) {
    const { data: w, error: e } = await db.from('scraped_grants')
      .update({ is_active: false, pipeline_state: 'rejected', rejection_reason: formatRejectReason(r.code, NOTE) })
      .eq('id', r.id).eq('pipeline_state', 'tagged')
      .select('id, pipeline_state, is_active')
    if (e || !w || w.length !== 1 || w[0].pipeline_state !== 'rejected') {
      console.error('WRITE FAILED for', r.title, e?.message ?? JSON.stringify(w)); process.exit(3)
    }
    console.log('rejected:', r.title)
  }

  // The page must be gone. 410 is the answer; a 404 right after the write is
  // the middleware's five-minute cache and is reported as such, not as a pass.
  for (const r of ROWS) {
    const row = (data ?? []).find(d => d.id === r.id)!
    const key = String(row.external_id ?? row.id)
    const res = await fetch(`${ORIGIN}/grants/${encodeURIComponent(key)}`, { redirect: 'manual', cache: 'no-store' })
    const verdict = res.status === 410 ? 'gone' : res.status === 404 ? 'not found (cache not yet refreshed, or the 410 did not fire: re-check in 5 minutes)' : `UNEXPECTED ${res.status}`
    console.log(`${res.status}  /grants/${key}  ${verdict}`)
  }
}
main()
