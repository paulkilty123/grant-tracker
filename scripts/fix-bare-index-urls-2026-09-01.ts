// A funder's homepage is not its funding index.
//
// Paul's spot check request, 2026-09-01: "The 71 index URLs were copied from a
// sibling row on the same domain. That's an inference, not an observation."
// Correct, and the inference inherits whatever was wrong in the source row.
//
// Five checked, THREE GOOD AND TWO WRONG. Baring Foundation
// (/our-grantmaking/current-funding-opportunities), Sussex CF (/grants) and
// Ffilm Cymru (/funding-and-training) are genuine funding indexes. Both Social
// Investment Business rows were pointed at `https://www.sibgroup.org.uk` — the
// HOMEPAGE — which mentions "grant" and "fund" only in its nav.
//
// The propagation did not invent that. Some earlier row recorded a bare origin
// as the index and the copy spread it across the domain, which is exactly the
// failure mode of copying rather than observing.
//
// SCALE: 73 of 191 rows with an index have a bare origin — no path at all. That
// predates tonight; the propagation added to a pile rather than starting one.
//
// WHY IT MATTERS EVEN THOUGH IT IS INERT TODAY. `describesADiscreteFund` only
// suppresses a wrong-fund verdict when apply_url EQUALS the recorded index, and
// on most of these it does not, so nothing is being wrongly suppressed right
// now. But 12 rows DO have apply_url === a bare homepage, and on those the guard
// is one title-word away from silencing a real finding — and the field is
// supposed to mean "the funder's index of its funds", which a homepage is not.
//
// The fix is to CLEAR, never to guess a better one. An empty index means the
// guard declines to act, which is the safe direction: the row keeps whatever
// finding it has and a human can set a real index later.
//
// DRY BY DEFAULT.  npx tsx --env-file=.env.local scripts/fix-bare-index-urls-2026-09-01.ts [--live]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}
const LIVE = process.argv.includes('--live')

/** No path beyond "/" — a homepage, whatever it says in its nav. */
function isBareOrigin(u: string): boolean {
  try { return new URL(u).pathname.replace(/\/+$/, '') === '' } catch { return false }
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rows: Record<string, unknown>[] = []
  for (let f = 0; f < 6000; f += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, funder, apply_url, funding_index_url, is_active')
      .not('pipeline_state', 'in', '("rejected","archived")').order('id').range(f, f + 499)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? [])); if ((data ?? []).length < 500) break
  }

  const bare = rows.filter(r => r.funding_index_url && isBareOrigin(String(r.funding_index_url)))
  const norm = (u: unknown) => String(u ?? '').trim().toLowerCase().replace(/\/+$/, '')
  const guardable = bare.filter(r => norm(r.apply_url) === norm(r.funding_index_url))

  console.log(LIVE ? '── LIVE ──' : '── DRY RUN — nothing will be written ──')
  console.log(`\n${rows.length} rows scanned, ${rows.filter(r => r.funding_index_url).length} carry an index`)
  console.log(`${bare.length} of those are a bare homepage`)
  console.log(`${guardable.length} of THOSE have apply_url === index, where the front-door guard could act\n`)

  for (const r of bare.sort((a, b) => Number(b.is_active) - Number(a.is_active))) {
    const flag = norm(r.apply_url) === norm(r.funding_index_url) ? ' [guard could act]' : ''
    console.log(`  ${r.is_active ? 'LIVE' : 'hid '} ${String(r.funder ?? '').slice(0, 28).padEnd(28)} ${String(r.funding_index_url)}${flag}`)
  }

  if (!LIVE) {
    console.log(`\nWould clear funding_index_url on ${bare.length} row(s). Re-run with --live.`)
    return
  }

  // `funding_index_url` is NOT in TRACKED_FIELDS, so this is a plain update and
  // the trust ladder is not involved. That is also why the propagation left no
  // provenance and these had to be found by shape rather than by source.
  let cleared = 0, failed = 0
  for (const r of bare) {
    const { error } = await db.from('scraped_grants')
      .update({ funding_index_url: null }).eq('id', String(r.id))
    if (error) { failed++; console.log(`  FAILED ${String(r.id).slice(0, 8)}: ${error.message}`) }
    else cleared++
  }
  console.log(`\ncleared ${cleared}, failed ${failed}`)
}
main()
