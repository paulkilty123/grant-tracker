/**
 * What the removal actuator would do to production, and — with --apply — doing it.
 *
 * The route (`/api/cron/apply-removals`) is the real home for this and is free
 * to peek at once deployed. This script exists because the branch is not merged,
 * and an undeployed route cannot be probed over HTTP — running the same decision
 * function locally against the live database is the only honest dry run before
 * the merge, and the only way to take the first pass before it.
 *
 * It imports `decideRemoval` and calls `mergeGrantUpdate` rather than
 * reimplementing either. A second copy of the rule written for the report would
 * be a rule that is not the one that runs.
 *
 * REVERSIBILITY. `is_active` and `pipeline_state` are untracked by
 * `mergeGrantUpdate`, so no provenance is stamped and nothing on the row records
 * what it was before. Every applied run writes the before-state to
 * `reports/removals-<date>.json`. That file is the only way back. Do not delete
 * it.
 *
 * Run:  npx tsx scripts/dry-run-removals.ts [--apply]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decideRemoval, type RemovalRow } from '../src/lib/verification/removal'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY = process.argv.includes('--apply')

/** Trust 50, never auto-pins. NOT `admin:` — that carries full human trust for a
 *  value no human reviewed and freezes the field against re-enrichment. */
const SOURCE = 'system:removal_actuator:v1'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function main() {
const { data, error } = await db
  .from('scraped_grants')
  .select('id, title, is_active, pipeline_state, is_rolling, apply_url, field_evidence')
  .eq('is_active', true)
  .not('field_evidence', 'is', null)
  .range(0, 4999)

if (error) throw new Error(error.message)
const rows = (data ?? []) as RemovalRow[]
console.log(`scanned ${rows.length} live rows carrying evidence\n`)

const byClass: Record<string, { id: string; title: string | null; quote: string }[]> = {}
const held: Record<string, { id: string; title: string | null }[]> = {}
const todo: { row: RemovalRow; d: Extract<ReturnType<typeof decideRemoval>, { act: true }> }[] = []

for (const row of rows) {
  const d = decideRemoval(row)
  if (d.act) {
    ;(byClass[d.klass] ??= []).push({ id: row.id, title: row.title, quote: d.quote })
    todo.push({ row, d })
  } else if (d.klass) {
    ;(held[`${d.klass} — ${d.reason}`] ??= []).push({ id: row.id, title: row.title })
  }
}

console.log(APPLY ? 'ACTING' : 'WOULD ACT')
let total = 0
for (const [klass, list] of Object.entries(byClass).sort((a, b) => b[1].length - a[1].length)) {
  total += list.length
  console.log(`\n  ${klass}: ${list.length}`)
  for (const r of list) console.log(`    ${r.title} — "${r.quote.slice(0, 110)}"`)
}
console.log(`\n  TOTAL: ${total}`)

console.log(`\n${APPLY ? 'HELD' : 'WOULD HOLD'} (the abstain rule doing its job)`)
for (const [reason, list] of Object.entries(held).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${reason}: ${list.length}`)
  for (const r of list) console.log(`    ${r.title}`)
}

if (!APPLY) {
  console.log('\nNothing was written. Re-run with --apply to act.')
  return
}

const ledger: unknown[] = []
let corrected = 0
const refused: string[] = []

for (const { row, d } of todo) {
  // Captured BEFORE the write. Nothing on the row records the pre-archive state.
  const before = { is_active: row.is_active, pipeline_state: row.pipeline_state, is_rolling: row.is_rolling }
  let applied: string[] = []
  let rejected: unknown[] = []
  let err: string | null = null
  try {
    const res = await mergeGrantUpdate({ id: row.id, fields: d.fields, source: SOURCE, pinned: false, db })
    applied  = res.applied
    rejected = res.rejected
  } catch (e) {
    err = e instanceof Error ? e.message : String(e)
  }
  // NEVER assume it landed. A rejection counted as a success left Movement for
  // Good Awards public for a further day.
  const missed = Object.keys(d.fields).filter(f => !applied.includes(f))
  const ok = !err && missed.length === 0
  if (ok) corrected++
  else refused.push(`${row.title} (${d.klass}): ${err ?? `refused ${missed.join(', ')}`}`)
  ledger.push({ id: row.id, title: row.title, klass: d.klass, quote: d.quote,
                sourceUrl: d.sourceUrl, before, after: d.fields, applied, rejected, error: err, ok })
}

const today = new Date().toISOString().slice(0, 10)
const path  = resolve(HERE, '..', 'reports', `removals-${today}.json`)
writeFileSync(path, JSON.stringify({ ranAt: new Date().toISOString(), source: SOURCE, corrected, ledger }, null, 2))

console.log(`\nROWS CORRECTED: ${corrected} of ${todo.length}`)
if (refused.length > 0) {
  console.log(`REFUSED: ${refused.length}`)
  for (const r of refused) console.log(`    ${r}`)
}
console.log(`before-state ledger written to reports/removals-${today}.json`)
}

main().catch(e => { console.error(e); process.exit(1) })
