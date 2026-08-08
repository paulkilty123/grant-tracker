// Backfill implicit charity-form equivalents onto existing rows.
//
//   npx tsx scripts/backfill-structure-equivalents.ts            # dry run
//   npx tsx scripts/backfill-structure-equivalents.ts --apply    # write
//
// The derivation now runs on every write via mergeGrantUpdate, so new and
// re-classified rows are correct going forward. This catches the rows that
// were tagged before it existed and will not otherwise be touched until their
// next re-enrichment — up to 90 days away, and never for rows the reenrich
// cron cannot reach.
//
// WRITES AT ai_enrich TRUST, NOT admin. Expanding "registered charities" into
// the equivalent Scottish or E&W form is a derivation, not a human decision.
// Stamping it admin would pin the field at trust 100 and permanently block
// every future AI correction on it — the doom loop this catalogue spent a month
// climbing out of.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { deriveEquivalentStructures } from '../src/lib/structure-equivalents'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // Page explicitly: supabase-js silently caps at 1000 rows, and this table has
  // more. A capped read here would report a clean backfill over a partial set.
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('scraped_grants')
      .select('id, title, funder, eligible_structures, location_tag, funder_brief, is_active, url_status')
      .range(from, from + 999)
    if (error) { console.error('read failed:', error.message); process.exit(1) }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  console.log(`read ${rows.length} rows\n`)

  const changes: { id: string; title: string; before: string[]; after: string[]; added: string[] }[] = []
  for (const r of rows) {
    const before = (r.eligible_structures as string[] | null) ?? []
    const brief = r.funder_brief as Record<string, unknown> | null
    const geo = [r.location_tag, brief?.geographic_focus].filter(Boolean).join(' ')
    const elig = [brief?.who_can_apply, brief?.exclusions].filter(Boolean).join(' ')
    const after = deriveEquivalentStructures(before, geo, elig)
    const added = after.filter(s => !before.includes(s))
    if (added.length > 0) {
      changes.push({
        id: String(r.id), title: String(r.title),
        before, after, added,
      })
    }
  }

  const tally = new Map<string, number>()
  for (const c of changes) tally.set(c.added.join('+'), (tally.get(c.added.join('+')) ?? 0) + 1)
  console.log(`${changes.length} rows would change:`)
  for (const [k, n] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  +${k}`)
  }
  console.log('\nsample:')
  for (const c of changes.slice(0, 8)) {
    console.log(`  ${c.title.slice(0, 50)}`)
    console.log(`     ${c.before.join(', ')}  ->  +${c.added.join('+')}`)
  }

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); return }

  let ok = 0, skipped = 0
  for (const c of changes) {
    const res = await mergeGrantUpdate({
      id: c.id,
      fields: { eligible_structures: c.after },
      source: 'ai_enrich:structure_equivalents:v1',
      db,
    })
    if (res.applied.includes('eligible_structures')) ok++
    else { skipped++; console.log(`  skipped ${c.title.slice(0, 40)} — ${res.rejected[0]?.reason ?? 'unknown'}`) }
  }
  console.log(`\nwritten ${ok}, skipped ${skipped} (skips are pinned fields — admin decisions the ladder protects)`)
}

main().catch(e => { console.error(e); process.exit(1) })
