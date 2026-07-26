// Audit stored amounts against each row's OWN evidence, for the large ones.
//
//   npx tsx scripts/audit-large-amounts.ts              # dry run (default)
//   npx tsx scripts/audit-large-amounts.ts --apply      # write
//   npx tsx scripts/audit-large-amounts.ts --min 100000 # lower the threshold
//
// WHY
// "Grant amounts use the total funding available and not what an applicant can
// apply for" is the third of the three error classes Paul reports hitting most.
// The first two — eligibility structures, multi-round deadlines — are now fixed
// at the cause. This is the last one.
//
// It is not cosmetic. amount_min/max feed the matcher's grantSize dimension, so
// a £3,000,000 annual pot recorded as amount_max makes a small charity see a
// fund that appears to award ten times what it really does, and buries genuine
// large funders whose figure happens to look pool-shaped.
//
// Aviva's Financial Futures Fund is the worked example: amount_max = £3,000,000
// while its own summary reads "Up to £3 million awarded annually across the
// fund. Per-grant amounts are not specified on the website."
//
// ── METHOD ──
// Re-runs the SAME extractor the enrichment chain uses — buildAwardText +
// extractGrantAmounts from src/lib/grant-amounts.ts, over the same three inputs
// (typical_award, what_they_fund, description) — and compares its verdict to
// what is stored. No second implementation, so the audit cannot disagree with
// the pipeline on anything except the values that predate the pool cues.
//
// Rows are only touched when the extractor DISAGREES. Agreement is left alone.
//
// ── WHAT IT PROPOSES ──
//   DROP    extractor finds no per-applicant figure in text that does mention
//           money → the stored figure is the pool. Set null.
//   LOWER   extractor finds a smaller per-applicant max → use it.
//   KEEP    extractor agrees, or the row has no text to judge from.
//
// Nulling looks destructive and is the correct answer: showing no figure is
// honest, showing the whole fund's budget as a grant size is not. A nulled row
// picks up the `no_amount` review reason and comes back round for enrichment.
//
// ── WHAT IT WILL NOT DO ──
// Set `amount_undisclosed`. That flag is an affirmative claim that the funder
// publishes no figure, reserved for pinned admin writes (see TRACKED_FIELDS).
// "Our extractor could not find one" is a weaker statement and must not be
// recorded as the stronger one.
//
// ── PROVENANCE ──
// `ai_extract:amount_audit:v1` (trust 50). Equal to the ai_extract source that
// wrote most of these, so it is accepted, and below ai_enrich (60) so a genuine
// re-read of the funder's page can still correct it.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAwardText, extractGrantAmounts } from '../src/lib/grant-amounts'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'ai_extract:amount_audit:v1'

/**
 * Rows where the extractor's verdict was READ AND REJECTED, 2026-07-26.
 *
 * A dry run over the 88 large-amount rows produced 6 proposals, of which 2 were
 * wrong — a 33% error rate, far too high to write to live rows unattended. These
 * 88 are the hard cases by construction: big funders whose pool figure and
 * per-grant figure sit in the same sentence.
 *
 * Keeping the rejections here, rather than tuning the regex until they vanish,
 * is deliberate. Each is a distinct linguistic trap and the fix belongs in
 * grant-amounts.ts with its own test — not in a threshold nudged until tonight's
 * six look right.
 */
const REVIEWED_AND_REJECTED: Record<string, string> = {
  // "Large grants over £15,000. Small grants up to £15,000 also available."
  // The extractor took the SMALL band's ceiling as this row's maximum — which is
  // below the row's own £15,001 floor. Two sibling programmes described in one
  // paragraph; the figure belongs to the other one.
  'Clothworkers Foundation — Large Capital Grants (over £15,000)':
    'takes the sibling small-grants ceiling as this row_s max, below its own floor',
  // "£10,000 to £10,000,000 across the strategic initiative." The Heritage Fund
  // really does award up to £10m; "across the strategic initiative" tripped the
  // pool cue. The genuine pool is a separate sentence — "£200 million shared
  // across all 15 places" — and was correctly not used.
  'National Lottery Heritage Fund — Heritage Places':
    'the range IS per-grant; "across the initiative" is not a pool cue here',
}
const gbp = (n: number | null) => (n === null ? 'none' : `£${n.toLocaleString('en-GB')}`)

async function main() {
  const apply = process.argv.includes('--apply')
  const mi = process.argv.indexOf('--min')
  const MIN = mi > -1 ? Number(process.argv[mi + 1]) : 250_000

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, description, amount_min, amount_max, funder_brief, field_provenance')
    .eq('is_active', true)
    .gte('amount_max', MIN)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = {
    id: string; title: string; funder: string | null; description: string | null
    amount_min: number | null; amount_max: number | null
    funder_brief: Record<string, unknown> | null
    field_provenance: Record<string, { source?: string; pinned?: boolean }> | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const drop: Array<{ r: Row; why: string }> = []
  const lower: Array<{ r: Row; to: { min: number | null; max: number | null }; why: string }> = []
  let agreed = 0, noText = 0, pinned = 0, rejectedOnReview = 0

  for (const r of rows) {
    const b = r.funder_brief ?? {}
    const award = buildAwardText([
      typeof b.typical_award  === 'string' ? b.typical_award  : null,
      typeof b.what_they_fund === 'string' ? b.what_they_fund : null,
      r.description,
    ])
    // Nothing to judge against. Silence is not evidence the figure is wrong.
    if (!award || !/£/.test(award)) { noText++; continue }

    if (r.field_provenance?.amount_max?.pinned) { pinned++; continue }
    if (REVIEWED_AND_REJECTED[r.title]) { rejectedOnReview++; continue }

    const got = extractGrantAmounts(award)

    if (got.amount_max === null) {
      // The text mentions money, and the extractor — pool cues and all — found
      // no per-applicant figure in it. That is the pool signature.
      drop.push({ r, why: award.slice(0, 150) })
      continue
    }
    if (r.amount_max !== null && got.amount_max < r.amount_max) {
      lower.push({ r, to: { min: got.amount_min, max: got.amount_max }, why: award.slice(0, 150) })
      continue
    }
    agreed++
  }

  console.log(`\nactive rows with amount_max >= ${gbp(MIN)} : ${rows.length}`)
  console.log(`  extractor agrees with what is stored     : ${agreed}`)
  console.log(`  no £ figure in the row's own text        : ${noText}  (nothing to judge — left alone)`)
  console.log(`  admin-pinned                             : ${pinned}  (a human decision — left alone)`)
  console.log(`  extractor verdict read and REJECTED      : ${rejectedOnReview}  (see REVIEWED_AND_REJECTED)`)
  console.log(`\n  LOWER to a per-applicant figure          : ${lower.length}`)
  console.log(`  DROP  the figure (it is the whole pot)    : ${drop.length}\n`)

  if (lower.length) {
    console.log('LOWER:')
    for (const l of lower) {
      console.log(`  ${(l.r.funder ?? '').slice(0, 26).padEnd(26)} ${gbp(l.r.amount_max)} -> ${gbp(l.to.max)}`)
      console.log(`      "${l.why}"`)
    }
  }
  if (drop.length) {
    console.log('\nDROP (no per-applicant figure published):')
    for (const d of drop) {
      console.log(`  ${(d.r.funder ?? '').slice(0, 26).padEnd(26)} ${gbp(d.r.amount_max)} -> none`)
      console.log(`      "${d.why}"`)
    }
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let applied = 0, rejected = 0, failed = 0
  const writes = [
    ...lower.map(l => ({ id: l.r.id, title: l.r.title, fields: { amount_min: l.to.min, amount_max: l.to.max } })),
    ...drop.map(d  => ({ id: d.r.id, title: d.r.title, fields: { amount_min: null, amount_max: null } })),
  ]
  for (const w of writes) {
    try {
      const res = await mergeGrantUpdate({ id: w.id, fields: w.fields, source: SOURCE, pinned: false, db })
      if (res.applied.length > 0) applied++
      else { rejected++; if (rejected <= 5) console.error(`  rejected: ${w.title.slice(0, 40)} — ${JSON.stringify(res.rejected)}`) }
    } catch (err) {
      failed++
      console.error(`  failed ${w.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()
