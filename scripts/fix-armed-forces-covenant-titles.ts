// Repair the four Armed Forces Covenant rows titled "CLOSING DATE: <date>".
//
// WHY
// covenantfund.org.uk renders each programme as a PAIR of headings, the closing
// date first:
//     <h2>CLOSING DATE: 23 Sep 2026</h2>
//     <h2>AF3: Supporting Partners programme</h2>
//
// crawlArmedForcesCovenant used querySelector('h2 a, h3 a, h2, h3'), which
// returns the first match in document order, so it stored the date label as the
// title — while hardcoding deadline: null. The one field the heading genuinely
// gave us was the one thrown away, and four rows entered the catalogue titled
// after a date with no deadline recorded.
//
// The scraper is fixed (crawl.ts, same commit). Without that fix this script
// would be undone by the next Monday crawl, which is the documented failure
// mode for one-off SQL repairs in this repo.
//
// ── Source choice ────────────────────────────────────────────────────────────
// Writes as `scraper:armed_forces_covenant` — the SAME source that wrote the
// bad values, deliberately. A repair at higher trust (system:, admin:) would
// permanently outrank the scraper and freeze these titles, so the now-correct
// crawler could never update them again. Writing as the scraper leaves the
// field owned by the thing that maintains it: this is what the fixed scraper
// would have written, applied early.
//
//   npx tsx scripts/fix-armed-forces-covenant-titles.ts          # dry run
//   npx tsx scripts/fix-armed-forces-covenant-titles.ts --apply

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'scraper:armed_forces_covenant'

/**
 * Keyed by the programme slug in apply_url, which is the only trustworthy
 * identifier on these rows — the title is the corrupted field.
 *
 * Titles and dates read from covenantfund.org.uk/programmes/ on 2026-07-26 and
 * verified against the live page, not reconstructed from the slug.
 */
const FIXES: Record<string, { title: string; deadline: string | null }> = {
  'af3-supporting-partners-programme':               { title: 'AF3: Supporting Partners programme',            deadline: '2026-09-23' },
  'reducing-veteran-homelessness-programme':         { title: 'Reducing Veteran Homelessness programme',        deadline: '2026-08-05' },
  'the-service-pupil-support-programme':             { title: 'Service Pupil Support programme',                deadline: '2026-09-30' },
  // No longer listed on the programmes page: its round closed on 15 Jul 2026.
  // Title repaired so the row is identifiable, deadline left null rather than
  // backdated — a past deadline would read as a live round that has just shut.
  'armed-forces-families-fund-early-years-programme': { title: 'Armed Forces Families Fund: Early Years programme', deadline: null },
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, apply_url, deadline, is_active, pipeline_state')
    .eq('source', 'armed_forces_covenant')
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  const rows = (data ?? []) as { id: string; title: string; apply_url: string | null; deadline: string | null; is_active: boolean; pipeline_state: string }[]

  const targets: { row: typeof rows[number]; title: string; deadline: string | null }[] = []
  for (const r of rows) {
    const slug = (r.apply_url ?? '').replace(/\/+$/, '').split('/').pop() ?? ''
    const fix  = FIXES[slug]
    if (!fix) continue
    if (r.title === fix.title && r.deadline === fix.deadline) continue
    targets.push({ row: r, title: fix.title, deadline: fix.deadline })
  }

  console.log(`\n${rows.length} armed_forces_covenant rows, ${targets.length} to repair:\n`)
  for (const t of targets) {
    console.log(`  "${t.row.title}"`)
    console.log(`    title    -> ${t.title}`)
    console.log(`    deadline -> ${t.deadline ?? 'null (round closed)'}`)
    console.log(`    state: ${t.row.pipeline_state}, is_active=${t.row.is_active}\n`)
  }

  const unmatched = rows.filter(r => !FIXES[(r.apply_url ?? '').replace(/\/+$/, '').split('/').pop() ?? ''])
  if (unmatched.length) {
    console.log('not in the fix list (left alone):')
    for (const r of unmatched) console.log(`  ${r.title.slice(0, 60)}`)
    console.log()
  }

  if (!apply) { console.log('DRY RUN — nothing written. Re-run with --apply.\n'); return }

  let applied = 0, rejected = 0
  for (const t of targets) {
    const fields: Record<string, unknown> = { title: t.title }
    // Only send deadline when there is one. Writing null would stamp "we
    // checked and there is no deadline" over a field another job may know
    // better, which is the fill-deadlines trap.
    if (t.deadline) fields.deadline = t.deadline

    const res = await mergeGrantUpdate({ id: t.row.id, fields, source: SOURCE, pinned: false, db })
    if (res.applied.includes('title')) applied++
    else { rejected++; console.warn(`  rejected: ${t.row.id} — ${res.rejected.map(x => `${x.field}:${x.reason}`).join(', ')}`) }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}\n`)
}

main()
