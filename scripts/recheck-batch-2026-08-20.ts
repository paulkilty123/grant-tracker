// Re-check the publish batch after the evidence gaps were filled.
//
// COUNTING `agrees: false` WOULD LIE HERE. Those stamps are frozen at read time:
// they record what the page said against what the row held THEN. Applying the
// page's own value does not rewrite the stamp, so a resolved dispute still reads
// as a dispute until the engine next re-reads the page — which costs money and
// is not the question.
//
// So each disputed field is re-compared against what the row holds NOW. If the
// stored proposal and the current value agree, the dispute is settled whatever
// the stamp says.
//
// Free: stored data only.
//
//   npx tsx --env-file=.env.local scripts/recheck-batch-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'

const TITLES = [
  'Arts Council of Wales — Have a Go',
  'Arts Council of Wales — International Opportunities Fund',
  'Beinneun Community Fund',
  'CAF Bank Secured Loans',
  'Charity Bank — Green Loans',
  'Clothworkers Foundation — Small Capital Grants (up to £15,000)',
  'Community Enterprise Fund',
  'Impact Loans England',
  'KFC Youth Foundation - Community Grants Programme',
]

/** Same value, allowing for JSON ordering and number/string drift. */
function settled(proposed: unknown, current: unknown): boolean {
  if (proposed === null || proposed === undefined) return true
  if (Array.isArray(proposed) && Array.isArray(current)) {
    const a = [...proposed].map(String).sort(), b = [...current].map(String).sort()
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  if (Array.isArray(proposed) && proposed.length && typeof proposed[0] === 'object') return false
  return String(proposed) === String(current)
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  // `.in()`, not `.or()` with `title.eq.` — PostgREST's or-filter is a
  // comma-separated grammar, so a title containing a comma or a bracket breaks
  // the expression and the query returns NOTHING rather than erroring. The first
  // run of this script printed "0 of 0", which is the same shape of wrong answer
  // as the timezone filter earlier today: a zero is what a broken query returns.
  const { data, error } = await db.from('scraped_grants').select('*').in('title', TITLES)
  if (error) { console.error('query failed:', error.message); process.exit(1) }
  const { data: cb } = await db.from('scraped_grants').select('*').like('title', 'City Bridge Foundation — Climate%')
  const rows = ([...(data ?? []), ...(cb ?? [])]) as unknown as Record<string, unknown>[]
  if (rows.length === 0) { console.error('ABORT: matched no rows — check the titles before trusting a zero'); process.exit(1) }
  console.log(`matched ${rows.length} of ${TITLES.length + 1} expected`)

  let cleanRows = 0
  for (const r of rows) {
    const ev = (r.field_evidence ?? {}) as Record<string, { agrees?: unknown; proposed?: unknown; quote?: unknown }>
    const brief = (r.funder_brief ?? {}) as Record<string, unknown>
    const open: string[] = []
    const fixed: string[] = []

    for (const [field, st] of Object.entries(ev)) {
      if (st?.agrees !== false) continue
      const current = field === 'exclusions' ? brief.exclusions : (r as Record<string, unknown>)[field]
      if (settled(st.proposed, current)) fixed.push(field)
      else open.push(field)
    }

    const stale = typeof brief.last_enriched === 'string'
      && (Date.now() - Date.parse(String(brief.last_enriched))) / 86_400_000 > 180
    if (open.length === 0 && !stale) cleanRows++

    console.log(`\n${String(r.title).slice(0, 58)}`)
    console.log(`   settled since the read : ${fixed.join(', ') || 'none'}`)
    console.log(`   STILL DISPUTED         : ${open.join(', ') || 'none'}`)
    if (stale) console.log(`   brief last written     : ${brief.last_enriched}  ← over 6 months`)
  }
  console.log(`\n${cleanRows} of ${rows.length} now have nothing outstanding.\n`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
