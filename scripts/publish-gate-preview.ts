/**
 * What the publish gate would decide TODAY, with the current code, writing nothing.
 *
 * The deployed route answers this for the deployed policy. This answers it for
 * the policy on the branch, which is the only way to price a gate change before
 * merging it — and the pre-arming dry run is exactly when that matters.
 *
 * Reuses `deriveReviewReasons` and `decidePublish`, never a reimplementation.
 *
 * Run:  npx tsx scripts/publish-gate-preview.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
import { sectionOf } from '../src/lib/admin/review-sections'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Must match the auto-publish route's COLS. A column missing here that a reason
// reads produces a false verdict, which is the failure this repo keeps hitting.
const COLS = 'id, title, funder, is_active, pipeline_state, url_status, url_quality_score, amount_min, amount_max, deadline, is_rolling, next_open_date, deadline_cycle, eligible_structures, impact_sectors, target_beneficiaries, funder_brief, field_provenance, raw_data, needs_intervention_reason, field_evidence'

const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db
    .from('scraped_grants').select(COLS).in('pipeline_state', QUEUE_STATES).range(0, 4999)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as (ReviewRow & { is_active: boolean | null })[]

  const counts: Record<string, number> = {}
  const newlyBlockedBy: Record<string, number> = {}
  const newly: { title: string; funder: string; verdict: string; info: string }[] = []
  let newlyVisible = 0

  for (const r of rows) {
    const reasons  = deriveReviewReasons(r, today)
    const decision = gateDecision(r, reasons)
    counts[decision.outcome] = (counts[decision.outcome] ?? 0) + 1
    if (decision.outcome === 'publish' && !decision.wasLive) {
      newlyVisible++
      const ev = r.field_evidence as Record<string, { note?: string }> | null
      newly.push({
        title:   r.title ?? '(no title)',
        funder:  r.funder ?? '(none)',
        verdict: ev?._page_read?.note ?? '(never read)',
        info:    decision.informational.map(i => i.code).join(', ') || '-',
      })
    }
    if (decision.outcome !== 'publish' && !decision.wasLive) {
      for (const b of decision.blocking) newlyBlockedBy[b.code] = (newlyBlockedBy[b.code] ?? 0) + 1
    }
  }

  // How the not-live queue divides under the review sections. Ready must mean
  // "publish without reading further", so the split is worth checking rather
  // than assuming.
  const sec: Record<string, number> = {}
  for (const r of rows) {
    if (r.is_active === true) continue
    const reasons = deriveReviewReasons(r, today)
    const d = gateDecision(r, reasons)
    const id = sectionOf(d.blocking.map(b => b.code), reasons.map(x => x.code))
    sec[id] = (sec[id] ?? 0) + 1
  }
  console.log('not-live by section:', sec)
  // Rows that are LIVE and carry nothing blocking. They are in neither the
  // not-live sections nor the live-and-wrong band.
  let homeless = 0
  for (const r of rows) {
    if (r.is_active !== true) continue
    const d = gateDecision(r, deriveReviewReasons(r, today))
    if (d.outcome === 'publish') homeless++
  }
  console.log('live_no_home:', homeless)

  console.log(`queue: ${rows.length} rows`)
  console.log('outcomes:', counts)
  console.log(`NEWLY VISIBLE if armed: ${newlyVisible}`)
  console.log('\nTHE ROWS THAT WOULD NEWLY APPEAR:')
  for (const n of newly.sort((a, b) => a.funder.localeCompare(b.funder))) {
    console.log(`  ${n.funder}  —  ${n.title}`)
    console.log(`      page read: ${n.verdict}   |   noted: ${n.info}`)
  }

  console.log('\nwhat holds the rest back (not-yet-live rows, by blocking code):')
  for (const [c, n] of Object.entries(newlyBlockedBy).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${c}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
