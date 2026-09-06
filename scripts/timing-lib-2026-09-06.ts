// Shared shapes and results-file writer for the timing job of 2026-09-06.
// See docs/handoffs/timing-2026-09-06.md. One batch script per 20 rows; each
// appends its own entry to docs/handoffs/timing-results-2026-09-06.json on
// --apply, so the results file and the scripts cannot drift apart.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseOpenDate } from '../src/lib/parse-open-date'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

export const SOURCE = 'user_verified:timing-2026-09-06'

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
  // index_over_programmes was added mid-job at the orchestrating session's
  // request: a funder-level page covering several programmes on separate
  // timetables cannot be given one date, and the relink job wants them
  // separable from rows whose own page simply says nothing.
  why: 'unreadable' | 'not_stated' | 'closed_no_date' | 'invite_only' | 'fund_closed' | 'pinned' | 'index_over_programmes'
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

// next_open_date_parsed is never hand-written. The app has one parser for the
// prose form and the reopen cron reads what it produces, so a batch script that
// picked its own date could disagree with every other writer in the codebase.
//
// The derived date is NOT passed to mergeGrantUpdate alongside the prose.
// next_open_date is tracked and next_open_date_parsed is not, so a single merge
// call lets the parsed date land even when the trust ladder refuses the prose it
// was derived from. That happened on Oxfordshire's Community Capacity Fund: the
// prose is pinned to Paul's "TBC — between rounds", the merger refused the new
// sentence, and the parsed date from the REFUSED sentence was written anyway —
// a date on the row that nothing on the row supports, and no error to say so.
// So: merge the prose first, and only stamp the parsed date if the prose was
// actually applied.
export function proseOpenDate(fields: Record<string, unknown>): string | null {
  const prose = fields.next_open_date
  if (typeof prose !== 'string' || !prose.trim()) return null

  // parseOpenDate takes the FIRST four-digit year in the string. A funder's own
  // sentence often carries more than one — "The Community Catalyst Fund 2027 to
  // 2029 is expected to be open ... in the autumn of 2026" parses to 2027-09-01,
  // a year late, and nothing downstream would ever say so. Two years in the
  // prose is a sentence to trim, not to feed the parser, so it stops here.
  const years = (prose.match(/\b20\d{2}\b/g) ?? []).filter((y, i, a) => a.indexOf(y) === i)
  if (years.length > 1) {
    throw new Error(`proseOpenDate: "${prose}" names ${years.length} years (${years.join(', ')}) — parseOpenDate would take the first. Store the reopening clause alone and keep the full sentence as the citation.`)
  }

  const parsed = parseOpenDate(prose)
  if (!parsed) throw new Error(`proseOpenDate: parseOpenDate could not read "${prose}"`)
  return parsed
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

// One runner for every batch, so a fix found in batch 3 cannot leave batch 7
// running the old loop. Order matters inside it:
//   1. look the row up by id and prove the title still matches, so a reordered
//      or retitled row stops the script instead of taking someone else's date
//   2. merge the tracked fields
//   3. only then stamp next_open_date_parsed, and only if the prose it came
//      from was applied
// A refusal that an admin source caused is not an error: the brief says log it
// and move on, so the row leaves `written` and joins `report` with why
// "pinned". That covers both shapes the merger returns —
//   reason "pinned"       an admin value with pinned:true, e.g. Oxfordshire's
//                         "TBC — between rounds"
//   reason "lower_trust"  an admin value at trust 100 that is not pinned, e.g.
//                         admin:rolling-ruling-2026-08-21 holding Corra's
//                         is_rolling at false
// Only the first was anticipated. The second reads as an ordinary trust-ladder
// rejection and would have aborted the batch, so it is caught by looking at WHO
// blocked the write rather than at the reason string. Anything an admin did not
// block still throws, because that would be a bug rather than a decision.
export async function runBatch(opts: {
  batch: number
  rows: Row[]
  report: Report[]
  apply: boolean
  db: SupabaseClient
}) {
  const { batch, rows, report, apply, db } = opts
  console.log(`batch ${batch} — ${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} writes, ${report.length} reported`)

  const written: Row[] = []
  const extraReport: Report[] = []

  for (const r of rows) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, deadline, is_rolling, next_open_date, next_open_date_parsed, grant_sources')
      .eq('id', r.id).single()
    if (!data) throw new Error(`${r.id}: no row`)
    if (!r.re.test(data.title)) throw new Error(`${r.id}: title "${data.title}" does not match ${r.re}`)

    const parsedOpen = proseOpenDate(r.fields)
    const fields: Record<string, unknown> = { ...r.fields }
    if (r.sources?.length) {
      const existing = (data.grant_sources as { url?: string }[] | null) ?? []
      const have = new Set(existing.map(s => s.url))
      const add = r.sources.filter(s => !have.has(s.url)).map(s => ({ url: s.url, text: '', label: s.label }))
      if (add.length) fields.grant_sources = [...existing, ...add]
    }

    console.log(`  ${data.title.slice(0, 44).padEnd(44)} ${JSON.stringify(r.fields).slice(0, 170)}`)
    for (const [k, c] of Object.entries(r.cits)) console.log(`      ${k}: "${c.snippet}"`)
    if (parsedOpen) console.log(`      next_open_date_parsed -> ${parsedOpen} (only if the prose is applied)`)
    if (!apply) { written.push(r); continue }

    const res = await mergeGrantUpdate({ id: r.id, fields, source: SOURCE, db, citations: r.cits })
    const refused = res.rejected.filter(x => x.reason !== 'idempotent')
    console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)

    if (refused.length) {
      const blocker = (x: { blockedBy?: unknown }) => ((x.blockedBy as { source?: string } | undefined)?.source ?? '')
      const notAdmin = refused.filter(x => !blocker(x).startsWith('admin:'))
      if (notAdmin.length) throw new Error(`${data.title}: refused by something other than an admin decision — ${JSON.stringify(notAdmin)}`)
      const cit = Object.values(r.cits)[0]
      extraReport.push({
        id: r.id, title: data.title, why: 'pinned',
        quote: cit?.snippet ?? '', url: cit?.source_url ?? '',
        note: `mergeGrantUpdate refused ${refused.map(x => `${x.field} (${x.reason}, held by ${blocker(x)})`).join('; ')}. Left as the admin decision set it.`,
      })
      continue
    }

    if (parsedOpen) {
      if (res.applied.includes('next_open_date')) {
        const { error } = await db.from('scraped_grants')
          .update({ next_open_date_parsed: parsedOpen }).eq('id', r.id)
        if (error) throw new Error(`${data.title}: next_open_date_parsed: ${error.message}`)
        console.log(`      next_open_date_parsed = ${parsedOpen}`)
      } else {
        console.log(`      next_open_date_parsed NOT written — the prose it derives from was not applied`)
      }
    }
    written.push(r)
  }

  for (const r of [...report, ...extraReport]) console.log(`  report  ${r.title.slice(0, 40).padEnd(40)} ${r.why}`)
  if (apply) appendBatch(batch, written, [...report, ...extraReport])
}
