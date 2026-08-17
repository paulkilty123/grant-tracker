/**
 * What the removal actuator would do to production, today, writing nothing.
 *
 * The route (`/api/cron/apply-removals`) is the real home for this and is free
 * to peek at once deployed. This script exists because the branch is not merged,
 * and an undeployed route cannot be probed over HTTP — running the same decision
 * function locally against the live database is the only honest dry run before
 * the merge.
 *
 * It imports `decideRemoval` rather than reimplementing it. A second copy of the
 * rule written for the report would be a rule that is not the one that runs.
 *
 * Run:  npx tsx scripts/dry-run-removals.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decideRemoval, type RemovalRow } from '../src/lib/verification/removal'

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

for (const row of rows) {
  const d = decideRemoval(row)
  if (d.act) {
    ;(byClass[d.klass] ??= []).push({ id: row.id, title: row.title, quote: d.quote })
  } else if (d.klass) {
    ;(held[`${d.klass} — ${d.reason}`] ??= []).push({ id: row.id, title: row.title })
  }
}

console.log('WOULD ACT')
let total = 0
for (const [klass, list] of Object.entries(byClass).sort((a, b) => b[1].length - a[1].length)) {
  total += list.length
  console.log(`\n  ${klass}: ${list.length}`)
  for (const r of list) console.log(`    ${r.title} — "${r.quote.slice(0, 110)}"`)
}
console.log(`\n  TOTAL ROWS CORRECTED: ${total}`)

console.log('\nWOULD HOLD (the abstain rule doing its job)')
for (const [reason, list] of Object.entries(held).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n  ${reason}: ${list.length}`)
  for (const r of list) console.log(`    ${r.title}`)
}
}

main().catch(e => { console.error(e); process.exit(1) })
