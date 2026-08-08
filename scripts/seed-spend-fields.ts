// Seed spend_types / spend_restriction from the 3 August detection run.
//
//   npx tsx scripts/seed-spend-fields.ts            # dry run
//   npx tsx scripts/seed-spend-fields.ts --apply    # write
//
// A SEED, not a one-off. enrich-grant now carries the same two-axis contract,
// so the 90-day re-enrichment cycle maintains these values from here. This just
// gives the pipeline a starting corpus instead of 621 empty columns.
//
// WRITES AT `ai_enrich:spend_seed:v1` — trust 60, the same tier as
// `ai_enrich:v2`. Deliberate: equal trust wins, so a later enrichment pass can
// improve on the seed without a human. Naming it honestly (rather than claiming
// to BE ai_enrich:v2) keeps the provenance true while preserving that path.
//
// LOW CONFIDENCE COLLAPSES TO NULL HERE, and only here. In the recurring prompt
// low confidence means ABSTAIN — omit the field, preserve whatever is there.
// That distinction matters because there is nothing prior to preserve on this
// first pass, so nulling is honest; on every pass afterwards it would destroy a
// good answer to record uncertainty.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

const APPLY = process.argv.includes('--apply')

type Row = {
  id: string; title: string; funder: string
  spend_types?: string[]; spend_restriction?: string
  confidence?: string; quote?: string; error?: string
}

async function main() {
  const all: Row[] = JSON.parse(readFileSync('spend-restriction-proposal.json', 'utf8'))
  const ok = all.filter(r => !r.error)
  console.log(`${all.length} proposals, ${all.length - ok.length} errored\n`)

  const plan = ok.map(r => {
    const low = r.confidence === 'low'
    // Sorted so the stored array compares as a stable string; one proposal came
    // back "revenue+capital" and would otherwise never equal "capital+revenue".
    const types = low ? null
      : Array.from(new Set((r.spend_types ?? []).filter(t => t === 'capital' || t === 'revenue'))).sort()
    const restr = low ? null
      : (r.spend_restriction === 'restricted' || r.spend_restriction === 'unrestricted')
        ? r.spend_restriction : null
    return { id: r.id, title: r.title, low, types, restr }
  })

  const tally = new Map<string, number>()
  for (const p of plan) {
    const k = p.low ? 'LOW → null (collapsed)'
      : `${p.types?.length ? p.types.join('+') : '—'} / ${p.restr ?? 'null'}`
    tally.set(k, (tally.get(k) ?? 0) + 1)
  }
  console.log('── final distribution after the low→null collapse ──')
  for (const [k, n] of Array.from(tally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${Math.round(n / plan.length * 100).toString().padStart(3)}%  ${k}`)
  }

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); return }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  let ok2 = 0, skipped = 0, failed = 0
  for (const p of plan) {
    try {
      const res = await mergeGrantUpdate({
        id: p.id,
        fields: { spend_types: p.types, spend_restriction: p.restr },
        source: 'ai_enrich:spend_seed:v1',
        db,
      })
      if (res.applied.length) ok2++
      else { skipped++; if (skipped <= 5) console.log(`  skipped ${p.title.slice(0, 40)} — ${res.rejected[0]?.reason ?? '?'}`) }
    } catch (e) {
      failed++
      console.log(`  FAILED ${p.title.slice(0, 40)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log(`\nwritten ${ok2}, skipped ${skipped}, failed ${failed}`)
}

main().catch(e => { console.error(e); process.exit(1) })
