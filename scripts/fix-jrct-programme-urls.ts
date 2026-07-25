// Point each JRCT programme row at its own page instead of the shared index.
//
// WHY
// All three catalogued JRCT rows carry apply_url = /funding-priorities, the page
// that lists all five programmes. Two consequences, both observed:
//
//   1. A reviewer opening the link to check "JRCT — Rights & Justice" sees every
//      programme except which one the row is, reads the Sustainable Future card,
//      and concludes the row is missing an `environment` tag. It is not: that tag
//      belongs to the separate Sustainable Future row, which already has it.
//   2. The enricher re-reads a page describing five different programmes and has
//      to infer which one this row is. It got it right here, but that is luck,
//      not design — and it is the same shape as the amount-from-the-wrong-column
//      and deadline-from-the-wrong-round errors.
//
// The site has per-programme pages. All three verified HTTP 200 on 2026-07-25.
//
//   npx tsx scripts/fix-jrct-programme-urls.ts          # dry run (default)
//   npx tsx scripts/fix-jrct-programme-urls.ts --apply  # write
//
// ── Provenance choice, and what actually happens ──
// Written as `admin:jrct_programme_urls_2026-07-25`.
//
// admin trust is right: a human chose these URLs and each was checked to resolve
// and to match the programme named in the row title. That is exactly the case
// the ladder reserves admin for.
//
// This script passes `pinned: false`, AND THAT IS IGNORED. grant-merge.ts:177
// auto-pins whenever an `admin:` source overrides a non-admin value, so the
// resulting provenance is `pinned: true` regardless. Verified on the live rows
// after running. Worth knowing before writing any admin: script that assumes
// pinned is a choice — for admin sources overriding automated ones, it is not.
//
// Consequence: these three URLs can now only be changed by another admin: write.
// Automated correction was already blocked the moment an admin source was
// chosen (trust 100 beats every automated source), so the pin costs little
// extra here, and `previous` is preserved so the old value can be restored. But
// if JRCT restructures its site, a crawler cannot fix these on its own — the
// review queue's link check will have to surface them for manual repair.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'admin:jrct_programme_urls_2026-07-25'
const SHARED = 'https://www.jrct.org.uk/funding-priorities'

// Matched on a distinctive fragment of the row title, not on the full string, so
// a later title tweak does not silently make this a no-op.
const MAP: Array<{ match: RegExp; url: string }> = [
  { match: /rights\s*&?\s*(and\s*)?justice/i,       url: 'https://www.jrct.org.uk/rights-and-justice' },
  { match: /power\s*&?\s*(and\s*)?accountability/i, url: 'https://www.jrct.org.uk/power-and-accountability' },
  { match: /sustainable\s*future/i,                 url: 'https://www.jrct.org.uk/sustainable-future' },
]

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, apply_url, field_provenance')
    .ilike('funder', '%Rowntree Charitable%')
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  type Row = { id: string; title: string; apply_url: string | null; field_provenance: Record<string, unknown> | null }
  const rows = (data ?? []) as Row[]

  const planned: Array<{ row: Row; url: string }> = []
  const skipped: string[] = []

  for (const r of rows) {
    const hit = MAP.find(m => m.match.test(r.title))
    if (!hit) { skipped.push(`${r.title} — no programme page known`); continue }
    // Only move rows still sitting on the shared index. If someone has already
    // set a specific URL, leave their choice alone.
    if ((r.apply_url ?? '').replace(/\/$/, '') !== SHARED) {
      skipped.push(`${r.title} — already off the shared index (${r.apply_url})`); continue
    }
    if (r.apply_url === hit.url) { skipped.push(`${r.title} — already correct`); continue }
    planned.push({ row: r, url: hit.url })
  }

  console.log(`\nJRCT rows found: ${rows.length}`)
  console.log(`to update: ${planned.length}\n`)
  for (const p of planned) {
    console.log(`  ${p.row.title}`)
    console.log(`      from ${p.row.apply_url}`)
    console.log(`      to   ${p.url}`)
  }
  if (skipped.length) {
    console.log('\nskipped:')
    for (const s of skipped) console.log(`  ${s}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let applied = 0, rejected = 0, failed = 0
  for (const p of planned) {
    try {
      const res = await mergeGrantUpdate({
        id: p.row.id,
        // url_status is reset so the checker re-verifies the new address rather
        // than carrying forward an 'ok' earned by the old one.
        fields: { apply_url: p.url, url_status: 'unchecked', url_last_checked: null },
        source: SOURCE,
        pinned: false,
        db,
      })
      if (res.applied.includes('apply_url')) applied++
      else { rejected++; console.error(`  rejected: ${p.row.title} — ${JSON.stringify(res.rejected)}`) }
    } catch (err) {
      failed++
      console.error(`  failed: ${p.row.title}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()
