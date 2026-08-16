/**
 * How much of "the funder doesn't say" is really "we only looked at one page"?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS RUNS BEFORE THE CHANGE, NOT AFTER
 *
 * The verification engine hops to a second page under exactly one condition:
 * the timing question came back unanswered. Nothing hops for a missing
 * structure gate, a missing income threshold or a missing exclusion. So the
 * catalogue's 1,415 recorded silences are a mixture of two very different
 * things, and the surface renders them identically:
 *
 *   - the funder genuinely does not say, anywhere
 *   - the funder says it one click away, and we never looked
 *
 * The first is a fact about the funder. The second is a fact about us. Which
 * one dominates decides whether the silences are a ceiling or an artefact, and
 * that decides whether a one-page eligibility re-read of 668 rows is worth
 * £3.87 or is £3.87 spent producing false silences and then parking them behind
 * a 180-day cooldown.
 *
 * REPORT ONLY. Writes nothing. `verifyRow` has no database access of its own —
 * the cron route does the writing, and this is not it.
 *
 * Run:  npx tsx scripts/measure-hop.ts [--limit N] [--stratum A|B|C]
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRow, type VerifyRow, type VerifyResult } from '../src/lib/verification/verify-row'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const argOf = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const LIMIT = Number(argOf('--limit') ?? 45)
const ONLY  = argOf('--stratum')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

/**
 * Three populations, because they fail for different reasons and a single
 * average across them would hide the one that matters.
 *
 *  A — timing answered, so the hop is STRUCTURALLY INCAPABLE of firing today.
 *      229 rows, 627 silences. This is the population the widening is for.
 *  B — timing unanswered and no fact came from a second URL: the hop had every
 *      reason to fire and produced nothing. Either there was nothing to follow
 *      or the page it followed failed the gate. Tests whether a wider TARGET
 *      helps where a wider TRIGGER cannot.
 *  C — the hop fired and settled something, and silences remain anyway. Tests
 *      the ceiling: if these do not improve, three pages is not enough.
 */
const STRATA = ['A', 'B', 'C'] as const
type Stratum = typeof STRATA[number]

const SELECT_COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, next_open_date, is_rolling, max_org_income, min_org_income, is_invite_only, eligible_structures, location_tag, funder_brief, field_evidence'

type Row = VerifyRow & { field_evidence: Record<string, { agrees: boolean | null; source_url?: string | null }> }

function classify(row: Row): Stratum | null {
  const ev = row.field_evidence ?? {}
  const read = ev['_page_read'] as { source_url?: string | null } | undefined
  if (!read) return null
  const first = read.source_url ?? null
  const fields = Object.entries(ev).filter(([k]) => !k.startsWith('_'))
  if (fields.length === 0) return null
  const silent = fields.filter(([, v]) => v?.agrees === null || v?.agrees === undefined)
  if (silent.length === 0) return null
  const timing = fields.some(([k, v]) => (k === 'deadline' || k === 'is_rolling') && v?.agrees !== null && v?.agrees !== undefined)
  const hopped = fields.some(([, v]) => v?.source_url && v.source_url !== first)
  if (timing && !hopped) return 'A'
  if (!timing && !hopped) return 'B'
  if (!timing && hopped)  return 'C'
  return null   // timing answered AND hopped: 12 rows, too few to sample
}

/** What the stored evidence was silent on, before this run. */
function silentFields(row: Row): string[] {
  return Object.entries(row.field_evidence ?? {})
    .filter(([k, v]) => !k.startsWith('_') && (v?.agrees === null || v?.agrees === undefined))
    .map(([k]) => k)
}

/**
 * Fields the stored evidence has a DEFINITE answer for.
 *
 * The complement of this, not `silentFields`, is what a gain is measured
 * against. The first draft used the silent list and undercounted: the stored
 * evidence was written by verify:v1, which had no eligible_structures,
 * exclusions or min_org_income fields at all, so those are ABSENT rather than
 * silent and would never have appeared in a before-list. Every eligibility
 * answer the widening produces — the whole point of the exercise — was being
 * scored as no change.
 */
function answeredFields(row: Row): Set<string> {
  return new Set(Object.entries(row.field_evidence ?? {})
    .filter(([k, v]) => !k.startsWith('_') && v?.agrees !== null && v?.agrees !== undefined)
    .map(([k]) => k))
}

type Verdict =
  | 'resolved_by_hop'     // a second page answered something the first did not
  | 'resolved_on_page_1'  // the widened EXTRACTION answered it; no hop needed
  | 'split_needed'        // the hop landed on a page serving several funds
  | 'nothing_to_follow'   // no candidate link scored at all
  | 'followed_still_silent'
  | 'still_silent'        // no hop earned, nothing gained: genuinely unanswered
  | 'unreadable'
  | 'threw'

function verdictFor(answeredBefore: Set<string>, r: VerifyResult): { verdict: Verdict; gained: string[] } {
  if (r.splitCandidate) return { verdict: 'split_needed', gained: [] }
  if (!r.gate.pass) return { verdict: 'unreadable', gained: [] }

  const first  = (r.pagesRead ?? [])[0]
  const gained = r.evidence.filter(e => e.agrees !== null && !answeredBefore.has(e.field))
  // Separating these two is the whole measurement. A gain from the FIRST page
  // is the eligibility extraction earning its keep and says nothing about the
  // hop; a gain from a page we followed is the hop earning its keep. Only the
  // second justifies changing the trigger.
  const fromHop = gained.filter(e => e.source_url && e.source_url !== first)
  if (fromHop.length > 0) return { verdict: 'resolved_by_hop', gained: fromHop.map(e => e.field) }
  if (gained.length > 0)  return { verdict: 'resolved_on_page_1', gained: gained.map(e => e.field) }

  if ((r.pagesRead ?? []).length > 1) return { verdict: 'followed_still_silent', gained: [] }
  if (r.notes.some(n => n.startsWith('nothing to follow'))) return { verdict: 'nothing_to_follow', gained: [] }
  return { verdict: 'still_silent', gained: [] }
}

async function main() {
  const pool: Record<Stratum, Row[]> = { A: [], B: [], C: [] }
  const PAGE = 500
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('scraped_grants').select(SELECT_COLS)
      .eq('is_active', true).not('field_evidence', 'is', null).not('apply_url', 'is', null)
      .order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Row[]
    for (const r of rows) { const s = classify(r); if (s) pool[s].push(r) }
    if (rows.length < PAGE) break
  }

  console.log('population (live rows only):')
  for (const s of STRATA) console.log(`  ${s}: ${pool[s].length} rows, ${pool[s].reduce((n, r) => n + silentFields(r).length, 0)} silences`)

  // Deterministic spread rather than a random sample: sorting by id and taking
  // every Nth avoids re-drawing a different set on a re-run, which matters
  // because each draw costs money.
  const want: Record<Stratum, number> = { A: Math.round(LIMIT * 0.5), B: Math.round(LIMIT * 0.3), C: LIMIT - Math.round(LIMIT * 0.5) - Math.round(LIMIT * 0.3) }
  const sample: { row: Row; stratum: Stratum }[] = []
  for (const s of STRATA) {
    if (ONLY && ONLY !== s) continue
    const src = pool[s]
    const n = Math.min(want[s], src.length)
    const step = Math.max(1, Math.floor(src.length / n))
    for (let i = 0; i < n; i++) sample.push({ row: src[i * step], stratum: s })
  }
  console.log(`\nsampling ${sample.length} rows\n`)

  const results: Record<string, unknown>[] = []
  let inTok = 0, outTok = 0
  for (let i = 0; i < sample.length; i++) {
    const { row, stratum } = sample[i]
    const before = silentFields(row)
    const answeredBefore = answeredFields(row)
    let r: VerifyResult
    try {
      r = await verifyRow(row, anthropic, { hopOn: 'any' })
    } catch (e) {
      // Recorded, not skipped. Dropping the rows that time out would bias the
      // denominator towards the sites that answer quickly.
      results.push({ id: row.id, stratum, title: row.title, url: row.apply_url, before, verdict: 'threw', gained: [], notes: [(e as Error).message] })
      console.log(`${i + 1}/${sample.length} [${stratum}] threw — ${row.title}: ${(e as Error).message}`)
      continue
    }
    inTok += r.usage?.input ?? 0
    outTok += r.usage?.output ?? 0
    const { verdict, gained } = verdictFor(answeredBefore, r)
    results.push({
      id: row.id, stratum, title: row.title, funder: row.funder, url: row.apply_url,
      before, verdict, gained, pagesRead: r.pagesRead, outcome: r.outcome,
      splitCandidate: r.splitCandidate, notes: r.notes,
      quotes: r.evidence.filter(e => e.agrees !== null && !answeredBefore.has(e.field))
        .map(e => ({ field: e.field, agrees: e.agrees, url: e.source_url, quote: e.quote })),
    })
    const where = (r.pagesRead ?? []).length > 1 ? ` via ${r.pagesRead!.slice(1).join(', ')}` : ''
    console.log(`${i + 1}/${sample.length} [${stratum}] ${verdict}${gained.length ? ` (${gained.join(', ')})` : ''} — ${row.title}${where}`)
  }

  const cost = (inTok / 1e6) * 1 + (outTok / 1e6) * 5
  console.log('\n── by stratum ─────────────────────────────────────────')
  for (const s of STRATA) {
    const rs = results.filter(r => r.stratum === s)
    if (rs.length === 0) continue
    const tally: Record<string, number> = {}
    for (const r of rs) tally[r.verdict as string] = (tally[r.verdict as string] ?? 0) + 1
    console.log(`  ${s} (n=${rs.length}): ${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}`)
  }
  const fieldTally: Record<string, number> = {}
  for (const r of results) for (const f of r.gained as string[]) fieldTally[f] = (fieldTally[f] ?? 0) + 1
  console.log('\n  fields resolved:', Object.entries(fieldTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none')
  console.log(`\n  ${inTok} in / ${outTok} out tokens = £${(cost * 0.79).toFixed(2)} at Haiku 4.5`)
  console.log(`  per row: £${((cost * 0.79) / Math.max(1, results.length)).toFixed(4)}`)

  const out = resolve(HERE, '..', 'reports', `hop-measurement-${new Date().toISOString().slice(0, 10)}.json`)
  writeFileSync(out, JSON.stringify({ population: Object.fromEntries(STRATA.map(s => [s, pool[s].length])), results }, null, 2))
  console.log(`\nwrote ${out}`)
}

main().catch(e => { console.error(e); process.exit(1) })
