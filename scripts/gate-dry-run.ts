// Dry-run the auto-publish gate locally, against the live catalogue.
//
//   npx tsx scripts/gate-dry-run.ts
//
// READ-ONLY. Writes nothing, not even the publish_gate_decisions audit row that
// the deployed cron records on a dry run.
//
// Why this exists rather than curling /api/cron/auto-publish: the gate's
// decision layer is pure (gateDecision + deriveReviewReasons over a plain row),
// so a detector change can be measured against production data before it is
// deployed anywhere. The query below mirrors the route's COLS, QUEUE_STATES,
// BATCH_LIMIT and already-live-first sort exactly, so the split it prints is the
// split the route would print if the branch were live.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']
const BATCH_LIMIT  = 500
const COLS = [
  'id', 'title', 'funder', 'is_active', 'pipeline_state', 'url_status', 'url_quality_score',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
].join(', ')

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

type Row = ReviewRow & { title?: string | null; funder?: string | null }

async function main() {
const { data, error } = await db
  .from('scraped_grants')
  .select(COLS)
  .in('pipeline_state', QUEUE_STATES)
  .not('saved_for_later', 'is', 'true')
  .limit(BATCH_LIMIT)

// A failed read must never read as an empty queue.
if (error) { console.error('queue read failed:', error.message); process.exit(1) }

const rows = (data ?? []) as unknown as Row[]

const decisions = rows
  .map(row => ({ row, d: gateDecision(row, deriveReviewReasons(row)) }))
  .sort((a, b) => Number(b.d.wasLive) - Number(a.d.wasLive))

const publish   = decisions.filter(x => x.d.outcome === 'publish')
const attention = decisions.filter(x => x.d.outcome === 'attention')
const held      = decisions.filter(x => x.d.outcome === 'hold')
const newly     = publish.filter(x => !x.d.wasLive)

console.log(`queue ${rows.length}`)
console.log(`  publish    ${publish.length}  (${newly.length} newly visible, ${publish.length - newly.length} already live)`)
console.log(`  attention  ${attention.length}`)
console.log(`  hold       ${held.length}`)

for (const [name, set] of [['attention', attention], ['hold', held]] as const) {
  const tally = new Map<string, number>()
  for (const x of set) for (const r of x.d.blocking) tally.set(r.code, (tally.get(r.code) ?? 0) + 1)
  console.log(`\n${name} blocked by:`)
  for (const [c, n] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`)
}

console.log(`\n── would newly appear to users (${newly.length}) ──`)
for (const x of newly.sort((a, b) => (a.row.funder ?? '').localeCompare(b.row.funder ?? ''))) {
  const info = x.d.informational.map(r => r.code).join(', ') || 'nothing outstanding'
  console.log(`  ${x.row.funder ?? '(no funder)'} — ${x.row.title}`)
  console.log(`      max=${x.row.amount_max ?? '—'} deadline=${x.row.deadline ?? '—'} elig=${x.row.eligible_structures?.length ?? 0} | ${info}`)
}
}

main().catch(e => { console.error(e); process.exit(1) })
