// Paley: settled 31 Aug as correct. Written down so it stays settled.
//
// The trust has no website and takes applications by email, which is the real
// route and not a defect. `not_a_web_url` fires on any `mailto:` apply_url, so
// the row surfaced under "Nothing more we can do" every day after the ruling was
// made — a decision that has to be remade daily is not a decision.
//
//   npx tsx --env-file=.env.local scripts/record-paley-ruling-2026-09-01.ts [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { recordGrantFlags } from '../src/lib/grant-flags'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const LIVE = process.argv.includes('--live')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Every row whose apply route is not a web page. Paley is the known one; the
  // scan is written to find any others rather than to hard-code a single id,
  // because a second one would otherwise sit in the queue unnoticed.
  const rows: Record<string, unknown>[] = []
  for (let from = 0; from < 6000; from += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, funder, apply_url, is_active, raw_data')
      .not('pipeline_state', 'in', '("rejected","archived")')
      .order('id').range(from, from + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }

  const nonWeb = rows.filter(r => {
    const u = String(r.apply_url ?? '').trim()
    return u.length > 0 && !/^https?:\/\//i.test(u)
  })

  console.log(`${rows.length} rows scanned, ${nonWeb.length} with a non-web apply route\n`)
  for (const r of nonWeb) {
    const isPaley = String(r.funder ?? '').toLowerCase().includes('paley')
    console.log(`  ${isPaley ? 'RULED ' : 'REVIEW'}  ${String(r.funder ?? '').slice(0, 28).padEnd(28)} ${String(r.apply_url).slice(0, 44)}`)
  }

  const paley = nonWeb.filter(r => String(r.funder ?? '').toLowerCase().includes('paley'))
  if (paley.length !== 1) {
    console.log(`\nExpected exactly 1 Paley row, found ${paley.length}. Refusing to guess.`)
    process.exit(1)
  }
  const unruled = nonWeb.length - paley.length
  if (unruled > 0) {
    console.log(`\n${unruled} other non-web route(s) above are NOT being ruled on here — they need Paul.`)
  }

  console.log(`\n${LIVE ? 'Recording' : 'Would record'} apply_route_accepted on ${String(paley[0].id).slice(0, 8)}`)
  if (!LIVE) { console.log('Re-run with --live to write.'); return }

  // `existingRawData` IS REQUIRED AND MUST BE THE ROW'S CURRENT VALUE.
  //
  // recordGrantFlags rebuilds raw_data from what it is handed. Omitting this
  // argument makes it rebuild from `{}`, so the write replaces raw_data wholesale
  // instead of merging into it. That happened on the first run of this script:
  // tsc was reporting the missing property and tsx ran anyway, because tsx does
  // not typecheck. Nothing was lost — the pre-change queue snapshot shows this
  // row carried no flags and no amount suggestion — but only by luck.
  //
  // The rule this earns: a script that writes gets `npx tsc --noEmit` clean
  // FIRST. tsx running is not evidence that a script is correct.
  await recordGrantFlags({
    db, grantId: String(paley[0].id), source: 'admin:paulkilty1@gmail.com',
    existingRawData: paley[0].raw_data,
    flags: [{
      code: 'apply_route_accepted',
      detail: 'No website. Applications are made by email, and that is the real route rather than a '
            + 'missing one. Ruled by Paul 2026-08-31; recorded 2026-09-01 because the queue was raising '
            + 'it daily. Clear this flag to bring the row back into review.',
    }],
  })
  console.log('Recorded.')
}
main()
