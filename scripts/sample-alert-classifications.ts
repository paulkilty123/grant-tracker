/**
 * Draw a hand-checkable sample of the alert classifier's output.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS SCRIPT IS THE CONDITION, NOT A CONVENIENCE
 *
 * Set by Paul, 2026-08-16, on approving the classifier: "sample the diff
 * classifier's first week before it gates anything."
 *
 * The estimate the classifier was built on — roughly 14 of 17 changes cosmetic —
 * is a hand reading of a single run, n=17. It is an order of magnitude, not a
 * measured rate, and nothing downstream reads `classification` until that rate
 * has actually been measured. This is what measures it.
 *
 * The sample is stratified rather than random. A uniform sample of a feed that
 * is 80% cosmetic spends 80% of the reading on the easy class and produces a
 * precision figure for `funding_change` from three examples. The expensive
 * mistake is a funding change filed as cosmetic, so `cosmetic` is sampled hard
 * enough to catch it and every non-cosmetic label is shown in full.
 *
 * Run:  npx tsx scripts/sample-alert-classifications.ts [--per 12] [--days 7]
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(v) && v > 0 ? v : fallback
}
const PER  = arg('per', 12)
const DAYS = arg('days', 7)

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Row = {
  id: string
  detected_at: string
  alert_type: string
  classification: string
  classification_quote: string | null
  classified_by: string | null
  funder_watchlist: { name: string } | { name: string }[] | null
}

const nameOf = (r: Row) =>
  (Array.isArray(r.funder_watchlist) ? r.funder_watchlist[0]?.name : r.funder_watchlist?.name) ?? '?'

async function main() {
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString()

  const { data, error } = await db
    .from('watchlist_alerts')
    .select('id, detected_at, alert_type, classification, classification_quote, classified_by, funder_watchlist(name)')
    .not('classification', 'is', null)
    .gte('classified_at', since)
    .order('detected_at', { ascending: false })
  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as Row[]
  if (rows.length === 0) {
    console.log(`no alerts classified in the last ${DAYS} days — nothing to sample yet`)
    return
  }

  const byClass = new Map<string, Row[]>()
  for (const r of rows) {
    const list = byClass.get(r.classification) ?? []
    list.push(r)
    byClass.set(r.classification, list)
  }

  const groups = Array.from(byClass.entries())

  console.log(`\n${rows.length} alerts classified in the last ${DAYS} days\n`)
  for (const [cls, list] of groups.slice().sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${cls.padEnd(16)} ${String(list.length).padStart(4)}  ${(100 * list.length / rows.length).toFixed(0)}%`)
  }

  const models = Array.from(new Set(rows.map(r => r.classified_by ?? 'unknown')))
  console.log('\nModels in this window:', models.join(', '))

  console.log(`
─────────────────────────────────────────────────────────────────────────────
For each line below, decide whether the label is right. The question that
matters is NOT "is cosmetic a fair description" — it is "would treating this as
cosmetic have lost something". One funding change filed as cosmetic is worth
more than twenty cosmetics filed correctly.
─────────────────────────────────────────────────────────────────────────────`)

  for (const [cls, list] of groups) {
    // Every non-cosmetic label in full: they are the rare ones and the ones a
    // downstream action would fire on. `cosmetic` is capped, because the point
    // of reading it is to find the mislabelled minority, not to confirm the
    // majority.
    const take = cls === 'cosmetic' ? list.slice(0, PER) : list
    console.log(`\n── ${cls} (showing ${take.length} of ${list.length}) ─────────────────────`)
    for (const r of take) {
      console.log(`\n  ${nameOf(r)}  ·  ${r.detected_at.slice(0, 10)}  ·  ${r.alert_type}`)
      console.log(`    "${r.classification_quote ?? '(no quote)'}"`)
      console.log(`    alert id: ${r.id}`)
    }
  }

  console.log(`
─────────────────────────────────────────────────────────────────────────────
Nothing reads the classification column yet. It gates nothing until this
sample has been checked and the miss rate on cosmetic is known.
─────────────────────────────────────────────────────────────────────────────
`)
}

main().catch(e => { console.error(e); process.exit(1) })
