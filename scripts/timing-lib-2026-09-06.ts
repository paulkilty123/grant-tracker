// Shared shapes and results-file writer for the timing job of 2026-09-06.
// See docs/handoffs/timing-2026-09-06.md. One batch script per 20 rows; each
// appends its own entry to docs/handoffs/timing-results-2026-09-06.json on
// --apply, so the results file and the scripts cannot drift apart.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseOpenDate } from '../src/lib/parse-open-date'

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

// next_open_date_parsed is never hand-written. The app has one parser for the
// prose form and the reopen cron reads what it produces, so a batch script that
// picked its own date could disagree with every other writer in the codebase.
// Derived here from next_open_date, and it must produce something: an
// unparseable reopening sentence is a row to report, not to write.
export function withParsedOpenDate(fields: Record<string, unknown>): Record<string, unknown> {
  const prose = fields.next_open_date
  if (typeof prose !== 'string' || !prose.trim()) return fields

  // parseOpenDate takes the FIRST four-digit year in the string. A funder's own
  // sentence often carries more than one — "The Community Catalyst Fund 2027 to
  // 2029 is expected to be open ... in the autumn of 2026" parses to 2027-09-01,
  // a year late, and nothing downstream would ever say so. Two years in the
  // prose is a sentence to trim, not to feed the parser, so it stops here.
  const years = (prose.match(/\b20\d{2}\b/g) ?? []).filter((y, i, a) => a.indexOf(y) === i)
  if (years.length > 1) {
    throw new Error(`withParsedOpenDate: "${prose}" names ${years.length} years (${years.join(', ')}) — parseOpenDate would take the first. Store the reopening clause alone and keep the full sentence as the citation.`)
  }

  const parsed = parseOpenDate(prose)
  if (!parsed) throw new Error(`withParsedOpenDate: parseOpenDate could not read "${prose}"`)
  return { ...fields, next_open_date_parsed: parsed }
}

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
