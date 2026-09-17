// Shared shapes and runner for the amounts job of 2026-09-06.
// See docs/handoffs/amounts-2026-09-06.md. One batch script per 20 rows.
//
// Deliberately a separate file from timing-lib-2026-09-06.ts rather than a
// generalisation of it. The two jobs share a shape but not their rules: this one
// writes two columns plus a prose field in two ordered calls, and its report
// reasons are about money rather than dates. Merging them would mean a runner
// with a mode flag, which is how a fix for one job silently changes the other.
//
// What carried over unchanged, because each was paid for once already:
//   - the results file is a dict with batches, pins_outlived and a summary
//   - a refusal caused by an ADMIN source is reported and skipped, matched on
//     who blocked the write rather than on the reason string (an admin value
//     without pinned:true refuses as "lower_trust", not "pinned")
//   - any other refusal throws, because that would be a bug rather than a
//     decision
//   - a derived write only happens when the write it derives from was applied

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

export const SOURCE = 'user_verified:amounts-2026-09-06'
export const RESULTS = join(__dirname, '..', 'docs', 'handoffs', 'amount-results-2026-09-06.json')

export type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

export type Row = {
  id: string
  re: RegExp
  /** amount_min and/or amount_max. Empty when the figure is prose only. */
  fields: { amount_min?: number | null; amount_max?: number | null }
  cits: Cit
  /** Goes into funder_brief.typical_award, in a second call after the columns. */
  typical_award?: string
  typical_award_cit?: { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }
  sources?: { url: string; label: string }[]
}

export type Report = {
  id: string
  title: string
  why: 'not_stated' | 'pot_only' | 'per_unit' | 'listing_only' | 'unreadable'
     | 'wrong_link' | 'index_over_programmes' | 'pinned' | 'invite_only'
  quote: string
  url: string
  note?: string
}

export type PinOutlived = {
  id: string; title: string; field: string; reason: string
  held_by: string; held_since?: string
  row_holds: unknown; page_says: string; url: string
}

type ResultsFile = {
  batches: { batch: number; written: unknown[]; report: Report[] }[]
  pins_outlived: PinOutlived[]
  summary?: unknown
}

function readResults(): ResultsFile {
  if (!existsSync(RESULTS)) return { batches: [], pins_outlived: [] }
  const raw = JSON.parse(readFileSync(RESULTS, 'utf8'))
  if (Array.isArray(raw)) return { batches: raw, pins_outlived: [] }
  return { batches: raw.batches ?? [], pins_outlived: raw.pins_outlived ?? [] }
}

export function recordSummary(summary: unknown) {
  const file = readResults()
  file.summary = summary
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  console.log(`  summary -> ${RESULTS}`)
}

export function appendBatch(batch: number, written: unknown[], report: Report[], pins: PinOutlived[] = []) {
  const file = readResults()
  file.batches = file.batches.filter(b => b.batch !== batch)
  file.batches.push({ batch, written, report })
  file.batches.sort((a, b) => a.batch - b.batch)
  const ids = new Set(pins.map(p => `${p.id}:${p.field}`))
  file.pins_outlived = file.pins_outlived.filter(p => !ids.has(`${p.id}:${p.field}`)).concat(pins)
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  console.log(`  results -> ${RESULTS} (batch ${batch}: ${written.length} written, ${report.length} reported, ${pins.length} pins outlived)`)
}

const money = (n: number | null | undefined) => (n == null ? 'null' : `£${n.toLocaleString('en-GB')}`)

export async function runBatch(opts: {
  batch: number
  rows: Row[]
  report: Report[]
  apply: boolean
  db: SupabaseClient
}) {
  const { batch, rows, report, apply, db } = opts
  console.log(`batch ${batch} — ${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} writes, ${report.length} reported`)

  const written: unknown[] = []
  const extraReport: Report[] = []
  const pins: PinOutlived[] = []

  for (const r of rows) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, amount_min, amount_max, funder_brief, grant_sources').eq('id', r.id).single()
    if (!data) throw new Error(`${r.id}: no row`)
    if (!r.re.test(data.title)) throw new Error(`${r.id}: title "${data.title}" does not match ${r.re}`)

    const hasColumns = Object.keys(r.fields).length > 0
    if (!hasColumns && !r.typical_award) throw new Error(`${r.id}: nothing to write`)

    const fields: Record<string, unknown> = { ...r.fields }
    if (r.sources?.length) {
      const existing = (data.grant_sources as { url?: string }[] | null) ?? []
      const have = new Set(existing.map(s => s.url))
      const add = r.sources.filter(s => !have.has(s.url)).map(s => ({ url: s.url, text: '', label: s.label }))
      if (add.length) fields.grant_sources = [...existing, ...add]
    }

    console.log(`  ${data.title.slice(0, 42).padEnd(42)} min ${money(r.fields.amount_min).padEnd(12)} max ${money(r.fields.amount_max)}`)
    for (const [k, c] of Object.entries(r.cits)) console.log(`      ${k}: "${c.snippet}"`)
    if (r.typical_award) console.log(`      typical_award: "${r.typical_award}"`)
    if (!apply) { written.push({ id: r.id, ...r.fields, prose_only: !hasColumns }); continue }

    // ── Call one: the columns ────────────────────────────────────────────────
    let columnsApplied = !hasColumns   // prose-only rows have nothing to gate on
    if (hasColumns || fields.grant_sources) {
      const res = await mergeGrantUpdate({ id: r.id, fields, source: SOURCE, db, citations: r.cits })
      const refused = res.rejected.filter(x => x.reason !== 'idempotent')
      console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)

      if (refused.length) {
        const blocker = (x: { blockedBy?: unknown }) => ((x.blockedBy as { source?: string } | undefined)?.source ?? '')
        const notAdmin = refused.filter(x => !blocker(x).startsWith('admin:'))
        if (notAdmin.length) throw new Error(`${data.title}: refused by something other than an admin decision — ${JSON.stringify(notAdmin)}`)
        const first = Object.values(r.cits)[0]
        extraReport.push({
          id: r.id, title: data.title, why: 'pinned',
          quote: first?.snippet ?? '', url: first?.source_url ?? '',
          note: `mergeGrantUpdate refused ${refused.map(x => `${x.field} (${x.reason}, held by ${blocker(x)})`).join('; ')}. Left as the admin decision set it.`,
        })
        const row = data as Record<string, unknown>
        for (const x of refused) {
          const held = x.blockedBy as { source?: string; set_at?: string } | undefined
          const c = r.cits[x.field] ?? first
          pins.push({
            id: r.id, title: data.title, field: x.field, reason: x.reason,
            held_by: held?.source ?? 'unknown', held_since: held?.set_at,
            row_holds: row[x.field] ?? null,
            page_says: c?.snippet ?? '', url: c?.source_url ?? '',
          })
        }
        continue   // no typical_award either: it would describe a figure the row does not hold
      }
      columnsApplied = hasColumns ? res.applied.some(f => f === 'amount_min' || f === 'amount_max') : true
    }

    // ── Call two: typical_award, only once the columns are actually in ───────
    if (r.typical_award) {
      if (!columnsApplied) {
        console.log(`      typical_award NOT written — the column write it describes was not applied`)
      } else {
        const brief = { ...((data.funder_brief as Record<string, unknown> | null) ?? {}) }
        brief.typical_award = r.typical_award
        const res2 = await mergeGrantUpdate({
          id: r.id, fields: { funder_brief: brief }, source: SOURCE, db,
          citations: r.typical_award_cit ? { funder_brief: r.typical_award_cit } : undefined,
        })
        const refused2 = res2.rejected.filter(x => x.reason !== 'idempotent')
        console.log(`      typical_award [${res2.applied.join(', ') || 'nothing'}]${refused2.length ? `  REFUSED ${JSON.stringify(refused2)}` : ''}`)
      }
    }

    written.push({ id: r.id, ...r.fields, prose_only: !hasColumns })
  }

  for (const p of pins) console.log(`  pin     ${p.title.slice(0, 34).padEnd(34)} ${p.field} held by ${p.held_by}`)
  for (const r of [...report, ...extraReport]) console.log(`  report  ${r.title.slice(0, 40).padEnd(40)} ${r.why}`)
  if (apply) appendBatch(batch, written, [...report, ...extraReport], pins)
}
