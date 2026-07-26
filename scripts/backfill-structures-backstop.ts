// Re-apply the deterministic eligible_structures backstop to the live catalogue.
//
// WHY
// The classifier had been narrowing eligibility: production's
// ensureExplicitStructures mapped "social enterprise" to the two CIC variants
// only, so funds whose own text says "any legal form" / "no legal structure
// restrictions" / "businesses" were tagged CIC-only. 50 of the 145 re-classify
// diffs on 2026-07-25 had REMOVED structures, the same three over and over:
// cooperative, ltd_guarantee, ltd_shares.
//
// The fix (69e78b7 + the explicit-breadth rule) is deployed, so NEW re-reads are
// correct. But the backstop is ADD-ONLY and rows are only re-read every ~90
// days, so already-narrowed rows do not self-heal. This closes that gap.
//
// No LLM calls. ensureExplicitStructures is deterministic and add-only, so this
// re-applies it to the CURRENT stored value + the CURRENT brief text. It can
// only widen; it can never drop a structure.
//
//   npx tsx scripts/backfill-structures-backstop.ts            # dry run (default)
//   npx tsx scripts/backfill-structures-backstop.ts --apply    # write
//   npx tsx scripts/backfill-structures-backstop.ts --apply --limit 20
//
// Writes as ai_classifier:structures_backstop:v1 — trust 60, equal to
// ai_classifier:v3, which the merger accepts (it rejects only on STRICTLY lower
// trust). Deliberately not an admin: source, which would pin the value at trust
// 100 and permanently block future AI correction.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureExplicitStructures } from '../src/lib/classify'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'ai_classifier:structures_backstop:v1'

async function main() {
  const apply = process.argv.includes('--apply')
  const limArg = process.argv.indexOf('--limit')
  const limit = limArg > -1 ? parseInt(process.argv[limArg + 1], 10) : Infinity

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Scope. Default is the live catalogue, which is what this script was written
  // for. `--recoverable` points it at the inactive rows whose link still
  // resolves: the 2026-07-26 triage found 40 of those carry no eligibility at
  // all, which is the single largest mechanical bucket blocking reactivation.
  // They are unreachable from the default scope precisely because they are off,
  // which is the same shape as the validator deadlock — a row held back for a
  // defect that nothing in scope was able to repair.
  const recoverable = process.argv.includes('--recoverable')

  // `--empty-only` restricts to rows carrying NO eligibility at all.
  //
  // Those are a different proposition from widening a row that already has
  // structures. An empty eligible_structures does not hide a row: matching.ts
  // only applies the hard structure gate when the array is non-empty, so an
  // untagged fund falls through to soft matching and is shown to organisations
  // that cannot apply. Filling it in is therefore a correctness fix, not an
  // enrichment nicety, and it is what the publish gate blocks on.
  const emptyOnly = process.argv.includes('--empty-only')

  // `--skip <id,id>` — rows a human has looked at and ruled out.
  //
  // Used for funds whose applicant is an INDIVIDUAL rather than an organisation
  // (Wellbeing of Women's research grants go to "clinicians, midwives, nurses,
  // academics"). Giving those eligible_structures would let the publish gate
  // clear them and show a personal research grant to charities, which is worse
  // than leaving them untagged and held.
  const skipArg  = process.argv.indexOf('--skip')
  const skipIds  = new Set(skipArg > -1 ? (process.argv[skipArg + 1] ?? '').split(',').map(s => s.trim()).filter(Boolean) : [])

  let query = db
    .from('scraped_grants')
    .select('id, title, funder, description, location_tag, eligible_structures, funder_brief, field_provenance')
  query = recoverable
    ? query.eq('is_active', false).eq('url_status', 'ok').is('rejection_reason', null)
    : query.eq('is_active', true)

  const { data, error } = await query
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = {
    id: string; title: string; funder: string | null
    description: string | null
    location_tag: string | null
    eligible_structures: string[] | null
    funder_brief: Record<string, unknown> | null
    field_provenance: Record<string, unknown> | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const changes: Array<{ row: Row; before: string[]; after: string[]; added: string[] }> = []

  for (const r of rows) {
    const current = r.eligible_structures ?? []
    if (emptyOnly && current.length > 0) continue
    if (skipIds.has(r.id)) continue
    const who = typeof r.funder_brief?.who_can_apply === 'string' ? r.funder_brief.who_can_apply : ''
    const src = `${who} ${r.description ?? ''}`.trim()
    if (!src) continue

    const after = ensureExplicitStructures(current, src, { locationTag: r.location_tag })
    const added = after.filter(s => !current.includes(s))
    if (added.length > 0) changes.push({ row: r, before: current, after, added })
  }

  // Is the field admin-pinned? Those writes will be rejected; report separately
  // rather than counting them as applied.
  const pinned = changes.filter(c => {
    const p = c.row.field_provenance?.eligible_structures as Record<string, unknown> | undefined
    return p?.pinned === true
  })

  console.log(`\n${recoverable ? "recoverable inactive" : "active"} rows scanned: ${rows.length}`)
  console.log(`rows the backstop would widen: ${changes.length}`)
  console.log(`  of which admin-pinned (write will be rejected): ${pinned.length}\n`)

  const tally = new Map<string, number>()
  for (const c of changes) for (const a of c.added) tally.set(a, (tally.get(a) ?? 0) + 1)
  console.log('structures that would be added:')
  for (const [k, v] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`)
  }

  console.log('\nsample (first 15):')
  for (const c of changes.slice(0, 15)) {
    console.log(`  ${(c.row.funder ?? '').slice(0, 30).padEnd(30)} ${String(c.row.title).slice(0, 34).padEnd(34)} + ${c.added.join(', ')}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let applied = 0, rejected = 0, failed = 0
  for (const c of changes.slice(0, limit === Infinity ? changes.length : limit)) {
    try {
      const res = await mergeGrantUpdate({
        id: c.row.id,
        fields: { eligible_structures: c.after },
        source: SOURCE,
        pinned: false,
        db,
      })
      if (res.applied.includes('eligible_structures')) applied++
      else { rejected++; console.warn(`  rejected: ${c.row.funder} — ${res.rejected.map(r => r.reason).join(',')}`) }
    } catch (err) {
      failed++
      console.error(`  failed: ${c.row.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()
