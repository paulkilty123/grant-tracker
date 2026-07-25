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
// For rows whose eligible_structures is admin-pinned at trust 100, a trust-60
// write is refused. --override-pinned re-runs those under a named admin batch,
// matching the existing admin:tagging_fix_2026-06-17 convention. Justified here
// and NOT in general: "a CIO cannot exist in Scotland" is a legal fact, not a
// model guess, so pinning it is correct rather than the usual anti-pattern.
const OVERRIDE_SOURCE = 'admin:charity_form_jurisdiction_2026-07-25'

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

  const changes: Array<{ row: Row; before: string[]; after: string[]; removed: string[]; added: string[] }> = []
  let skippedNoTag = 0
  let skippedWouldEmpty = 0

  for (const r of rows) {
    const cur = r.eligible_structures ?? []
    if (cur.length === 0) continue

    const tag = (r.location_tag ?? '').trim()
    if (tag === '') { skippedNoTag++; continue }   // never remove on prose alone

    const { scioAllowed, cioAllowed } = charityFormJurisdiction({ locationTag: tag })

    // SWAP, don't drop. A CIO and a SCIO are the same thing either side of the
    // border: the incorporated form of a registered charity. Removing the wrong
    // one without adding the right one leaves a fund that accepts charities with
    // no incorporated-charity form at all, which NARROWS eligibility — the very
    // error this file exists to correct, just pointed the other way.
    //
    // The first version of this script did exactly that: it dropped `cio` from 7
    // Scottish funds (Creative Scotland Open Fund, sportscotland, TNLCF Scotland,
    // Scottish Land Fund and others) without adding `scio`. This branch repairs
    // that and prevents a repeat.
    let after = [...cur]
    const removed: string[] = []
    const added: string[] = []

    if (after.includes('scio') && !scioAllowed) {
      after = after.filter(s => s !== 'scio'); removed.push('scio')
      if (cioAllowed && !after.includes('cio')) { after.push('cio'); added.push('cio') }
    }
    if (after.includes('cio') && !cioAllowed) {
      after = after.filter(s => s !== 'cio'); removed.push('cio')
      if (scioAllowed && !after.includes('scio')) { after.push('scio'); added.push('scio') }
    }

    // Repair pass — deliberately narrow. Only rows THIS SCRIPT already narrowed
    // in an earlier run, identified by its own provenance source. Without that
    // guard the condition below fires on any charity-accepting fund missing an
    // incorporated form, which in a dry run reached hundreds of rows (Idlewild
    // Trust, Variety Club, Historic England). That may well be a defensible
    // widening, but it is a different decision from "repair what I broke" and
    // must not ride along on the authorisation for this fix.
    const narrowedByThisScript =
      (r.field_provenance?.eligible_structures as Record<string, unknown> | undefined)?.source === SOURCE

    if (narrowedByThisScript && after.includes('registered_charity')) {
      if (scioAllowed && !after.includes('scio') && !after.includes('cio')) {
        after.push('scio'); added.push('scio')
      } else if (cioAllowed && !after.includes('cio') && !after.includes('scio')) {
        after.push('cio'); added.push('cio')
      }
    }

    if (removed.length === 0 && added.length === 0) continue
    if (after.length === 0) { skippedWouldEmpty++; continue }

    changes.push({ row: r, before: cur, after, removed, added })
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
  for (const c of changes) {
    for (const d of c.removed) tally.set(`- ${d}`, (tally.get(`- ${d}`) ?? 0) + 1)
    for (const a of c.added)   tally.set(`+ ${a}`, (tally.get(`+ ${a}`) ?? 0) + 1)
  }
  console.log('changes:')
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
    const ops = [...c.removed.map(x => `−${x}`), ...c.added.map(x => `+${x}`)].join(' ')
    console.log(`  ${(c.row.location_tag ?? '').slice(0, 18).padEnd(18)} ${(c.row.funder ?? '').slice(0, 28).padEnd(28)} ${ops}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  const override = process.argv.includes('--override-pinned')
  let applied = 0, rejected = 0, failed = 0, overridden = 0
  for (const c of changes) {
    const isPinned = (c.row.field_provenance?.eligible_structures as Record<string, unknown> | undefined)?.pinned === true
    const useOverride = override && isPinned
    try {
      const res = await mergeGrantUpdate({
        id: c.row.id,
        fields: { eligible_structures: c.after },
        source: useOverride ? OVERRIDE_SOURCE : SOURCE,
        pinned: useOverride,
        db,
      })
      if (res.applied.includes('eligible_structures')) { applied++; if (useOverride) overridden++ }
      else rejected++
    } catch (err) {
      failed++
      console.error(`  failed: ${c.row.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied} (${overridden} via admin override), rejected ${rejected}, failed ${failed}\n`)
}

main()
