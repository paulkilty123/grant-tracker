// Model candidate auto-publish gate policies against the live review queue.
//
// The question Phase 2 actually turns on is not "what threshold" but "which of
// the 20 reason codes should BLOCK publication". deriveReviewReasons() already
// tells us why every row is waiting; this script asks, for each candidate
// policy, how many rows would publish themselves and what we would be
// accepting by letting them through.
//
// Read-only. Run:  npx tsx scripts/model-gate-policy.ts
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deriveReviewReasons,
  type ReviewReasonCode,
  type ReviewRow,
} from '../src/lib/admin/review-reasons'
import { isBlocking } from '../src/lib/admin/publish-gate'

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

/**
 * Policy C is imported from the real gate rather than restated here.
 *
 * An earlier draft of this script kept its own copy of the blocking list, which
 * immediately drifted: the copy matched on the `tags_changed` code alone and so
 * blocked 60 benign rows that the gate would publish, making policy C look far
 * stricter than it is. A model that does not run the code it is modelling is
 * worse than no model, because it is confidently wrong.
 */
type Reasons = ReturnType<typeof deriveReviewReasons>
const isWrong = isBlocking

type Policy = { name: string; note: string; blocks: (r: Reasons) => boolean }

const POLICIES: Policy[] = [
  {
    name: 'A. Any reason blocks (today)',
    note: 'the queue as it stands',
    blocks: rs => rs.length > 0,
  },
  {
    name: 'B. Critical severity blocks',
    note: 'trust the severity labels already in the code',
    blocks: rs => rs.some(r => r.severity === 'critical'),
  },
  {
    name: 'C. Wrong blocks, missing does not',
    note: 'block invented/incorrect data; let honest gaps publish',
    blocks: rs => rs.some(r => isWrong(r)),
  },
  {
    name: 'D. Only user-visible harm blocks',
    note: 'C minus the tag-quality and grounding checks',
    blocks: rs => rs.some(r => (['no_brief', 'page_unreadable', 'quarantined', 'link_dead', 'deadline_passed', 'amount_inverted', 'amount_pot_suspected'] as ReviewReasonCode[]).includes(r.code)),
  },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db.from('scraped_grants').select(COLS).in('pipeline_state', QUEUE_STATES)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = ReviewRow & { funder?: string | null; pipeline_state?: string; is_active?: boolean | null }
  const rows = (data ?? []) as unknown as Row[]
  const scored = rows.map(r => ({ r, rs: deriveReviewReasons(r) }))

  const live = scored.filter(s => s.r.is_active)
  console.log(`\nqueue: ${rows.length} rows`)
  console.log(`  already live to users: ${live.length}  (publishing these changes nothing a user sees)`)
  console.log(`  genuinely withheld:    ${rows.length - live.length}\n`)

  console.log('policy'.padEnd(34), 'publishes'.padStart(10), 'held'.padStart(7), '  of which already live')
  console.log('-'.repeat(80))
  for (const p of POLICIES) {
    const pass = scored.filter(s => !p.blocks(s.rs))
    const passLive = pass.filter(s => s.r.is_active).length
    console.log(
      p.name.padEnd(34),
      `${pass.length} (${Math.round(100 * pass.length / rows.length)}%)`.padStart(10),
      String(rows.length - pass.length).padStart(7),
      `  ${passLive} live / ${pass.length - passLive} new`,
    )
    console.log(' '.repeat(34), `  ${p.note}`)
  }

  // What each policy would be accepting: the reasons carried by rows it lets through.
  for (const p of POLICIES.slice(1)) {
    const pass = scored.filter(s => !p.blocks(s.rs))
    const tally = new Map<string, number>()
    for (const { rs } of pass) for (const r of rs) tally.set(r.code, (tally.get(r.code) ?? 0) + 1)
    if (tally.size === 0) continue
    console.log(`\n${p.name} — publishes rows still carrying:`)
    for (const [code, n] of Array.from(tally).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}  ${code}`)
    }
  }

  // ── The split that actually matters ──────────────────────────────────────
  // A gate has two different jobs depending on whether the row is already live,
  // and one threshold cannot serve both:
  //
  //   NOT live  — publishing EXPOSES the row. "Is it good enough to show?"
  //   ALREADY live — the row is in front of users right now, carrying every
  //   defect it has. Holding it in the queue protects nobody; it only means the
  //   admin state lags reality. The real question is "is it bad enough to PULL?"
  const notLive = scored.filter(s => !s.r.is_active)
  const isLive  = scored.filter(s => s.r.is_active)

  console.log('\n' + '='.repeat(80))
  console.log('SPLIT BY WHETHER THE ROW IS ALREADY VISIBLE TO USERS')
  console.log('='.repeat(80))

  console.log(`\nNOT live (${notLive.length}) — publishing exposes these. Strict gate applies.`)
  for (const p of POLICIES) {
    const pass = notLive.filter(s => !p.blocks(s.rs))
    console.log(`  ${p.name.padEnd(34)} publishes ${String(pass.length).padStart(3)} / ${notLive.length}`)
  }

  console.log(`\nALREADY live (${isLive.length}) — these are in front of users NOW.`)
  const wrongLive = isLive.filter(s => s.rs.some(r => isWrong(r)))
  console.log(`  carrying a "wrong data" reason:  ${wrongLive.length}  <- candidates to RETRACT, not to hold`)
  console.log(`  only incomplete / unconfirmed:   ${isLive.length - wrongLive.length}  <- holding these achieves nothing`)
  const wt = new Map<string, number>()
  for (const { rs } of wrongLive) for (const r of rs) if (isWrong(r)) wt.set(r.code, (wt.get(r.code) ?? 0) + 1)
  if (wt.size) {
    console.log('\n  live rows carrying wrong data, by reason:')
    for (const [code, n] of Array.from(wt).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${code}`)
    }
  }

  // link_unverified is the single largest blocker; "never checked" and "scored
  // badly" are very different claims and should not share a code's blocking power.
  const lu = scored.filter(s => s.rs.some(r => r.code === 'link_unverified'))
  const byStatus = new Map<string, number>()
  for (const { r } of lu) {
    const k = r.url_status === 'ok' ? `ok but quality ${r.url_quality_score}` : `status=${r.url_status ?? 'null'}`
    byStatus.set(k, (byStatus.get(k) ?? 0) + 1)
  }
  console.log(`\nlink_unverified (${lu.length}) breaks down as:`)
  for (const [k, n] of Array.from(byStatus).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)

  // No "unclassified codes" check here any more: publish-gate.ts classifies
  // every ReviewReasonCode in an exhaustive Record, so an unclassified code
  // fails `npx tsc --noEmit` rather than printing a warning nobody reads.
  console.log()
}

main()
