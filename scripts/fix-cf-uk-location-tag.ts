// A community foundation is not UK-wide.
//
// WHY
// Berkshire Community Foundation and Kent Community Foundation both carry
// location_tag='UK', stamped seed:legacy. A community foundation is defined by
// its geography — Berkshire's own description says "communities across
// Berkshire" — so the tag is simply wrong.
//
// It matters because location_tag is not just a display label. It is the input
// to charityFormJurisdiction(), which decides whether a SCIO may apply. A 'UK'
// tag reads as UK-wide, so the structures backstop proposed adding `scio` to
// Berkshire Community Foundation: a Scottish charity invited to apply to a
// Berkshire fund. That is the over-tagging direction, which wastes an
// applicant's time, and scripts/fix-scio-jurisdiction.ts records Berkshire rows
// as a known instance of exactly this.
//
// The text-vs-tag override added to charityFormJurisdiction on 2026-07-26 does
// not catch this case: it keys off the words "England"/"Wales", and these rows
// say "Berkshire" and "Kent". Enumerating every English county is not a rule
// worth writing, so the data is corrected instead of the regex.
//
//   npx tsx scripts/fix-cf-uk-location-tag.ts          # dry run (default)
//   npx tsx scripts/fix-cf-uk-location-tag.ts --apply
//
// Writes as system:location_tag_cf_fix:v1 — trust 50. Both rows currently hold
// seed:legacy (trust 25) and are unpinned, so the write is accepted. Not an
// admin: source, which would pin at trust 100 and block future AI correction.

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

const SOURCE = 'system:location_tag_cf_fix:v1'

/** Derived from the funder name, which is where a community foundation states
 *  its geography. Kept explicit rather than parsed, because two rows do not
 *  justify a name-parsing rule that would then need its own edge cases. */
const FIXES: { match: string; tag: string }[] = [
  { match: 'Berkshire Community Foundation', tag: 'Berkshire' },
  { match: 'Kent Community Foundation',      tag: 'Kent' },
]

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, funder, title, location_tag')
    .ilike('location_tag', 'uk')
    .in('funder', FIXES.map(f => f.match))
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  const rows = (data ?? []) as { id: string; funder: string; title: string; location_tag: string }[]
  if (rows.length === 0) { console.log('\nNothing to fix.\n'); return }

  console.log(`\n${rows.length} row(s) to correct:\n`)
  for (const r of rows) {
    const tag = FIXES.find(f => f.match === r.funder)?.tag
    console.log(`  ${r.funder.padEnd(34)} ${r.location_tag} -> ${tag}`)
  }

  if (!apply) { console.log('\nDRY RUN — nothing written. Re-run with --apply.\n'); return }

  let applied = 0, rejected = 0
  for (const r of rows) {
    const tag = FIXES.find(f => f.match === r.funder)!.tag
    const res = await mergeGrantUpdate({
      id: r.id, fields: { location_tag: tag }, source: SOURCE, pinned: false, db,
    })
    // Never assume the write landed. The trust ladder rejects silently and
    // almost every caller in this codebase counts a rejection as a success.
    if (res.applied.includes('location_tag')) applied++
    else { rejected++; console.warn(`  rejected: ${r.funder} — ${res.rejected.map(x => x.reason).join(', ')}`) }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}\n`)
}

main()
