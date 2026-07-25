// Split rows that share one apply_url onto their own funder pages.
//
// WHY
// 47 active rows (6% of the catalogue) share an apply_url with at least one
// other row. The link therefore cannot tell you which fund the row is about,
// with two costs, both observed live on the JRCT rows:
//
//   1. A reviewer opens the link to check a row, sees a page covering several
//      funds, and judges the row against the wrong one. A correct tag removal
//      reads as a mistake.
//   2. The enricher re-reads a page describing several funds and has to infer
//      which one the row is. Same failure shape as taking an amount from the
//      wrong column or a deadline from the wrong round.
//
// NOT EVERY SHARED URL IS A BUG. Community foundations legitimately run one
// application front door for many named funds; there is no per-fund page to
// point at, and the review queue's shared-link warning is the correct treatment.
// This script only moves rows where a dedicated page was found AND verified.
//
//   npx tsx scripts/fix-shared-apply-urls.ts <mapping.json>          # dry run
//   npx tsx scripts/fix-shared-apply-urls.ts <mapping.json> --apply  # write
//
// Mapping file: the researched verdicts, one object per row.
//   [{ id, title, verdict, url, evidence }]
//   verdict OWN_PAGE       → apply_url is rewritten to `url`
//   verdict NO_OWN_PAGE    → no write; reported as deliberately left alone
//   verdict DUPLICATE_OF:x → no write; reported for a separate dedup decision
//   verdict CLOSED         → no write; reported for a separate archive decision
//
// Only OWN_PAGE writes. Duplicates and closures are surfaced, never actioned:
// archiving a row is a catalogue decision, not a link fix, and bundling it into
// a URL pass would hide it.
//
// ── Provenance ──
// `system:shared_url_split_2026-07-25` (trust 50), unpinned.
//
// NOT `admin:` — deliberately. These URLs were found by automated research and
// checked to resolve and to name the fund, but no human has reviewed each one.
// An admin: source would stamp trust 100 AND auto-pin (grant-merge.ts:177 pins
// any admin write over a non-admin value, regardless of the pinned option),
// freezing a machine-chosen value against all future correction. That is exactly
// the pinning debt the review rebuild exists to stop creating.
//
// system (50) beats scraper (40), so the nightly crawl cannot revert these to
// the shared index, while leaving ai_enrich (60) and a real admin free to
// improve them later.

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

const SOURCE = 'system:shared_url_split_2026-07-25'

type Verdict = {
  id: string
  title: string
  verdict: string
  url: string | null
  evidence?: string
}

async function main() {
  const file = process.argv[2]
  if (!file) { console.error('usage: fix-shared-apply-urls.ts <mapping.json> [--apply]'); process.exit(1) }
  const apply = process.argv.includes('--apply')

  const verdicts = JSON.parse(readFileSync(resolve(file), 'utf8')) as Verdict[]
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, title, funder, apply_url')
    .in('id', verdicts.map(v => v.id))
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const current = new Map((data ?? []).map(r => [r.id as string, r as { id: string; title: string; funder: string | null; apply_url: string | null }]))

  const toWrite: Array<{ v: Verdict; from: string | null }> = []
  const leave: Verdict[] = []
  const dupes: Verdict[] = []
  const closed: Verdict[] = []
  const problems: string[] = []

  for (const v of verdicts) {
    const row = current.get(v.id)
    if (!row) { problems.push(`${v.id} (${v.title}) — not found in the catalogue`); continue }

    if (v.verdict.startsWith('DUPLICATE_OF')) { dupes.push(v); continue }
    if (v.verdict === 'CLOSED')               { closed.push(v); continue }
    if (v.verdict === 'NO_OWN_PAGE')          { leave.push(v); continue }
    if (v.verdict !== 'OWN_PAGE')             { problems.push(`${v.title} — unknown verdict "${v.verdict}"`); continue }

    if (!v.url) { problems.push(`${v.title} — OWN_PAGE with no url`); continue }
    // A verdict that hands back the URL we are trying to move off is a research
    // failure, not a fix. Catch it here rather than writing a no-op.
    if (v.url.replace(/\/$/, '') === (row.apply_url ?? '').replace(/\/$/, '')) {
      problems.push(`${v.title} — OWN_PAGE url is identical to the current one`); continue
    }
    if (!/^https:\/\//.test(v.url)) { problems.push(`${v.title} — url is not https: ${v.url}`); continue }

    toWrite.push({ v, from: row.apply_url })
  }

  console.log(`\nverdicts in: ${verdicts.length}`)
  console.log(`  to rewrite            ${toWrite.length}`)
  console.log(`  left alone (no page)  ${leave.length}`)
  console.log(`  flagged as duplicate  ${dupes.length}`)
  console.log(`  flagged as closed     ${closed.length}`)
  console.log(`  problems              ${problems.length}\n`)

  if (toWrite.length) {
    console.log('REWRITE:')
    for (const { v, from } of toWrite) {
      console.log(`  ${v.title}`)
      console.log(`      from ${from}`)
      console.log(`      to   ${v.url}`)
      if (v.evidence) console.log(`      why  ${v.evidence.slice(0, 120)}`)
    }
  }
  if (leave.length) {
    console.log('\nLEFT ALONE — no dedicated page exists (the shared-link warning is the fix):')
    for (const v of leave) console.log(`  ${v.title.padEnd(52)} ${(v.evidence ?? '').slice(0, 80)}`)
  }
  if (dupes.length) {
    console.log('\nFLAGGED AS DUPLICATE — needs a separate decision, nothing written:')
    for (const v of dupes) console.log(`  ${v.title.padEnd(52)} ${v.verdict}  ${(v.evidence ?? '').slice(0, 70)}`)
  }
  if (closed.length) {
    console.log('\nFLAGGED AS CLOSED — needs a separate decision, nothing written:')
    for (const v of closed) console.log(`  ${v.title.padEnd(52)} ${(v.evidence ?? '').slice(0, 80)}`)
  }
  if (problems.length) {
    console.log('\nPROBLEMS — skipped:')
    for (const p of problems) console.log(`  ${p}`)
  }

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.\n')
    return
  }

  let applied = 0, rejected = 0, failed = 0
  for (const { v } of toWrite) {
    try {
      const res = await mergeGrantUpdate({
        id: v.id,
        // url_status reset so the checker verifies the new address on its own
        // merits rather than inheriting an 'ok' earned by the old one.
        fields: { apply_url: v.url, url_status: 'unchecked', url_last_checked: null },
        source: SOURCE,
        pinned: false,
        db,
      })
      if (res.applied.includes('apply_url')) applied++
      else { rejected++; console.error(`  rejected: ${v.title} — ${JSON.stringify(res.rejected)}`) }
    } catch (err) {
      failed++
      console.error(`  failed: ${v.title}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`\napplied ${applied}, rejected ${rejected}, failed ${failed}\n`)
}

main()
