// Remove jurisdiction-impossible charity forms from eligible_structures.
//
// WHY
// ensureExplicitStructures used to add registered_charity + cio + scio on any
// mention of "charit", ignoring geography. A CIO is England-and-Wales (Charity
// Commission); a SCIO is Scotland (OSCR). The cause is fixed and deployed, but
// the backstop is add-only, so wrong tags already in the catalogue stay.
//
// Live examples found 2026-07-25: ALL 5 Oxfordshire rows, ALL 4 Berkshire rows
// and 4 of the 6 rows tagged "England & Wales" carried scio. A SCIO cannot apply
// to an Oxfordshire fund.
//
// This is the OVER-tagging direction: it shows a fund to organisations that
// cannot legally apply. That wastes an applicant's time, which is the most
// expensive kind of error this catalogue can make.
//
//   npx tsx scripts/fix-scio-jurisdiction.ts          # dry run (default)
//   npx tsx scripts/fix-scio-jurisdiction.ts --apply  # write
//
// ── Safety ──
// This REMOVES values, so it is deliberately conservative:
//   - Uses the SAME exported charityFormJurisdiction() rule as the add path, so
//     the two directions cannot disagree.
//   - SKIPS any row with no location_tag. Removing on the strength of noisy
//     prose is not worth the risk, and it is 1 row in 731.
//   - Only ever touches 'scio' and 'cio'. Nothing else in the array is altered.
//   - Never empties the array: if the removal would leave nothing, the row is
//     skipped and reported, because an empty eligible_structures matches nobody
//     and is worse than a slightly wrong one.
//
// Writes as ai_classifier:structures_jurisdiction:v1 (trust 60, equal to
// ai_classifier:v3 — the merger accepts equal trust). Not an admin: source,
// which would pin at 100 and block future AI correction.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { charityFormJurisdiction } from '../src/lib/classify'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'ai_classifier:structures_jurisdiction:v1'

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, location_tag, eligible_structures, field_provenance')
    .eq('is_active', true)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = {
    id: string; title: string; funder: string | null
    location_tag: string | null
    eligible_structures: string[] | null
    field_provenance: Record<string, unknown> | null
  }
  const rows = (data ?? []) as unknown as Row[]

  const changes: Array<{ row: Row; before: string[]; after: string[]; removed: string[] }> = []
  let skippedNoTag = 0
  let skippedWouldEmpty = 0

  for (const r of rows) {
    const cur = r.eligible_structures ?? []
    if (cur.length === 0) continue

    const tag = (r.location_tag ?? '').trim()
    if (tag === '') { skippedNoTag++; continue }   // never remove on prose alone

    const { scioAllowed, cioAllowed } = charityFormJurisdiction({ locationTag: tag })

    const drop: string[] = []
    if (cur.includes('scio') && !scioAllowed) drop.push('scio')
    if (cur.includes('cio')  && !cioAllowed)  drop.push('cio')
    if (drop.length === 0) continue

    const after = cur.filter(s => !drop.includes(s))
    if (after.length === 0) { skippedWouldEmpty++; continue }

    changes.push({ row: r, before: cur, after, removed: drop })
  }

  const pinned = changes.filter(c => {
    const p = c.row.field_provenance?.eligible_structures as Record<string, unknown> | undefined
    return p?.pinned === true
  })

  console.log(`\nactive rows scanned: ${rows.length}`)
  console.log(`rows to correct: ${changes.length}`)
  console.log(`  of which admin-pinned (write will be rejected): ${pinned.length}`)
  console.log(`skipped, no location_tag (too risky to remove): ${skippedNoTag}`)
  console.log(`skipped, removal would empty the array: ${skippedWouldEmpty}\n`)

  const tally = new Map<string, number>()
  for (const c of changes) for (const d of c.removed) tally.set(d, (tally.get(d) ?? 0) + 1)
  console.log('forms to remove:')
  for (const [k, v] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`)
  }

  const byTag = new Map<string, number>()
  for (const c of changes) byTag.set(c.row.location_tag!, (byTag.get(c.row.location_tag!) ?? 0) + 1)
  console.log('\nby location_tag:')
  for (const [k, v] of Array.from(byTag.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(v).padStart(4)}  ${k}`)
  }

  console.log('\nsample (first 15):')
  for (const c of changes.slice(0, 15)) {
    console.log(`  ${(c.row.location_tag ?? '').slice(0, 18).padEnd(18)} ${(c.row.funder ?? '').slice(0, 28).padEnd(28)} − ${c.removed.join(', ')}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let applied = 0, rejected = 0, failed = 0
  for (const c of changes) {
    try {
      const res = await mergeGrantUpdate({
        id: c.row.id,
        fields: { eligible_structures: c.after },
        source: SOURCE,
        pinned: false,
        db,
      })
      if (res.applied.includes('eligible_structures')) applied++
      else rejected++
    } catch (err) {
      failed++
      console.error(`  failed: ${c.row.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()
