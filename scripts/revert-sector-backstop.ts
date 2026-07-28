// Undo the impact_sectors backstop applied 2026-07-28.
//
//   npx tsx scripts/revert-sector-backstop.ts           # dry run
//   npx tsx scripts/revert-sector-backstop.ts --apply
//
// WHY IT IS BEING UNDONE
// The vocabulary technique that works for eligible_structures and
// target_beneficiaries is harmful for impact_sectors, because the matcher's
// themes dimension scores PROPORTIONAL overlap rather than hit count. Adding a
// real but peripheral sector lowers the grant's score against every org that
// does not share it:
//
//   Selco Community Heroes  + justice -> themes 36/50 -> 26/50, score 76 -> 66
//   Lloyds "New Beginnings" + health  -> themes 18/35 -> 15/35, score 72 -> 69
//
// Both additions were correct readings of the funders' own text. They still
// made the matches worse. Mustard Tree's 70%+ matches fell from 8 to 6 and a
// theatre fund and a heritage research fund entered a homelessness charity's
// top 15.
//
// HOW THE PREVIOUS VALUE IS RECOVERED
// mergeGrantUpdate stores no prior value, but ensureExplicitSectors is
// deterministic and APPENDS: after === [...before, ...newAdds]. So `before` is
// a prefix of `after`, and the true prefix is the LONGEST one that still
// reproduces `after` when passed back through the function while differing from
// it (the backfill only wrote rows where something was actually added).
//
// Rows where no prefix reproduces `after` are reported, not guessed at — those
// need a real re-classify rather than a reconstruction.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureExplicitSectors } from '../src/lib/sector-vocabulary'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const BACKSTOP_SOURCE = 'ai_classifier:sector_backstop:v1'
const RESTORE_SOURCE  = 'ai_classifier:v3'

type Row = {
  id: string
  funder: string | null
  title: string | null
  description: string | null
  impact_sectors: string[] | null
  funder_brief: { what_they_fund?: unknown; who_can_apply?: unknown } | null
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, funder, title, description, impact_sectors, funder_brief')
    .eq('field_provenance->impact_sectors->>source', BACKSTOP_SOURCE)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Row[]

  const restorable: { row: Row; before: string[]; after: string[] }[] = []
  const unrecoverable: Row[] = []

  for (const r of rows) {
    const brief = r.funder_brief ?? {}
    // Must reproduce the EXACT source string the backfill used, or the
    // reconstruction is meaningless.
    const src = [
      r.title ?? '',
      r.description ?? '',
      typeof brief.what_they_fund === 'string' ? brief.what_they_fund : '',
      typeof brief.who_can_apply === 'string' ? brief.who_can_apply : '',
    ].join('. ').trim()
    const after = r.impact_sectors ?? []

    let found: string[] | null = null
    for (let k = after.length - 1; k >= 0; k--) {
      const candidate = after.slice(0, k)
      if (same(ensureExplicitSectors(candidate, src), after)) { found = candidate; break }
    }
    if (!found || !found.length) { unrecoverable.push(r); continue }
    restorable.push({ row: r, before: found, after })
  }

  console.log(`\nrows written by the backstop : ${rows.length}`)
  console.log(`reconstructable              : ${restorable.length}`)
  console.log(`NOT reconstructable          : ${unrecoverable.length}  (left alone, need a re-classify)\n`)
  for (const r of restorable.slice(0, 15)) {
    console.log(`  ${(r.row.funder ?? '').slice(0, 34).padEnd(34)} [${r.after.join(',')}]  ->  [${r.before.join(',')}]`)
  }
  for (const u of unrecoverable.slice(0, 10)) {
    console.log(`  UNRECOVERABLE  ${u.funder} — [${(u.impact_sectors ?? []).join(',')}]`)
  }

  if (!apply) { console.log('\nDRY RUN — nothing written.\n'); return }

  let done = 0, failed = 0
  for (const r of restorable) {
    const result = await mergeGrantUpdate({
      id: r.row.id,
      fields: { impact_sectors: r.before },
      source: RESTORE_SOURCE,
      pinned: false,
      db,
    })
    if (result.applied.includes('impact_sectors')) done++
    else failed++
  }
  console.log(`\nreverted ${done}, failed ${failed}\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
