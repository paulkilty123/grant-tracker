// Triage the inactive rows whose apply_url still resolves.
//
// The catalogue holds 1,729 rows and 738 are live. This asks the obvious
// question nobody had asked: of the ~991 inactive ones, how many are real funds
// that were switched off and never switched back on?
//
// It answers with the gate rather than with fresh judgement. gateDecision() is
// already calibrated on the live queue, so "would this publish if it were in the
// queue today" is a question we can answer for free, and the answer is directly
// comparable to how the queue is being triaged. No new criteria, no drift.
//
// Two things it refuses to do:
//   * recommend reactivating a row that duplicates a LIVE row. Dedup is checked
//     in SQL-shaped normalised form first, because a reactivated duplicate is
//     worse than a missing grant: it splits feedback and shows the same fund
//     twice.
//   * treat "link resolves" as "fund is open". A passed deadline with no next
//     round is a closed fund, and the gate blocks it.
//
// Read-only. Writes nothing. Run: npx tsx scripts/triage-inactive-recoverable.ts

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const COLS = [
  'id', 'title', 'funder', 'apply_url', 'is_active', 'pipeline_state', 'rejection_reason',
  'url_status', 'url_quality_score', 'url_last_checked',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
].join(', ')

const normUrl = (u: string | null | undefined) =>
  (u ?? '').trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')

const normName = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

type Row = ReviewRow & {
  title?: string | null
  funder?: string | null
  apply_url?: string | null
  pipeline_state?: string
  rejection_reason?: string | null
  url_quality_score?: number | null
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: cand, error } = await db
    .from('scraped_grants').select(COLS).eq('is_active', false).eq('url_status', 'ok')
  if (error) { console.error('candidate query failed:', error.message); process.exit(1) }

  // Every LIVE row, for the duplicate check. Fetched in full rather than with a
  // .limit() + JS filter, which silently degrades past the window.
  const { data: live, error: liveErr } = await db
    .from('scraped_grants').select('id, title, funder, apply_url').eq('is_active', true)
  if (liveErr) { console.error('live query failed:', liveErr.message); process.exit(1) }

  const liveByUrl    = new Map<string, string>()
  const liveByName   = new Map<string, string>()
  const liveFunders  = new Set<string>()
  for (const r of (live ?? []) as { title: string; funder: string | null; apply_url: string | null }[]) {
    const u = normUrl(r.apply_url); if (u) liveByUrl.set(u, r.title)
    liveByName.set(`${normName(r.funder)}|${normName(r.title)}`, r.title)
    liveFunders.add(normName(r.funder))
  }

  const rows = (cand ?? []) as unknown as Row[]
  const today = new Date().toISOString().slice(0, 10)

  type Verdict = 'duplicate' | 'rejected' | 'closed_round' | 'reactivate' | 'needs_repair'
  const out: { row: Row; verdict: Verdict; note: string }[] = []
  // Guards against recommending two inactive rows that duplicate EACH OTHER.
  const seenInternal = new Map<string, string>()

  for (const r of rows) {
    const reasons = deriveReviewReasons(r)
    const gate    = gateDecision(r, reasons)
    const nameKey = `${normName(r.funder)}|${normName(r.title)}`
    const urlKey  = normUrl(r.apply_url)

    if (liveByName.has(nameKey)) {
      out.push({ row: r, verdict: 'duplicate', note: `same funder+title as live "${liveByName.get(nameKey)}"` })
      continue
    }
    if (seenInternal.has(nameKey)) {
      out.push({ row: r, verdict: 'duplicate', note: `duplicates another inactive row` })
      continue
    }
    seenInternal.set(nameKey, r.title ?? '')

    if (r.rejection_reason) {
      out.push({ row: r, verdict: 'rejected', note: `deliberately rejected: ${r.rejection_reason}` })
      continue
    }

    // A passed deadline with nothing recorded after it is a closed fund. Kept
    // separate from needs_repair because the remedy is different: find the next
    // round, not fix the data.
    const closed = !!r.deadline && r.deadline < today && !r.next_open_date
    if (closed) {
      const cycle = Array.isArray(r.deadline_cycle) && r.deadline_cycle.length > 0
      out.push({
        row: r, verdict: 'closed_round',
        note: cycle ? 'closed, but a cycle is recorded so the next round is derivable'
                    : `closed ${r.deadline}, no next round recorded`,
      })
      continue
    }

    if (gate.outcome === 'publish') {
      out.push({ row: r, verdict: 'reactivate', note: 'nothing blocking; the gate would publish this today' })
    } else {
      out.push({
        row: r, verdict: 'needs_repair',
        note: gate.blocking.map(b => b.label).join(', '),
      })
    }
  }

  const by = (v: Verdict) => out.filter(o => o.verdict === v)
  const pct = (n: number) => `${Math.round((100 * n) / rows.length)}%`

  console.log(`\ninactive rows whose link resolves: ${rows.length}\n`)
  const order: Verdict[] = ['reactivate', 'closed_round', 'needs_repair', 'duplicate', 'rejected']
  const LABEL: Record<Verdict, string> = {
    reactivate:   'REACTIVATE      gate would publish today, no duplicate',
    closed_round: 'CLOSED ROUND    real fund, round has ended',
    needs_repair: 'NEEDS REPAIR    fixable, but something is wrong',
    duplicate:    'DUPLICATE       already live under another row',
    rejected:     'REJECTED        deliberately turned down',
  }
  for (const v of order) {
    console.log(`  ${String(by(v).length).padStart(4)}  ${pct(by(v).length).padStart(4)}  ${LABEL[v]}`)
  }

  console.log('\nNEEDS REPAIR, by blocking reason:')
  const tally = new Map<string, number>()
  for (const o of by('needs_repair')) tally.set(o.note, (tally.get(o.note) ?? 0) + 1)
  for (const [k, n] of Array.from(tally).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${String(n).padStart(4)}  ${k}`)
  }

  const cycleKnown = by('closed_round').filter(o => o.note.startsWith('closed, but a cycle'))
  console.log(`\nCLOSED ROUND: ${cycleKnown.length} of ${by('closed_round').length} have a recorded cycle, so the next round is derivable.`)

  // ── Confidence split on the REACTIVATE set ───────────────────────────────
  //
  // "The gate would publish it" is necessary, not sufficient. These rows were
  // switched off by somebody, and only 10 of the 215 record why. Three cheap
  // signals separate a fund that was wrongly switched off from one that is
  // probably already represented:
  //
  //   url shared with a live row  — near-certainly the same page, so the fund
  //                                 is likely already catalogued under it
  //   title == funder             — a generic funder-level row, which under the
  //                                 CF convention is a front door that may
  //                                 duplicate the specific programme rows
  //   funder already live         — weakest signal, since a funder legitimately
  //                                 runs several programmes. Flagged, not
  //                                 disqualifying.
  const flagged = by('reactivate').map(o => {
    const urlShared      = liveByUrl.has(normUrl(o.row.apply_url))
    const titleIsFunder  = normName(o.row.title) === normName(o.row.funder)
    const funderLive     = liveFunders.has(normName(o.row.funder))
    return { ...o, urlShared, titleIsFunder, funderLive }
  })
  const clean  = flagged.filter(f => !f.urlShared && !f.titleIsFunder)
  const risky  = flagged.filter(f =>  f.urlShared ||  f.titleIsFunder)

  console.log(`\nREACTIVATE, split by duplicate risk:`)
  console.log(`  ${String(clean.length).padStart(4)}  clean          no shared URL, not a generic funder-level row`)
  console.log(`  ${String(risky.length).padStart(4)}  check first    shares a live URL or is a funder-level row`)
  console.log(`  ${String(clean.filter(c => c.funderLive).length).padStart(4)}  of the clean set, funder already has other live rows`)

  // A live link is not a real application page. Dartington's row points at
  // dartington.org and scores 10: the domain resolves, the fund does not appear
  // on it. Below the gate's own URL_QUALITY_SUSPECT threshold the link needs
  // fixing before the row is worth anything, so those are counted separately
  // rather than folded into a headline "recoverable" number.
  const cleanGood = clean.filter(c => (c.row.url_quality_score ?? 0) >= 60)
  const cleanWeak = clean.filter(c => (c.row.url_quality_score ?? 0) < 60)
  console.log(`\n  of the clean set: ${cleanGood.length} have a page scoring >=60, ${cleanWeak.length} need the link fixed first`)

  console.log('\nCLEAN reactivation candidates:')
  for (const o of clean) {
    const mark = o.funderLive ? ' (funder also live)' : ''
    console.log(`  ${String(o.row.url_quality_score ?? '?').padStart(3)}  ${(o.row.funder ?? '').slice(0, 32).padEnd(32)} ${String(o.row.title ?? '').slice(0, 42).padEnd(42)}${mark}`)
  }

  console.log('\nCHECK FIRST (probable duplicates):')
  for (const o of risky) {
    const why = [o.urlShared ? 'shares live URL' : '', o.titleIsFunder ? 'funder-level row' : ''].filter(Boolean).join(', ')
    console.log(`  ${(o.row.funder ?? '').slice(0, 32).padEnd(32)} ${String(o.row.title ?? '').slice(0, 38).padEnd(38)} ${why}`)
  }

  console.log('\nDUPLICATE (do not reactivate):')
  for (const o of by('duplicate').slice(0, 12)) {
    console.log(`  ${(o.row.funder ?? '').slice(0, 30).padEnd(30)} ${String(o.row.title ?? '').slice(0, 34).padEnd(34)} ${o.note}`)
  }
  console.log()
}

main()
