// Shared shapes and results-file writer for the timing job of 2026-09-06.
// See docs/handoffs/timing-2026-09-06.md. One batch script per 20 rows; each
// appends its own entry to docs/handoffs/timing-results-2026-09-06.json on
// --apply, so the results file and the scripts cannot drift apart.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

export type Row = {
  id: string
  re: RegExp
  fields: Record<string, unknown>
  cits: Cit
  sources?: { url: string; label: string }[]
}

export type Report = {
  id: string
  title: string
  why: 'unreadable' | 'not_stated' | 'closed_no_date' | 'invite_only' | 'fund_closed' | 'pinned'
  quote: string
  url: string
  note?: string
}

export type State = 'rolling' | 'dated' | 'reopens' | 'cycle'

export const RESULTS = join(__dirname, '..', 'docs', 'handoffs', 'timing-results-2026-09-06.json')

// Which of the four states a row's written fields represent. Derived from the
// fields rather than declared, so the results file cannot disagree with the DB.
export function stateOf(fields: Record<string, unknown>): State {
  if (fields.is_rolling === true) return 'rolling'
  if (Array.isArray(fields.deadline_cycle) && fields.deadline_cycle.length > 0) return 'cycle'
  if (typeof fields.deadline === 'string') return 'dated'
  if (fields.next_open_date) return 'reopens'
  throw new Error(`stateOf: no state in ${JSON.stringify(fields)}`)
}

export function appendBatch(batch: number, rows: Row[], report: Report[]) {
  const all: unknown[] = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, 'utf8')) : []
  const entry = {
    batch,
    written: rows.map(r => ({
      id: r.id,
      state: stateOf(r.fields),
      fields: r.fields,
      citations: r.cits,
    })),
    report,
  }
  const kept = (all as { batch: number }[]).filter(b => b.batch !== batch)
  kept.push(entry as never)
  kept.sort((a, b) => a.batch - b.batch)
  writeFileSync(RESULTS, JSON.stringify(kept, null, 1) + '\n')
  console.log(`  results -> ${RESULTS} (batch ${batch}: ${rows.length} written, ${report.length} reported)`)
}
