// Record a SCRIPT's eligible_structures work as a script's, not a person's.
//
//   npx tsx scripts/relabel-script-written-structures.ts          # dry run
//   npx tsx scripts/relabel-script-written-structures.ts --apply
//
// WHY
// 171 live rows have eligible_structures locked at admin authority, which
// blocks every automated correction — including the vocabulary widening shipped
// 2026-07-26, which was rejected on 69 rows for exactly this reason.
//
// 56 of those were written by an ops script, not by anyone reviewing the fund.
// mergeGrantUpdate treats any source beginning `admin:` as a human override, so
// a batch identifying itself as `admin:tagging_fix_...` was recorded with the
// same authority as Paul opening the row and deciding. Nobody made those calls.
//
// ── TWO LOCKS, NOT ONE ──
// Clearing `pinned` is NOT enough, and assuming otherwise cost a wasted pass on
// 2026-07-26: the pin and the trust ladder are independent. Even unpinned, a
// source of `admin:*` scores 100 and still outranks the backstop's
// `ai_classifier:*` (60), so all 69 writes were rejected a second time with the
// pins already gone.
//
// So this does BOTH: clears the pin AND rewrites the source prefix `admin:` ->
// `system:` (100 -> 50). The batch name is preserved verbatim, so the record of
// which run set the value survives intact. Only the claim that a human decided
// it is withdrawn, because that claim was never true.
//
//   admin:tagging_fix_2026-06-17                 33
//   admin:charity_form_jurisdiction_2026-07-25   15
//   admin:structure-gate-2026-05-31               3
//   admin:innovate-uk-batch-2026-06-01            3
//   admin:devi-coverage-batch-2026-05-31          1
//   admin:the-fore-enrichment-2026-06-01          1
//
// ── DELIBERATELY NARROW ──
// A source containing "@" is a real person saving the form and is NEVER touched
// here, even though most of those are probably form-save artefacts too. The
// difference is that a person WAS on the screen, so some of them are genuine
// decisions and the data cannot tell which. Those are left to correct naturally
// as rows are reviewed.
//
// This changes NO value. It only lets automated writes reach the field again.
// set_at is preserved; re-pinning is one admin edit if a call turns out to have
// been real.
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
type Row = {
  id: string
  title: string | null
  funder: string | null
  eligible_structures: string[] | null
  field_provenance: Record<string, Prov> | null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, title, funder, eligible_structures, field_provenance')
      .eq('is_active', true)
      .range(from, from + 999)
    if (error) { console.error('query failed:', error.message); process.exit(1) }
    rows.push(...(data ?? []) as unknown as Row[])
    if (!data || data.length < 1000) break
  }

  const unpin: Array<{ row: Row; source: string }> = []
  let keptPerson = 0
  const bySource = new Map<string, number>()

  for (const r of rows) {
    const p = (r.field_provenance ?? {}).eligible_structures
    const source = String(p?.source ?? '')
    // Selected on SOURCE, not on the pin. The pin is only half the lock, and a
    // partial earlier pass may already have cleared it while leaving the
    // trust-100 source in place — which is exactly the state that looked fixed
    // and was not.
    if (!source.startsWith('admin:')) continue
    // `admin:legacy` is NOT an authority claim and must not be relabelled. The
    // Phase A backfill stamped it on every row whose real origin was unknown,
    // and trustOf() already special-cases it to 35 — below the scraper, well
    // below the backstop. It locks nothing. Rewriting it to `system:` would
    // RAISE it to 50 and make 59 rows harder to correct, not easier.
    if (source === 'admin:legacy') continue
    // A person was on the screen. Not ours to undo.
    if (source.includes('@')) { keptPerson++; continue }
    unpin.push({ row: r, source })
    bySource.set(source, (bySource.get(source) ?? 0) + 1)
  }

  console.log(`\nactive rows scanned                     : ${rows.length}`)
  console.log(`set by a person (left alone)            : ${keptPerson}`)
  console.log(`set by a script (TO RELABEL)            : ${unpin.length}\n`)
  for (const [src, n] of Array.from(bySource.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${src}`)
  }
  console.log('\nsample:')
  for (const u of unpin.slice(0, 12)) {
    console.log(`  ${(u.row.funder ?? '').slice(0, 34).padEnd(34)} ${(u.row.eligible_structures ?? []).join(', ').slice(0, 60)}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  // Written directly, not through mergeGrantUpdate: this edits provenance
  // itself rather than a tracked value, and the merger has no vocabulary for
  // "withdraw an authority claim".
  let done = 0, failed = 0
  for (const u of unpin) {
    const fp = { ...(u.row.field_provenance ?? {}) }
    fp.eligible_structures = {
      ...fp.eligible_structures,
      pinned: false,
      source: u.source.replace(/^admin:/, 'system:'),
    }
    const { error } = await db.from('scraped_grants').update({ field_provenance: fp }).eq('id', u.row.id)
    if (error) { failed++; console.error(`  failed ${u.row.id}: ${error.message}`) }
    else done++
  }
  console.log(`\nrelabelled ${done}, failed ${failed}\n`)
}

main()
