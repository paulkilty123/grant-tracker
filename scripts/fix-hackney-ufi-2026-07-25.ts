// Resolve the two duplicate pairs left over from the shared-apply_url audit.
//
//   npx tsx scripts/fix-hackney-ufi-2026-07-25.ts          # dry run (default)
//   npx tsx scripts/fix-hackney-ufi-2026-07-25.ts --apply  # write
//
// ── HACKNEY ──
// Two rows, byte-identical titles, same funder, same fund. The live page decides
// which survives: "You have until 5pm on 31 August 2026 to apply".
//   keep    e73119cf — published, deadline 2026-08-31 (matches), deep link to the
//                      2026-27 programme, fields set by admin
//   archive ecc51127 — seed:legacy, awaiting review, deadline null, description
//                      still claims the round "closes 31 January"
// Neither row has any user interactions, so nothing is lost.
//
// NOT touched: the keeper's amount reads null–£2,500, but its own brief says
// £2,500 is the activation-funding cap for equipment "on top of project costs",
// so it is probably not the grant ceiling. Those fields are admin-pinned and the
// live page states no figure, so correcting them is a human call, not this
// script's.
//
// ── UFI ──
// Both rows were funder-level umbrellas; neither title is Ufi's wording. Ufi's
// own page (modified 2026-06-08) states "Grant funding for vocational technology
// from £30k to £150k".
//   keep    37a8f875 — real funder name, published, holds a user's saved
//                      interaction, and its funder_brief ALREADY says £30k–£150k
//                      while its amount fields said £10k–£250k
//   archive 3d144f51 — "VocTech Impact Fund", a name Ufi has never used, with a
//                      £50k–£500k range matching none of its four programmes
//
// The row was not the root cause: those values were literals in crawl.ts's
// crawlUfiVocTech, a function named like a scraper that fetched nothing and
// upserted daily, so every correction was overwritten by the next crawl. That
// seed has been deleted in the same commit. Archiving alone would have left the
// crawl rewriting an archived row's contents nightly.
//
// ── PROVENANCE on the amount correction ──
// `admin:ufi_amount_correction_2026-07-25`, pinned: false.
//
// admin trust is required, not preferred: the current amount source is
// `admin:legacy` at trust 100, so a system-level write would simply be refused —
// which is exactly why ai_enrich has never been able to fix these figures.
//
// pinned: false IS honoured here, unlike the JRCT run. grant-merge.ts:177 only
// auto-pins when an admin source overrides a NON-admin value; admin-over-admin
// leaves the flag alone. Verified after running.

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

const HACKNEY_KEEP    = 'e73119cf-dfb8-493b-bf20-8da65285eca3'
const HACKNEY_ARCHIVE = 'ecc51127-8d55-40df-aebf-02274d9593ac'
const UFI_KEEP        = '37a8f875-7834-495f-8e14-a0fade147ebf'
const UFI_ARCHIVE     = '3d144f51-ecc8-4413-b760-021684a6e442'

const ARCHIVE = [
  { id: HACKNEY_ARCHIVE, title: 'Hackney — Project Innovation Fund (seed duplicate)',
    reason: 'Duplicate of the curated Hackney Project Innovation Fund row. This copy is seed:legacy, carries no deadline, and its description still says the round closes 31 January; the funder page says applications run until 5pm on 31 August 2026.' },
  { id: UFI_ARCHIVE, title: 'Ufi VocTech Trust — VocTech Impact Fund',
    reason: 'Not a real fund. The name and its £50,000-£500,000 range were hardcoded literals in crawl.ts, not read from Ufi. Ufi has never used this name and the range matches none of its four programmes. Duplicate of the Ufi VocTech Trust row; the seed that generated it has been removed.' },
]

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const ids = [HACKNEY_KEEP, HACKNEY_ARCHIVE, UFI_KEEP, UFI_ARCHIVE]
  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, is_active, pipeline_state, amount_min, amount_max, external_id')
    .in('id', ids)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const rows = new Map((data ?? []).map(r => [r.id as string, r as {
    id: string; title: string; is_active: boolean; pipeline_state: string
    amount_min: number | null; amount_max: number | null; external_id: string | null
  }]))

  // Never archive a duplicate into a keeper that is not live.
  for (const [k, label] of [[HACKNEY_KEEP, 'Hackney'], [UFI_KEEP, 'Ufi']] as const) {
    const r = rows.get(k)
    if (!r?.is_active) { console.error(`ABORT: ${label} keeper is not active`); process.exit(1) }
  }

  const keys = ARCHIVE.flatMap(a => {
    const r = rows.get(a.id)
    return r?.external_id ? [a.id, r.external_id] : [a.id]
  })
  const { data: ints } = await db.from('grant_interactions').select('grant_id').in('grant_id', keys)
  console.log(`\ninteractions attached to the rows being archived: ${(ints ?? []).length}`)

  console.log('\nARCHIVE:')
  for (const a of ARCHIVE) {
    const r = rows.get(a.id)
    console.log(`  ${r ? (r.is_active ? 'LIVE' : 'off ') : '????'} ${a.title}`)
    console.log(`       ${a.reason}`)
  }

  const ufi = rows.get(UFI_KEEP)!
  console.log('\nAMOUNT CORRECTION on the surviving Ufi row:')
  console.log(`  from £${ufi.amount_min} - £${ufi.amount_max}`)
  console.log(`  to   £30000 - £150000   ("Grant funding for vocational technology from £30k to £150k", ufi.co.uk/grant-funding/)`)

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  const res = await mergeGrantUpdate({
    id: UFI_KEEP,
    fields: { amount_min: 30000, amount_max: 150000 },
    source: 'admin:ufi_amount_correction_2026-07-25',
    pinned: false,
    db,
  })
  console.log(`\namounts applied: ${JSON.stringify(res.applied)}  rejected: ${JSON.stringify(res.rejected)}`)

  let archived = 0, failed = 0
  for (const a of ARCHIVE) {
    const { error: e } = await db
      .from('scraped_grants')
      .update({ is_active: false, pipeline_state: 'archived', rejection_reason: a.reason })
      .eq('id', a.id)
    if (e) { failed++; console.error(`  failed: ${a.title}: ${e.message}`) }
    else archived++
  }
  console.log(`archived ${archived}, failed ${failed}\n`)
}

main()
