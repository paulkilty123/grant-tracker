// Unpin `deadline` where the pin is a form-save artefact, not a decision.
//
//   npx tsx scripts/unpin-form-save-deadlines.ts          # dry run (default)
//   npx tsx scripts/unpin-form-save-deadlines.ts --apply  # write
//
// WHY
// 53 active rows have `deadline` pinned to NULL — frozen empty, so nothing
// automated can ever populate it. CLA Charitable Trust's round closes tomorrow
// and its row shows no deadline at all.
//
// None of those pins record a decision. Grant Manager sends its whole form
// state on save and update-grant pins every field in the payload, so an empty
// date box on screen became "an admin has decided this fund has no deadline" at
// trust 100. The signature is unmistakable: each was stamped in the same second
// as up to six other fields.
//
//   The Wax Chandlers' Company  7 fields, same second: deadline, amount_max,
//                               amount_min, is_rolling, location_tag,
//                               next_open_date, eligible_structures
//   Sir James Knott Trust       6 fields, same second
//   London Borough of Sutton    4 fields, same second
//
// The cause is fixed (mergeFieldUpdate no longer writes or pins a value that is
// not changing), but that is add-only: pins already recorded stay until removed.
//
// ── DELIBERATELY NARROW ──
// Only rows where ALL THREE hold:
//   1. deadline is pinned, AND
//   2. deadline is NULL — a pinned real date is a decision and is left alone,
//   3. it was stamped in the same second as at least one other field — the
//      form-save signature. A deadline pinned on its own may well have been a
//      deliberate "this fund has no deadline", so it is skipped and reported.
//
// This changes NO value. It only lets automated writes reach the field again.
// If one turns out to have been a genuine call, re-pinning is one admin edit.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

type Prov = { source?: string; set_at?: string; pinned?: boolean }

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, deadline, field_provenance')
    .eq('is_active', true)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = { id: string; title: string; funder: string | null; deadline: string | null; field_provenance: Record<string, Prov> | null }
  const rows = (data ?? []) as unknown as Row[]

  const unpin: Array<{ row: Row; others: string[] }> = []
  let skippedHasDate = 0, skippedSolo = 0

  for (const r of rows) {
    const fp = r.field_provenance ?? {}
    const d = fp.deadline
    if (!d?.pinned) continue
    if (r.deadline) { skippedHasDate++; continue }        // a pinned real date IS a decision

    const at = String(d.set_at ?? '').slice(0, 19)
    const others = Object.entries(fp)
      .filter(([k, v]) => k !== 'deadline' && String(v?.set_at ?? '').slice(0, 19) === at)
      .map(([k]) => k)

    // Pinned alone = plausibly deliberate. Leave it and say so.
    if (others.length === 0) { skippedSolo++; continue }

    unpin.push({ row: r, others })
  }

  console.log(`\nactive rows                                  : ${rows.length}`)
  console.log(`deadline pinned to a real date (left alone)  : ${skippedHasDate}`)
  console.log(`deadline pinned to null, ON ITS OWN          : ${skippedSolo}  (possibly deliberate — not touched)`)
  console.log(`\nTO UNPIN (pinned null + saved alongside others): ${unpin.length}\n`)
  for (const u of unpin.slice(0, 20)) {
    console.log(`  ${(u.row.funder ?? '').slice(0, 30).padEnd(30)} ${u.row.title.slice(0, 32).padEnd(32)} +${u.others.length} fields in the same save`)
  }
  if (unpin.length > 20) console.log(`  ... and ${unpin.length - 20} more`)

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  // Written directly, not through mergeGrantUpdate: this edits provenance
  // itself rather than a tracked value, and the merger has no vocabulary for
  // "remove a pin". Only the `pinned` flag changes — source and set_at are kept
  // so the history of who set it, and when, survives.
  let done = 0, failed = 0
  for (const u of unpin) {
    const fp = { ...(u.row.field_provenance ?? {}) }
    fp.deadline = { ...fp.deadline, pinned: false }
    const { error: e } = await db.from('scraped_grants').update({ field_provenance: fp }).eq('id', u.row.id)
    if (e) { failed++; console.error(`  failed ${u.row.id}: ${e.message}`) }
    else done++
  }
  console.log(`\nunpinned ${done}, failed ${failed}\n`)
}

main()
