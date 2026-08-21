// Three numbers from the health run that could be flattering, tested properly.
//
// 1. "100% of live rows read in the last 30 days" is a PROXY. `_page_read`
//    records the ATTEMPT — its own docstring says so, because a page that fails
//    the gate produces no field stamps and would otherwise never drain from the
//    work queue. The real question is whether the read produced facts.
// 2. 252 live rows say "rolling". `is_rolling` has historically been set as
//    `!deadline`, so a date the extractor could not parse becomes "apply any
//    time". How many of the 252 are backed by a page that SAYS so?
// 3. `page_describes_different_fund` fires on 51 live rows and is the largest
//    blocking item. Every pile in this session shrank when read. Sample it.
//
// All database reads.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { readStamp, PAGE_READ_KEY, type FieldEvidence } from '../src/lib/field-evidence'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const TODAY = '2026-08-21'

async function fetchAll(db: any) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 900) {
    const { data, error } = await db.from('scraped_grants').select('*').range(from, from + 899)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 900) break
  }
  return out
}
const pct = (n: number, d: number) => d === 0 ? '  -  ' : `${((n / d) * 100).toFixed(1)}%`.padStart(6)

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const live = (await fetchAll(db)).filter(r => r.is_active === true)

  // ── 1. did the read produce anything? ─────────────────────────────────────
  let anyFact = 0, quotedFact = 0, attemptOnly = 0
  const cutoff = new Date(TODAY); cutoff.setDate(cutoff.getDate() - 30)
  for (const r of live) {
    const ev = (r.field_evidence ?? {}) as FieldEvidence
    const fields = Object.entries(ev).filter(([k]) => !k.startsWith('_'))
    const fresh  = fields.filter(([, s]) => s?.checked_at && new Date(s.checked_at) >= cutoff)
    if (fresh.length === 0) { attemptOnly++; continue }
    anyFact++
    if (fresh.some(([, s]) => !!s.quote)) quotedFact++
  }
  console.log('── 1. THE READ THAT PRODUCED NOTHING')
  console.log(`   live rows                                    ${live.length}`)
  console.log(`   a fresh stamp on at least one real FIELD     ${String(anyFact).padStart(4)}  ${pct(anyFact, live.length)}`)
  console.log(`   ...and at least one of them carries a QUOTE  ${String(quotedFact).padStart(4)}  ${pct(quotedFact, live.length)}`)
  console.log(`   the page was visited and yielded no fact     ${String(attemptOnly).padStart(4)}  ${pct(attemptOnly, live.length)}`)

  // ── 2. is "rolling" a finding or a fallback? ──────────────────────────────
  const rolling = live.filter(r => r.is_rolling === true)
  let rollConfirmed = 0, rollContradicted = 0, rollSilent = 0
  const silentEx: string[] = []
  for (const r of rolling) {
    const s = readStamp(r.field_evidence as never, 'is_rolling')
    if (!s)                     { rollSilent++; if (silentEx.length < 5) silentEx.push(String(r.title).slice(0, 42)); continue }
    if (s.agrees === true)      rollConfirmed++
    else if (s.agrees === false) rollContradicted++
    else                        { rollSilent++; if (silentEx.length < 5) silentEx.push(String(r.title).slice(0, 42)) }
  }
  console.log('\n── 2. "APPLY ANY TIME" — FINDING OR FALLBACK?')
  console.log(`   live rows marked rolling                     ${rolling.length}`)
  console.log(`   the page was read and AGREES it is rolling   ${String(rollConfirmed).padStart(4)}  ${pct(rollConfirmed, rolling.length)}`)
  console.log(`   the page CONTRADICTS it                      ${String(rollContradicted).padStart(4)}  ${pct(rollContradicted, rolling.length)}`)
  console.log(`   no evidence either way                       ${String(rollSilent).padStart(4)}  ${pct(rollSilent, rolling.length)}`)
  if (silentEx.length) console.log(`      e.g. ${silentEx.join(' · ')}`)

  // ── 3. sample the biggest blocking item ───────────────────────────────────
  const wrongFund = live.filter(r => {
    const reasons = deriveReviewReasons(r as ReviewRow, TODAY)
    return gateDecision(r as ReviewRow, reasons).blocking.some(b => b.code === 'page_describes_different_fund')
  })
  console.log(`\n── 3. "PAGE DESCRIBES A DIFFERENT FUND" — ${wrongFund.length} live rows`)
  for (const r of wrongFund.slice(0, 12)) {
    const s = readStamp(r.field_evidence as never, PAGE_READ_KEY)
    console.log(`   ${String(r.title).slice(0, 44).padEnd(46)} ${String(r.apply_url).slice(0, 58)}`)
    console.log(`      note: ${s?.note ?? '(none)'}`)
  }
  const notes = new Map<string, number>()
  for (const r of wrongFund) {
    const s = readStamp(r.field_evidence as never, PAGE_READ_KEY)
    const n = String(s?.note ?? '(none)')
    notes.set(n, (notes.get(n) ?? 0) + 1)
  }
  console.log('\n   grouped by what the engine said:')
  for (const [n, c] of Array.from(notes).sort((a, b) => b[1] - a[1])) console.log(`      ${String(c).padStart(3)}  ${n}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
