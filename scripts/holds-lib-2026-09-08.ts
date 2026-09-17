// Shared shapes and runner for the holds job of 2026-09-08.
// See docs/handoffs/holds-2026-09-08.md. Adapted from verdicts-lib-2026-09-07.ts —
// same guarantees (rule 1: nothing changes state, checked before and after every
// write), same publish depth gate, same dedup-before-publish rule. Generalised
// from "pile" to "job" (1: browser reads, 2: relinks, 3: amounts) because this
// brief's three jobs share a runner even though job 3's results are written in
// the amounts job's own {written, report} shape rather than a verdict.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

export const RESULTS = join(__dirname, '..', 'docs', 'handoffs', 'holds-results-2026-09-08.json')
export const SOURCE = 'user_verified:holds-2026-09-08'
export const TODAY = '2026-09-08'

export type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>
export type VerdictKind = 'publish' | 'park' | 'reject' | 'hold'
export type ReadVia = 'fetch' | 'browser' | 'unreadable'

export type Row = {
  id: string
  re: RegExp
  job: 1 | 2
  verdict: VerdictKind
  code?: string
  quote: string
  url: string
  read_via: ReadVia
  for_paul?: string
  dupe_of?: string[]
  candidates?: { url: string; note: string }[]
  /** The tidy. Tracked columns (e.g. apply_url, amount_min, amount_max, next_open_date...). */
  fields?: Record<string, unknown>
  cits?: Cit
  brief?: Record<string, string>
  briefCits?: Cit
  sources?: { url: string; label: string }[]
}

export type Verdict = {
  id: string; title: string; job: number; verdict: VerdictKind
  code?: string; quote: string; url: string; read_via: ReadVia
  tidied: string[]
  for_paul?: string
  dupe_of?: string[]
  candidates?: { url: string; note: string }[]
}

type JobEntry =
  | { job: number; verdicts: Verdict[]; paul_list: string[] }
  | { job: 3; written: unknown[]; report: unknown[]; no_amount_count: { before: number; after: number } }

type ResultsFile = { jobs: JobEntry[]; summary?: unknown }

function readResults(): ResultsFile {
  if (!existsSync(RESULTS)) return { jobs: [] }
  const raw = JSON.parse(readFileSync(RESULTS, 'utf8'))
  return { jobs: raw.jobs ?? [], summary: raw.summary }
}

export function recordSummary(summary: unknown) {
  const file = readResults()
  file.summary = summary
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  console.log(`  summary -> ${RESULTS}`)
}

const ORDER: VerdictKind[] = ['publish', 'park', 'reject', 'hold']

// Same seven the verdicts brief requires, repeated here because Job 1 rows may
// be promoted to publish if the page supports it (Macmillan Q Lab is the one
// candidate). briefGaps() is the same gate, unchanged.
export const BRIEF_FIELDS = [
  'who_can_apply', 'what_they_fund', 'how_to_apply', 'exclusions',
  'decision_timeline', 'typical_award', 'open_status',
] as const

export function brief(url: string, fields: Record<string, string>, cits: Cit) {
  return {
    source: 'live_fetch',
    last_enriched: TODAY,
    ...fields,
    _citations: Object.fromEntries(
      Object.entries(cits).map(([k, v]) => [k, { ...v, source_url: v.source_url ?? url }]),
    ),
  }
}

export function briefGaps(fields: Record<string, string> | undefined, cits: Cit | undefined): string[] {
  const gaps: string[] = []
  for (const f of BRIEF_FIELDS) {
    const v = (fields ?? {})[f]
    if (!v || !v.trim()) { gaps.push(`${f} missing`); continue }
    if (/^\s*(not stated|see website|n\/a|unknown)\s*\.?\s*$/i.test(v)) gaps.push(`${f} says "${v.trim()}"`)
    if (!(cits ?? {})[f]) gaps.push(`${f} has no citation`)
  }
  const open = (fields ?? {}).open_status
  if (open && !['open', 'between_rounds', 'closed'].includes(open)) gaps.push(`open_status "${open}" is not one of open/between_rounds/closed`)
  return gaps
}

export function paulList(verdicts: Verdict[]): string[] {
  const out: string[] = []
  for (const kind of ORDER) {
    for (const v of verdicts.filter(x => x.verdict === kind)) {
      const bits = [kind.toUpperCase().padEnd(7), v.title]
      if (v.code) bits.push(`(${v.code})`)
      if (v.for_paul) bits.push(`— ${v.for_paul}`)
      out.push(bits.join(' '))
    }
  }
  return out
}

export function appendJob(job: number, verdicts: Verdict[]) {
  const file = readResults()
  file.jobs = file.jobs.filter(j => j.job !== job)
  file.jobs.push({ job, verdicts, paul_list: paulList(verdicts) })
  file.jobs.sort((a, b) => a.job - b.job)
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  const tally = ORDER.map(k => `${k} ${verdicts.filter(v => v.verdict === k).length}`).join(', ')
  console.log(`  results -> ${RESULTS} (job ${job}: ${tally})`)
}

export function appendJob3(written: unknown[], report: unknown[], no_amount_count: { before: number; after: number }) {
  const file = readResults()
  file.jobs = file.jobs.filter(j => j.job !== 3)
  file.jobs.push({ job: 3, written, report, no_amount_count })
  file.jobs.sort((a, b) => a.job - b.job)
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  console.log(`  results -> ${RESULTS} (job 3: ${written.length} written, ${report.length} reported, no-amount count ${no_amount_count.before} -> ${no_amount_count.after})`)
}

const STATE_COLS = 'id, title, is_active, pipeline_state, rejection_reason'
type StateSnapshot = { is_active: unknown; pipeline_state: unknown; rejection_reason: unknown }
const snap = (r: Record<string, unknown>): StateSnapshot =>
  ({ is_active: r.is_active, pipeline_state: r.pipeline_state, rejection_reason: r.rejection_reason })

const STOP = new Set(['the', 'and', 'for', 'of', 'a', 'grant', 'grants', 'fund', 'funds', 'funding',
  'programme', 'program', 'community', 'trust', 'foundation', 'charitable', 'charity', 'uk', 'scheme'])
export function distinctiveWords(title: string): string[] {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))
}
const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, '') } catch { return '' } }

export async function dedupCandidates(db: SupabaseClient, row: { id: string; title: string; url: string; funder?: string }) {
  const host = hostOf(row.url)
  const words = distinctiveWords(row.title)
  const hits = new Map<string, { id: string; title: string; funder: string | null; is_active: boolean; pipeline_state: string }>()

  const add = (rows: unknown[] | null) => {
    for (const r of (rows ?? []) as { id: string; title: string; funder: string | null; is_active: boolean; pipeline_state: string }[]) {
      if (r.id !== row.id) hits.set(r.id, r)
    }
  }
  if (host) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, funder, is_active, pipeline_state').ilike('apply_url', `%${host}%`).limit(50)
    add(data)
  }
  for (const w of words.slice(0, 3)) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, funder, is_active, pipeline_state').ilike('title', `%${w}%`).limit(50)
    add(data)
  }
  if (row.funder) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, funder, is_active, pipeline_state').ilike('funder', `%${row.funder}%`).limit(50)
    add(data)
  }
  return Array.from(hits.values()).filter(h => h.is_active)
}

export async function runJob(opts: {
  job: 1 | 2
  rows: Row[]
  apply: boolean
  db: SupabaseClient
}) {
  const { job, rows, apply, db } = opts
  const tally = ORDER.map(k => `${k} ${rows.filter(v => v.verdict === k).length}`).join(', ')
  console.log(`job ${job} — ${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} rows: ${tally}`)
  console.log(`  source for tidy writes: ${SOURCE}`)

  const verdicts: Verdict[] = []

  for (const r of rows) {
    const before = await db.from('scraped_grants')
      .select(`${STATE_COLS}, funder, apply_url, funder_brief, grant_sources`).eq('id', r.id).single()
    if (before.error || !before.data) throw new Error(`${r.id}: ${before.error?.message ?? 'no row'}`)
    const data = before.data as unknown as Record<string, unknown>
    const title = String(data.title)
    if (!r.re.test(title)) throw new Error(`${r.id}: title "${title}" does not match ${r.re}`)
    if (r.verdict === 'reject' && !r.code) throw new Error(`${r.id}: a reject needs a code`)
    if (r.verdict !== 'publish' && r.verdict !== 'park' && (r.fields || r.brief)) {
      throw new Error(`${r.id}: a ${r.verdict} writes nothing on the row`)
    }
    const provedDupe = r.verdict === 'reject' && r.code === 'duplicate' && (r.dupe_of?.length ?? 0) > 0
    if (!r.quote.trim() && r.verdict !== 'hold' && !provedDupe) {
      throw new Error(`${r.id}: a ${r.verdict} needs the page's sentence, or dupe_of naming the live row it duplicates`)
    }
    if (r.verdict === 'publish') {
      const gaps = briefGaps(r.brief, r.briefCits)
      if (gaps.length) {
        throw new Error(`${title}: publish blocked, brief is not complete to depth — ${gaps.join('; ')}. If the page cannot support all seven, make it a hold.`)
      }
    }

    const tidied: string[] = []
    console.log(`  ${r.verdict.toUpperCase().padEnd(7)} ${title.slice(0, 46).padEnd(46)} ${r.code ?? ''} [${r.read_via}]`)
    console.log(`      "${r.quote.slice(0, 150)}"`)

    if (r.verdict === 'publish') {
      const dupes = await dedupCandidates(db, { id: r.id, title, url: r.url, funder: data.funder as string | undefined })
      if (dupes.length) {
        console.log(`      DEDUP: ${dupes.length} live row(s) look similar — ${dupes.map(d => `${d.id} ${d.title}`).join(' | ')}`)
      } else {
        console.log(`      dedup clean`)
      }
    }

    if (apply && (r.fields || r.brief)) {
      let columnsOk = true
      if (r.fields && Object.keys(r.fields).length) {
        const fields: Record<string, unknown> = { ...r.fields }
        if (r.sources?.length) {
          const existing = (data.grant_sources as { url?: string }[] | null) ?? []
          const have = new Set(existing.map(s => s.url))
          const add = r.sources.filter(s => !have.has(s.url)).map(s => ({ url: s.url, text: '', label: s.label }))
          if (add.length) fields.grant_sources = [...existing, ...add]
        }
        const res = await mergeGrantUpdate({ id: r.id, fields, source: SOURCE, db, citations: r.cits })
        const refused = res.rejected.filter(x => x.reason !== 'idempotent')
        console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)
        if (refused.length) {
          const blocker = (x: { blockedBy?: unknown }) => ((x.blockedBy as { source?: string } | undefined)?.source ?? '')
          const notAdmin = refused.filter(x => !blocker(x).startsWith('admin:'))
          if (notAdmin.length) throw new Error(`${title}: refused by something other than an admin decision — ${JSON.stringify(notAdmin)}`)
          throw new Error(`${title}: admin-held field refused the tidy — this row should have been a hold, not a ${r.verdict}`)
        }
        tidied.push(...Object.keys(r.fields))
        columnsOk = true
      }
      if (r.brief && columnsOk) {
        const existing = (data.funder_brief as Record<string, unknown> | null) ?? {}
        const fresh = brief(r.url, r.brief, r.briefCits ?? {}) as Record<string, unknown>
        const priorCits = (existing._citations ?? {}) as Record<string, unknown>
        const merged: Record<string, unknown> = { ...existing, ...fresh }
        merged._citations = { ...priorCits, ...(fresh._citations as Record<string, unknown>) }
        const firstCit = Object.values(r.briefCits ?? {})[0]
        const res2 = await mergeGrantUpdate({
          id: r.id, fields: { funder_brief: merged }, source: SOURCE, db,
          citations: firstCit ? { funder_brief: firstCit } : undefined,
        })
        const refused2 = res2.rejected.filter(x => x.reason !== 'idempotent')
        console.log(`      brief [${res2.applied.join(', ') || 'nothing'}]${refused2.length ? `  REFUSED ${JSON.stringify(refused2)}` : ''}`)
        if (refused2.length && r.verdict === 'publish') {
          const held = refused2.map(x => `${x.reason} by ${((x.blockedBy as { source?: string } | undefined)?.source) ?? '?'}`).join('; ')
          throw new Error(`${title}: publish blocked, the brief was refused (${held}). The row keeps whatever brief it had, so this is a hold until the source question is settled.`)
        }
        tidied.push(...Object.keys(r.brief).map(k => `funder_brief.${k}`))
      } else if (r.brief) {
        console.log(`      brief NOT written — the columns it describes were not applied`)
      }

      // ── The guard ──────────────────────────────────────────────────────────
      const after = await db.from('scraped_grants').select(STATE_COLS).eq('id', r.id).single()
      if (after.error || !after.data) throw new Error(`${r.id}: re-read failed`)
      const a = snap(before.data as unknown as Record<string, unknown>)
      const b = snap(after.data as unknown as Record<string, unknown>)
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        throw new Error(`${title}: STATE MOVED during the tidy. before ${JSON.stringify(a)} after ${JSON.stringify(b)}. Rule 1 of the brief. Stop and put it back before continuing.`)
      }
    }

    verdicts.push({
      id: r.id, title, job, verdict: r.verdict,
      ...(r.code ? { code: r.code } : {}),
      quote: r.quote, url: r.url, read_via: r.read_via, tidied,
      ...(r.for_paul ? { for_paul: r.for_paul } : {}),
      ...(r.dupe_of?.length ? { dupe_of: r.dupe_of } : {}),
      ...(r.candidates?.length ? { candidates: r.candidates } : {}),
    })
  }

  console.log('\n  Paul list:')
  for (const line of paulList(verdicts)) console.log(`    ${line}`)
  if (apply) appendJob(job, verdicts)
}
