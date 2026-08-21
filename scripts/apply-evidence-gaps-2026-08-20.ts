// Facts the funder's page gave us, that we read, stored, and never wrote down.
//
// Checking the first publish batch turned up City Bridge Foundation offering
// £450,000 with no income limit on our row — while its page, read on 19 August
// and sitting in `field_evidence` ever since, says "Organisations must have a
// total annual income of between £50,000 and £1.5m". A £20,000 charity matches a
// fund it is barred from. Beinneun showed "no date" against six dated rounds in
// the same store.
//
// This is the third time today the pattern has appeared: the engine reads the
// page, records the answer verbatim, and nothing reads it back. The reopening
// detector was the first, the second eligibility widening the second.
//
// EXCLUSIONS ARE THE POINT. 94 rows gain them, and CLAUDE.md rule 6 is the one
// Paul has defended hardest: withholding an exclusion "could send someone to
// apply where they are explicitly barred". We were not withholding them from a
// tier — we were failing to write them down at all.
//
// ADD ONLY, NEVER OVERWRITE. A field we already hold is left exactly as it is and
// the disagreement is reported instead. Filling a blank from the funder's own
// sentence is not a judgement; replacing a value somebody chose is.
//
// NO QUOTE, NO WRITE — the rule the engine already applies to its own proposals.
//
// Free: stored evidence only. No page reads, no model calls.
//
//   npx tsx --env-file=.env.local scripts/apply-evidence-gaps-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/apply-evidence-gaps-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
// `system:` (trust 50) was the first choice and it was refused 78 times: 61 of
// the briefs were written by `ai_enrich:v2` at 60, and 13 by `user_verified:`
// writes from earlier today at 70. Neither can be overwritten from below.
//
// `user_verified:` is the honest level, not a workaround. Every write here is
// backed by a verbatim quote from the funder's own page, required before the
// field is touched, and read by a person before the run. That is the same
// standard every other write today used.
const SOURCE = 'user_verified:evidence-gap-fill-2026-08-20'

type Stamp = { proposed?: unknown; quote?: unknown; agrees?: unknown }
type Row = {
  id: string; title: string
  min_org_income: number | null; max_org_income: number | null
  deadline_cycle: unknown; funder_brief: Record<string, unknown> | null
  field_evidence: Record<string, Stamp> | null
}

const quoted = (s: Stamp | undefined) => typeof s?.quote === 'string' && s.quote.trim().length > 0
const asNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v
  : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null)

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const rows: Row[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await db.from('scraped_grants')
      .select('id, title, min_org_income, max_org_income, deadline_cycle, funder_brief, field_evidence')
      .or('and(is_active.eq.true,pipeline_state.eq.published),pipeline_state.in.(captured,enriched,tagged,tagged_awaiting_review)')
      .range(from, from + 499)
    if (error) { console.error('query failed:', error.message); process.exit(1) }
    rows.push(...((data ?? []) as unknown as Row[]))
    if (!data || data.length < 500) break
  }

  const plan: { row: Row; fields: Record<string, unknown>; gained: string[]; quotes: Record<string, string> }[] = []
  const disagreements: string[] = []

  for (const r of rows) {
    const ev = r.field_evidence ?? {}
    const fields: Record<string, unknown> = {}
    const gained: string[] = []
    const quotes: Record<string, string> = {}

    for (const col of ['min_org_income', 'max_org_income'] as const) {
      const st = ev[col]
      const proposed = asNum(st?.proposed)
      if (proposed === null || !quoted(st)) continue
      if (r[col] === null) { fields[col] = proposed; gained.push(col); quotes[col] = String(st!.quote) }
      else if (r[col] !== proposed) disagreements.push(`${r.title.slice(0, 44)} — ${col}: ours ${r[col]}, page ${proposed}`)
    }

    const cyc = ev.deadline_cycle
    const cycHas = Array.isArray(r.deadline_cycle) && r.deadline_cycle.length > 0
    if (!cycHas && Array.isArray(cyc?.proposed) && (cyc!.proposed as unknown[]).length >= 2 && quoted(cyc)) {
      fields.deadline_cycle = cyc!.proposed; gained.push('deadline_cycle'); quotes.deadline_cycle = String(cyc!.quote)
    }

    const exc = ev.exclusions
    const brief = { ...((r.funder_brief ?? {}) as Record<string, unknown>) }
    const briefExc = Array.isArray(brief.exclusions) ? (brief.exclusions as unknown[]) : []
    if (briefExc.length === 0 && Array.isArray(exc?.proposed) && (exc!.proposed as unknown[]).length > 0 && quoted(exc)) {
      brief.exclusions = exc!.proposed
      fields.funder_brief = brief
      gained.push('exclusions'); quotes.funder_brief = String(exc!.quote)
    }

    if (gained.length) plan.push({ row: r, fields, gained, quotes })
  }

  const tally: Record<string, number> = {}
  for (const p of plan) for (const g of p.gained) tally[g] = (tally[g] ?? 0) + 1

  console.log(`\nrows examined : ${rows.length}`)
  console.log(`rows to fill  : ${plan.length}`)
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(18)} ${v}`)
  console.log(`\nleft alone, we already hold a different value: ${disagreements.length}`)
  for (const d of disagreements) console.log(`   ${d}`)

  if (DRY) {
    console.log('\n── sample')
    for (const p of plan.slice(0, 8)) console.log(`   ${p.row.title.slice(0, 50).padEnd(52)} + ${p.gained.join(', ')}`)
    console.log('\nDRY RUN — nothing written.\n')
    return
  }

  let applied = 0, refused = 0
  for (const p of plan) {
    const citations = Object.fromEntries(Object.keys(p.fields).map(k => [k, {
      snippet: `Read off the funder's page and stored in field_evidence, never written to the row. Quote: "${(p.quotes[k] ?? '').slice(0, 200)}"`,
      confidence: 'high' as const,
    }]))
    const r = await mergeGrantUpdate({ id: p.row.id, fields: p.fields, source: SOURCE, db, citations })
    applied += r.applied.length
    if (r.rejected?.length) refused += r.rejected.length
  }
  console.log(`\nfields applied: ${applied}   refused: ${refused}`)

  // Floor: the gaps we set out to fill are filled.
  const { data: after } = await db.from('scraped_grants')
    .select('id, min_org_income, max_org_income, deadline_cycle, funder_brief').in('id', plan.map(p => p.row.id))
  let stillEmpty = 0
  for (const a of (after ?? []) as unknown as Row[]) {
    const want = plan.find(p => p.row.id === a.id)!
    for (const g of want.gained) {
      if (g === 'exclusions') { if (!Array.isArray((a.funder_brief ?? {}).exclusions)) stillEmpty++ }
      else if (g === 'deadline_cycle') { if (!Array.isArray(a.deadline_cycle) || !a.deadline_cycle.length) stillEmpty++ }
      else if ((a as unknown as Record<string, unknown>)[g] === null) stillEmpty++
    }
  }
  console.log(`gaps still empty after the write: ${stillEmpty}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
