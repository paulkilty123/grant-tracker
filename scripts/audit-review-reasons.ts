// Audit: run deriveReviewReasons() over the live review queue and report the
// distribution of reasons.
//
// Two jobs:
//   1. Validate the reason derivation against real data before UI depends on it.
//   2. CALIBRATE THE AUTO-PUBLISH GATE. A row with zero detectable reasons is
//      exactly a row the gate could publish without a human. The "no detectable
//      reason" count below is therefore the gate's expected pass rate, measurable
//      before the gate exists — which is the difference between choosing
//      thresholds from evidence and choosing them from feel.
//
// Read-only. Run:  npx tsx scripts/audit-review-reasons.ts [--all]
//   (default: the review queue only. --all: every row in the catalogue.)

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveReviewReasons,
  extractTagsDiff,
  compareBySeverity,
  type ReviewRow,
} from '../src/lib/admin/review-reasons'

// Resolve .env.local relative to this file, never an absolute sandbox path —
// scripts/enrich-review-keepers.mjs is un-runnable because it hardcoded one.
const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const COLS = [
  'id', 'title', 'funder', 'pipeline_state', 'is_active', 'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
].join(', ')

const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

async function main() {
  const all = process.argv.includes('--all')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let q = db.from('scraped_grants').select(COLS)
  if (!all) q = q.in('pipeline_state', QUEUE_STATES)
  else      q = q.eq('is_active', true)

  const { data, error } = await q
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = ReviewRow & { funder?: string | null; pipeline_state?: string }
  const rows = (data ?? []) as unknown as Row[]

  const scored = rows.map(r => ({ r, rs: deriveReviewReasons(r) }))
  const clean    = scored.filter(s => s.rs.length === 0)
  const critical = scored.filter(s => s.rs.some(x => x.severity === 'critical'))
  const checkOnly = scored.filter(s =>
    s.rs.length > 0 && !s.rs.some(x => x.severity === 'critical') && s.rs.some(x => x.severity === 'check'))
  const changedOnly = scored.filter(s =>
    s.rs.length > 0 && s.rs.every(x => x.severity === 'changed'))

  const scope = all ? 'live catalogue' : 'review queue'
  console.log(`\n${scope}: ${rows.length} rows\n`)
  console.log(`  would AUTO-PUBLISH (no detectable reason) ${String(clean.length).padStart(5)}  ${pct(clean.length, rows.length)}`)
  console.log(`  held — has a critical reason              ${String(critical.length).padStart(5)}  ${pct(critical.length, rows.length)}`)
  console.log(`  held — check only                         ${String(checkOnly.length).padStart(5)}  ${pct(checkOnly.length, rows.length)}`)
  console.log(`  held — only "tags changed"                ${String(changedOnly.length).padStart(5)}  ${pct(changedOnly.length, rows.length)}`)

  const tally = new Map<string, { n: number; sev: string }>()
  for (const { rs } of scored) {
    for (const x of rs) {
      const key = x.code
      const cur = tally.get(key) ?? { n: 0, sev: x.severity }
      cur.n++
      tally.set(key, cur)
    }
  }
  console.log('\nreason distribution:')
  for (const [code, { n, sev }] of Array.from(tally.entries()).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${String(n).padStart(5)}  [${sev.padEnd(8)}] ${code}`)
  }

  const sorted = [...scored].sort((a, b) => compareBySeverity(a.rs, b.rs))
  console.log('\ntop of the queue as the Inbox would order it:')
  for (const { r, rs } of sorted.slice(0, 8)) {
    const who = `${(r.funder ?? '').slice(0, 24)}`.padEnd(24)
    const what = String(r.title ?? '').slice(0, 34).padEnd(34)
    console.log(`  ${who} ${what} ${rs.map(x => x.label).join(' · ').slice(0, 96)}`)
  }

  const withDiff = rows.filter(r => extractTagsDiff(r.field_provenance).length > 0)
  const lostStructures = withDiff.filter(r =>
    extractTagsDiff(r.field_provenance).some(d => d.field === 'eligible_structures' && d.removed.length > 0))
  console.log(`\nrenderable diffs: ${withDiff.length}`)
  console.log(`  of which REMOVED eligibility (silently hides the fund): ${lostStructures.length}`)
  for (const r of lostStructures.slice(0, 10)) {
    const d = extractTagsDiff(r.field_provenance).find(x => x.field === 'eligible_structures')!
    console.log(`    ${(r.funder ?? '').slice(0, 30).padEnd(30)} removed: ${d.removed.join(', ')}`)
  }
  console.log()
}

function pct(n: number, d: number): string {
  return d === 0 ? '' : `${Math.round((100 * n) / d)}%`
}

main()
