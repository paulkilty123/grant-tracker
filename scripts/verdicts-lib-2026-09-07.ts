// Shared shapes and runner for the verdicts job of 2026-09-07.
// See docs/handoffs/verdicts-2026-09-07.md.
//
// THE ONE THING THIS FILE EXISTS TO GUARANTEE
//
// Rule 1 of the brief is that nothing changes state: no is_active, no
// pipeline_state, no rejection_reason. Those are Paul's, from the review queue,
// and this job only writes a verdict file plus the tidy on rows that might be
// published.
//
// Reading the code says that cannot happen: transitionPipelineState fires on
// is_active, on url_status='dead', or on an AI source writing a tracked field to
// a `captured` row, and AI_SOURCE_PREFIXES is
// ['ai_classifier:','ai_enrich:','ai_audit:','ai_detect:','360giving:'] — so
// `system:` and `user_verified:` cannot trigger it, and three captured rows in
// pile A are safe. That argument is correct and it is still only an argument.
//
// So every row is snapshotted before the write and re-read after it, and the
// runner throws if is_active, pipeline_state or rejection_reason moved by so
// much as a character. The check can fail, which is the point: if a later
// refactor adds a transition, this job stops on the first row rather than
// quietly restating 262 rows for Paul.

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

export const RESULTS = join(__dirname, '..', 'docs', 'handoffs', 'verdict-results-2026-09-07.json')

// Rule 2, rewritten 7 Sept after batch 1. Anything READ off the page today,
// with the sentence as its citation, is written at user_verified in both piles
// — the brief included. That outranks the ai_enrich:v2 briefs 57 of the 67
// pile A rows carry, which is the point of the depth rule: those briefs are
// what "not enriched" means, and a cited brief from today's page replaces them.
//
// The original rule had pile A at system: trust so a Re-enrich could still win.
// It could not: a system write is trust 50 and ai_enrich:v2 is 60, so the brief
// was refused on 57 of 67 rows and every pile A publish was blocked.
export const SOURCE = 'user_verified:verdicts-2026-09-07'
/** For a value inferred rather than read — a location tag from an address, a
 *  sector from the prose. Nothing in this job has needed it yet. */
export const SOURCE_INFERRED = 'system:verdicts-2026-09-07'

export type Cit = Record<string, { snippet: string; confidence: 'high' | 'med' | 'low'; source_url?: string }>

export type VerdictKind = 'publish' | 'park' | 'reject' | 'hold'

export type Row = {
  id: string
  re: RegExp
  pile: 'A' | 'B'
  verdict: VerdictKind
  /** Reject only, from src/lib/admin/reject-reasons.ts */
  code?: string
  quote: string
  url: string
  /** Hold and reject only: one sentence on what Paul is deciding. */
  for_paul?: string
  /** The tidy. Tracked columns. */
  fields?: Record<string, unknown>
  cits?: Cit
  /** funder_brief keys to set, merged over whatever is there. */
  brief?: Record<string, string>
  briefCits?: Cit
  /** A brief that is written and quoted but could not be applied yet. Carried
   *  so a blocked publish can be promoted in one line once the block is lifted,
   *  rather than researched again. Never written by the runner. */
  heldBrief?: Record<string, string>
  heldBriefCits?: Cit
  sources?: { url: string; label: string }[]
}

export type Verdict = {
  id: string; title: string; pile: 'A' | 'B'; verdict: VerdictKind
  code?: string; quote: string; url: string
  tidied: string[]
  for_paul?: string
}

type ResultsFile = {
  batches: { batch: number; pile: 'A' | 'B'; verdicts: Verdict[]; paul_list: string[] }[]
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

const ORDER: VerdictKind[] = ['publish', 'park', 'reject', 'hold']

// The seven the brief requires before a row may be recommended for publish,
// added 2026-09-07 after Paul's point that rows keep going live unenriched.
// A row whose page cannot support all seven is a hold, not a publish, so this
// list is a gate rather than a template: it is checked in runBatch and throws.
export const BRIEF_FIELDS = [
  'who_can_apply', 'what_they_fund', 'how_to_apply', 'exclusions',
  'decision_timeline', 'typical_award', 'open_status',
] as const

/**
 * funder_brief in the shape scripts/newsletter-batch-2026-09-04.ts writes:
 * `source: 'live_fetch'`, today's `last_enriched`, and `_citations` carrying a
 * quote and a source_url for every field that came off the page.
 */
export function brief(url: string, fields: Record<string, string>, cits: Cit) {
  return {
    source: 'live_fetch',
    last_enriched: '2026-09-07',
    ...fields,
    _citations: Object.fromEntries(
      Object.entries(cits).map(([k, v]) => [k, { ...v, source_url: v.source_url ?? url }]),
    ),
  }
}

/** Returns the reasons a brief is not complete to depth. Empty means it is. */
export function briefGaps(fields: Record<string, string> | undefined, cits: Cit | undefined): string[] {
  const gaps: string[] = []
  for (const f of BRIEF_FIELDS) {
    const v = (fields ?? {})[f]
    if (!v || !v.trim()) { gaps.push(`${f} missing`); continue }
    // "Not stated" is the thing Paul objected to, and it stays blocked. An
    // HONEST ABSENCE is different and is allowed for any field, ruled 7 Sept:
    // "The page states no decision timeline", with the closest sentence cited,
    // is a finding about the page rather than a gap in the reading. The
    // citation requirement below still applies, so an absence cannot be
    // asserted without showing what was read.
    if (/^\s*(not stated|see website|n\/a|unknown)\s*\.?\s*$/i.test(v)) gaps.push(`${f} says "${v.trim()}"`)
    if (!(cits ?? {})[f]) gaps.push(`${f} has no citation`)
  }
  const open = (fields ?? {}).open_status
  if (open && !['open', 'between_rounds', 'closed'].includes(open)) gaps.push(`open_status "${open}" is not one of open/between_rounds/closed`)
  return gaps
}

/** One line per verdict, publish first, so Paul can work down it. */
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

export function appendBatch(batch: number, pile: 'A' | 'B', verdicts: Verdict[]) {
  const file = readResults()
  file.batches = file.batches.filter(b => !(b.batch === batch && b.pile === pile))
  file.batches.push({ batch, pile, verdicts, paul_list: paulList(verdicts) })
  file.batches.sort((a, b) => (a.pile === b.pile ? a.batch - b.batch : a.pile < b.pile ? -1 : 1))
  writeFileSync(RESULTS, JSON.stringify(file, null, 1) + '\n')
  const tally = ORDER.map(k => `${k} ${verdicts.filter(v => v.verdict === k).length}`).join(', ')
  console.log(`  results -> ${RESULTS} (pile ${pile} batch ${batch}: ${tally})`)
}

/** The three columns this job must never move. */
const STATE_COLS = 'id, title, is_active, pipeline_state, rejection_reason'
type StateSnapshot = { is_active: unknown; pipeline_state: unknown; rejection_reason: unknown }
const snap = (r: Record<string, unknown>): StateSnapshot =>
  ({ is_active: r.is_active, pipeline_state: r.pipeline_state, rejection_reason: r.rejection_reason })

// Distinctive words for the dedup query: drop the noise that half the catalogue
// shares, so "Community Grants" does not match ninety rows and prove nothing.
const STOP = new Set(['the', 'and', 'for', 'of', 'a', 'grant', 'grants', 'fund', 'funds', 'funding',
  'programme', 'program', 'community', 'trust', 'foundation', 'charitable', 'charity', 'uk', 'scheme'])
export function distinctiveWords(title: string): string[] {
  return title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w))
}
const hostOf = (url: string) => { try { return new URL(url).host.replace(/^www\./, '') } catch { return '' } }

/**
 * Rule 7: dedup every publish in SQL against the WHOLE table before the verdict
 * is written. Returns live rows that look like the same fund. A hit does not
 * throw — the caller turns it into a reject naming the id, which is a judgement
 * about two rows rather than something a substring match should decide alone.
 */
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

export async function runBatch(opts: {
  batch: number
  pile: 'A' | 'B'
  rows: Row[]
  apply: boolean
  db: SupabaseClient
}) {
  const { batch, pile, rows, apply, db } = opts
  const source = SOURCE
  const tally = ORDER.map(k => `${k} ${rows.filter(v => v.verdict === k).length}`).join(', ')
  console.log(`pile ${pile} batch ${batch} — ${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} rows: ${tally}`)
  console.log(`  source for tidy writes: ${source}`)

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
    if (!r.quote.trim() && r.verdict !== 'hold') throw new Error(`${r.id}: a ${r.verdict} needs the page's sentence`)
    if (r.verdict === 'publish') {
      const gaps = briefGaps(r.brief, r.briefCits)
      if (gaps.length) {
        throw new Error(`${title}: publish blocked, brief is not complete to depth — ${gaps.join('; ')}. If the page cannot support all seven, make it a hold.`)
      }
    }

    const tidied: string[] = []
    console.log(`  ${r.verdict.toUpperCase().padEnd(7)} ${title.slice(0, 46).padEnd(46)} ${r.code ?? ''}`)
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
      // Columns first, then the brief, so a refused column never leaves prose
      // describing a value the row does not hold. Same order as the amounts job.
      let columnsOk = true
      if (r.fields && Object.keys(r.fields).length) {
        const fields: Record<string, unknown> = { ...r.fields }
        if (r.sources?.length) {
          const existing = (data.grant_sources as { url?: string }[] | null) ?? []
          const have = new Set(existing.map(s => s.url))
          const add = r.sources.filter(s => !have.has(s.url)).map(s => ({ url: s.url, text: '', label: s.label }))
          if (add.length) fields.grant_sources = [...existing, ...add]
        }
        const res = await mergeGrantUpdate({ id: r.id, fields, source, db, citations: r.cits })
        const refused = res.rejected.filter(x => x.reason !== 'idempotent')
        console.log(`      applied [${res.applied.join(', ') || 'nothing'}]${refused.length ? `  REFUSED ${JSON.stringify(refused)}` : ''}`)
        if (refused.length) {
          // Rule 5: an admin-held field is reported, not overwritten. Anything
          // else refusing is a bug in this script, not a decision.
          const blocker = (x: { blockedBy?: unknown }) => ((x.blockedBy as { source?: string } | undefined)?.source ?? '')
          const notAdmin = refused.filter(x => !blocker(x).startsWith('admin:'))
          if (notAdmin.length) throw new Error(`${title}: refused by something other than an admin decision — ${JSON.stringify(notAdmin)}`)
          throw new Error(`${title}: admin-held field refused the tidy — this row should have been a hold, not a ${r.verdict}`)
        }
        // `tidied` records what the ROW now holds because of this verdict, not
        // what this particular run changed. A re-run makes every write
        // idempotent, and reporting an empty tidied list then would understate
        // the work and mislead the checker about which fields to re-read.
        tidied.push(...Object.keys(r.fields))
        // Reaching here means nothing was refused: a refusal throws above. An
        // EMPTY applied list is the idempotent case — the row already holds the
        // value — and the brief may still describe it. Treating "applied
        // nothing" as failure blocked the Co-op brief on a re-run, because the
        // amount correction had landed in an earlier apply and was a no-op the
        // second time. The derivative rule is "do not describe a value the row
        // does not hold", and after an idempotent write it does hold it.
        columnsOk = true
      }
      if (r.brief && columnsOk) {
        const existing = (data.funder_brief as Record<string, unknown> | null) ?? {}
        const fresh = brief(r.url, r.brief, r.briefCits ?? {}) as Record<string, unknown>
        // Keep any citations already on the row that this write does not replace.
        const priorCits = (existing._citations ?? {}) as Record<string, unknown>
        const merged: Record<string, unknown> = { ...existing, ...fresh }
        merged._citations = { ...priorCits, ...(fresh._citations as Record<string, unknown>) }
        const firstCit = Object.values(r.briefCits ?? {})[0]
        const res2 = await mergeGrantUpdate({
          id: r.id, fields: { funder_brief: merged }, source, db,
          citations: firstCit ? { funder_brief: firstCit } : undefined,
        })
        const refused2 = res2.rejected.filter(x => x.reason !== 'idempotent')
        console.log(`      brief [${res2.applied.join(', ') || 'nothing'}]${refused2.length ? `  REFUSED ${JSON.stringify(refused2)}` : ''}`)
        // A publish whose brief did not land is not a publish. Batch 1 recorded
        // one before this check existed: the columns applied, the brief was
        // refused as lower_trust, and the verdict still said publish with a
        // single tidied field. The gate that checks the brief is COMPLETE ran
        // before the write; nothing checked that the write succeeded.
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
      id: r.id, title, pile, verdict: r.verdict,
      ...(r.code ? { code: r.code } : {}),
      quote: r.quote, url: r.url, tidied,
      ...(r.for_paul ? { for_paul: r.for_paul } : {}),
    })
  }

  console.log('\n  Paul list:')
  for (const line of paulList(verdicts)) console.log(`    ${line}`)
  if (apply) appendBatch(batch, pile, verdicts)
}
