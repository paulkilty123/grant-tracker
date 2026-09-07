// Shared shapes and runner for the spend-restriction job of 2026-09-07.
// See docs/handoffs/sonnet-2026-09-07.md, job 1. One batch script per 20 rows.
//
// A separate file from the timing/amounts/verdicts libs, for the reason those
// gave for staying separate from each other: this job writes a different set
// of columns (spend_restriction, spend_types, funding_subtypes) under its own
// report vocabulary, and a runner with a mode flag is how a fix for one job
// silently changes another.
//
// What carried over unchanged, because each was paid for once already:
//   - a refusal caused by an ADMIN source is reported and skipped, matched on
//     who blocked the write (the source PREFIX), not the reason string
//   - any other refusal throws, because that would be a bug rather than a
//     decision
//   - an unreadable page (empty body, JS shell) is its own report reason, not
//     folded into "the page states nothing" — CLAUDE.md: an empty body is a
//     re-read, not evidence
//   - the state guard: nothing else about the row moves during this job, so
//     STATE_COLS is re-read after the write and compared

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

export const SOURCE = 'user_verified:spend-2026-09-07'
export const RESULTS = join(__dirname, '..', 'docs', 'handoffs', 'spend-results-2026-09-07.json')

export type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

export type SpendRestriction = 'restricted' | 'unrestricted'
export type SpendType = 'capital' | 'revenue'

export type Row = {
  id: string
  re: RegExp
  restriction?: SpendRestriction
  spendTypes?: SpendType[]
  cits: Cit
  sources?: { url: string; label: string }[]
}

export type Report = {
  id: string
  title: string
  why: 'not_stated' | 'unreadable' | 'pinned'
  quote: string
  url: string
  note?: string
}

type ResultsFile = {
  batches: { batch: number; written: unknown[]; report: Report[] }[]
  summary?: unknown
}

function readResults(): ResultsFile {
  if (!existsSync(RESULTS)) return { batches: [] }
  const raw = JSON.parse(readFileSync(RESULTS, 'utf8'))
  return { batches: raw.batches ?? [], summary: raw.summary }
}

export function recordSummary(summary: unknown) {
  const file = readResults()
  file.summary = summary
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  console.log(`  summary -> ${RESULTS}`)
}

export function appendBatch(batch: number, written: unknown[], report: Report[]) {
  const file = readResults()
  file.batches = file.batches.filter(b => b.batch !== batch)
  file.batches.push({ batch, written, report })
  file.batches.sort((a, b) => a.batch - b.batch)
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  console.log(`  results -> ${RESULTS} (batch ${batch}: ${written.length} written, ${report.length} reported)`)
}

// funding_subtypes for a grant only take these five values (src/lib/funding-subtypes.ts).
// 'restricted'/'unrestricted' come from the restriction; 'capital' is added
// whenever the page names it, alongside whichever restriction was found (or
// alone, if the page names capital items but says nothing about restriction).
// 'revenue' is never a funding_subtype on its own — it has no matching value.
function subtypesFor(r: Row): string[] {
  const out: string[] = []
  if (r.restriction) out.push(r.restriction)
  if (r.spendTypes?.includes('capital')) out.push('capital')
  return out
}

const STATE_COLS = 'id, title, is_active, pipeline_state, rejection_reason'
type StateSnapshot = { is_active: unknown; pipeline_state: unknown; rejection_reason: unknown }
const snap = (r: Record<string, unknown>): StateSnapshot =>
  ({ is_active: r.is_active, pipeline_state: r.pipeline_state, rejection_reason: r.rejection_reason })

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

  for (const r of rows) {
    const before = await db.from('scraped_grants')
      .select(`${STATE_COLS}, spend_restriction, spend_types, funding_subtypes, grant_sources`).eq('id', r.id).single()
    if (before.error || !before.data) throw new Error(`${r.id}: ${before.error?.message ?? 'no row'}`)
    const data = before.data as unknown as Record<string, unknown>
    const title = String(data.title)
    if (!r.re.test(title)) throw new Error(`${r.id}: title "${title}" does not match ${r.re}`)
    if (!r.restriction && !r.spendTypes?.length) throw new Error(`${r.id}: nothing to write`)

    const subtypes = subtypesFor(r)
    const fields: Record<string, unknown> = {}
    if (r.restriction) fields.spend_restriction = r.restriction
    if (r.spendTypes?.length) fields.spend_types = r.spendTypes
    if (subtypes.length) fields.funding_subtypes = subtypes

    if (r.sources?.length) {
      const existing = (data.grant_sources as { url?: string }[] | null) ?? []
      const have = new Set(existing.map(s => s.url))
      const add = r.sources.filter(s => !have.has(s.url)).map(s => ({ url: s.url, text: '', label: s.label }))
      if (add.length) fields.grant_sources = [...existing, ...add]
    }

    console.log(`  ${title.slice(0, 46).padEnd(46)} ${JSON.stringify({ restriction: r.restriction, spendTypes: r.spendTypes, subtypes })}`)
    for (const [k, c] of Object.entries(r.cits)) console.log(`      ${k}: "${c.snippet}"`)
    if (!apply) { written.push({ id: r.id, restriction: r.restriction, spendTypes: r.spendTypes, subtypes }); continue }

    const res = await mergeGrantUpdate({ id: r.id, fields, source: SOURCE, db, citations: r.cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)

    if (refused.length) {
      const blocker = (x: { blockedBy?: unknown }) => ((x.blockedBy as { source?: string } | undefined)?.source ?? '')
      const notAdmin = refused.filter(x => !blocker(x).startsWith('admin:'))
      if (notAdmin.length) throw new Error(`${title}: refused by something other than an admin decision — ${JSON.stringify(notAdmin)}`)
      const first = Object.values(r.cits)[0]
      extraReport.push({
        id: r.id, title, why: 'pinned',
        quote: first?.snippet ?? '', url: first?.source_url ?? '',
        note: `mergeGrantUpdate refused ${refused.map(x => `${x.field} (${x.reason}, held by ${blocker(x)})`).join('; ')}. Left as the admin decision set it.`,
      })
      continue
    }

    // The guard: this job writes only spend fields, so nothing else may move.
    const after = await db.from('scraped_grants').select(STATE_COLS).eq('id', r.id).single()
    if (after.error || !after.data) throw new Error(`${r.id}: re-read failed`)
    const a = snap(before.data as unknown as Record<string, unknown>)
    const b = snap(after.data as unknown as Record<string, unknown>)
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      throw new Error(`${title}: STATE MOVED during a job that only writes spend fields. before ${JSON.stringify(a)} after ${JSON.stringify(b)}`)
    }

    written.push({ id: r.id, restriction: r.restriction, spendTypes: r.spendTypes, subtypes })
  }

  for (const r of [...report, ...extraReport]) console.log(`  report  ${r.title.slice(0, 40).padEnd(40)} ${r.why}`)
  if (apply) appendBatch(batch, written, [...report, ...extraReport])
}
