// What is each crawl source actually worth?
//
// crawl.ts registers 96 sources. The 2026-07-25 pipeline audit found most of
// them make no HTTP request at all: they are hand-maintained literals that
// re-assert themselves twice a week and refresh last_seen_at, so a static seed
// looks maintained forever and a broken scraper looks identical to a funder
// with nothing new on.
//
// This joins three things nobody had put side by side:
//
//   1. CODE SHAPE   — does the function actually fetch? does it fall back to
//                     hardcoded rows when parsing fails?
//   2. YIELD        — what crawl_logs says it has fetched and upserted
//   3. SURVIVAL     — how many of its rows are live in the catalogue today
//
// A source earns its place by putting live rows in the catalogue. One that
// fetches nothing, or fetches and yields nothing, or whose rows all end up
// inactive, is costing a cron slot and hiding a gap.
//
// Read-only. Run: npx tsx scripts/audit-sources.ts [--csv]

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

type Shape = 'scraper' | 'scraper_with_fallback' | 'static_seed' | 'unknown'

/** Parse crawl.ts and work out what each source function actually does. */
function readCodeShapes(): Map<string, { fn: string; shape: Shape; lines: number }> {
  const src = readFileSync(resolve(HERE, '..', 'src', 'lib', 'crawl.ts'), 'utf8')
  const out = new Map<string, { fn: string; shape: Shape; lines: number }>()

  // Split on function starts; each chunk is one function body (plus trailing
  // text up to the next one, which is close enough for a shape heuristic).
  const chunks = src.split(/\nasync function (crawl[A-Za-z0-9_]+)\s*\(/)
  for (let i = 1; i < chunks.length; i += 2) {
    const fn   = chunks[i]
    const body = chunks[i + 1] ?? ''

    const sourceMatch = body.match(/const\s+SOURCE\s*=\s*['"]([^'"]+)['"]/)
    if (!sourceMatch) continue
    const source = sourceMatch[1]

    // Does it make a network request at all?
    const fetches = /\b(fetchHtml|fetchJson|fetch)\s*\(/.test(body)
    // Does it upsert a literal list when parsing yields nothing? The tell is an
    // upsert call sitting after a `grants.length > 0` early return.
    const hasFallback = /grants\.length\s*>\s*0[\s\S]{0,200}?return await upsertGrants[\s\S]{0,4000}?upsertGrants\s*\(/.test(body)

    const shape: Shape = !fetches ? 'static_seed'
                       : hasFallback ? 'scraper_with_fallback'
                       : 'scraper'
    out.set(source, { fn, shape, lines: body.split('\n').length })
  }
  return out
}

/**
 * Read every row, not the first 1000.
 *
 * PostgREST caps an unbounded select at 1000 rows and says nothing. The first
 * version of this script read crawl_logs (10,676 rows) and scraped_grants
 * (1,729) straight, so every per-source total was computed from an arbitrary
 * slice: `manual` came out at 103 live rows against a true 212, and gov_uk at
 * 10 against 19. The output looked entirely plausible, which is the whole
 * problem — it was only caught by reconciling the totals against a COUNT.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchAll<T>(
  db: any,
  table: string,
  columns: string,
  refine?: (q: any) => any,
): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(columns).range(from, from + PAGE - 1)
    if (refine) q = refine(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    const batch = (data ?? []) as unknown as T[]
    out.push(...batch)
    if (batch.length < PAGE) return out
  }
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const shapes = readCodeShapes()

  // Yield over the last 90 days, per source.
  type Log = { source: string; fetched: number | null; upserted: number | null; error: string | null; ran_at: string }
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const logs = await fetchAll<Log>(db, 'crawl_logs', 'source, fetched, upserted, error, ran_at',
    q => q.gte('ran_at', since))

  const byLog = new Map<string, { runs: number; fetched: number; upserted: number; errors: number; last: string }>()
  for (const l of logs) {
    const cur = byLog.get(l.source) ?? { runs: 0, fetched: 0, upserted: 0, errors: 0, last: '' }
    cur.runs++
    cur.fetched  += l.fetched ?? 0
    cur.upserted += l.upserted ?? 0
    if (l.error) cur.errors++
    if (l.ran_at > cur.last) cur.last = l.ran_at
    byLog.set(l.source, cur)
  }

  // Catalogue survival, per source.
  const rows = await fetchAll<{ source: string | null; is_active: boolean }>(db, 'scraped_grants', 'source, is_active')
  const byRow = new Map<string, { total: number; active: number }>()
  for (const r of rows) {
    const k = r.source ?? '(none)'
    const cur = byRow.get(k) ?? { total: 0, active: 0 }
    cur.total++; if (r.is_active) cur.active++
    byRow.set(k, cur)
  }

  const errs = await fetchAll<{ source: string }>(db, 'crawl_errors', 'source',
    q => q.is('resolved_at', null))
  const byErr = new Map<string, number>()
  for (const e of errs) byErr.set(e.source, (byErr.get(e.source) ?? 0) + 1)

  // One row per registered source.
  const all = new Set<string>([...Array.from(shapes.keys()), ...Array.from(byRow.keys()), ...Array.from(byLog.keys())])
  type Row = {
    source: string; shape: Shape | 'not_in_code'; runs: number; fetched: number
    upserted: number; errors: number; total: number; active: number; unresolved: number
  }
  const report: Row[] = []
  for (const source of Array.from(all)) {
    const s = shapes.get(source)
    const l = byLog.get(source) ?? { runs: 0, fetched: 0, upserted: 0, errors: 0, last: '' }
    const r = byRow.get(source) ?? { total: 0, active: 0 }
    report.push({
      source, shape: s?.shape ?? 'not_in_code',
      runs: l.runs, fetched: l.fetched, upserted: l.upserted, errors: l.errors,
      total: r.total, active: r.active, unresolved: byErr.get(source) ?? 0,
    })
  }

  // --retire: the sources whose code can go, with their function names.
  //
  // Only STATIC DEAD qualifies: a hardcoded literal with zero live rows. Nothing
  // is lost by deleting it, because there is nothing live to lose, and the row
  // it re-asserts twice a week is what makes a gap look covered.
  //
  // Real scrapers with zero survivors are deliberately NOT listed. They are
  // broken over funders that matter (Henry Smith, Arts Council, Nationwide,
  // UnLtd), and deleting them would convert a fixable bug into a silent absence.
  if (process.argv.includes('--retire')) {
    const dead = report
      .filter(r => r.shape === 'static_seed' && r.active === 0)
      .sort((a, b) => a.source.localeCompare(b.source))
    console.log(`# ${dead.length} static-dead sources to retire`)
    for (const r of dead) {
      console.log(`${r.source}\t${shapes.get(r.source)?.fn ?? '?'}\t${r.total} rows (${r.active} live)`)
    }
    const broken = report
      .filter(r => r.shape !== 'static_seed' && r.shape !== 'not_in_code' && r.active === 0)
      .sort((a, b) => b.total - a.total)
    console.log(`\n# ${broken.length} real scrapers with no survivors — FIX or retire, a judgement call`)
    for (const r of broken) {
      console.log(`${r.source}\t${shapes.get(r.source)?.fn ?? '?'}\t${r.total} rows, ${r.unresolved} unresolved errors`)
    }
    return
  }

  if (process.argv.includes('--csv')) {
    console.log('source,shape,runs_90d,fetched_90d,upserted_90d,errors_90d,rows_total,rows_active,unresolved_errors')
    for (const r of report.sort((a, b) => b.active - a.active)) {
      console.log([r.source, r.shape, r.runs, r.fetched, r.upserted, r.errors, r.total, r.active, r.unresolved].join(','))
    }
    return
  }

  // ── Verdicts ──────────────────────────────────────────────────────────────
  const inCode = report.filter(r => r.shape !== 'not_in_code')
  const realScrapers = inCode.filter(r => r.shape !== 'static_seed')

  const verdict = (r: Row): string => {
    if (r.shape === 'not_in_code')                       return 'ORPHAN ROWS   no code path; entered out of band'
    if (r.shape === 'static_seed')                       return r.active > 0 ? 'STATIC SEED   hand-maintained, no HTTP' : 'STATIC DEAD   hand-maintained, nothing live'
    if (r.runs === 0)                                    return 'NEVER RAN     registered but no run in 90d'
    if (r.fetched === 0)                                 return 'SILENT ZERO   runs, fetches nothing, no error'
    if (r.active === 0)                                  return 'NO SURVIVORS  fetches, but nothing is live'
    return 'WORKING'
  }

  const groups = new Map<string, Row[]>()
  for (const r of report) {
    const v = verdict(r).split('  ')[0].trim()
    groups.set(v, [...(groups.get(v) ?? []), r])
  }

  console.log(`\n${inCode.length} sources registered in crawl.ts`)
  console.log(`  ${realScrapers.length} make an HTTP request, ${inCode.length - realScrapers.length} are static seeds\n`)
  console.log('VERDICT        COUNT  ROWS LIVE')
  console.log('-'.repeat(64))
  for (const [v, rs] of Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const live = rs.reduce((n, r) => n + r.active, 0)
    console.log(`${v.padEnd(14)} ${String(rs.length).padStart(5)}  ${String(live).padStart(9)}`)
  }

  const show = (title: string, rs: Row[], n = 100) => {
    if (rs.length === 0) return
    console.log(`\n── ${title} (${rs.length}) ───────────────────────`)
    console.log('  live  total  fetch90  up90  errs  source')
    for (const r of rs.sort((a, b) => b.active - a.active || b.fetched - a.fetched).slice(0, n)) {
      console.log(`  ${String(r.active).padStart(4)}  ${String(r.total).padStart(5)}  ${String(r.fetched).padStart(7)}  ${String(r.upserted).padStart(4)}  ${String(r.unresolved).padStart(4)}  ${r.source}`)
    }
  }

  show('WORKING — fetch, yield, and survive', groups.get('WORKING') ?? [])
  show('SILENT ZERO — running, fetching nothing, reporting no error', groups.get('SILENT ZERO') ?? [])
  show('NO SURVIVORS — fetches rows, none live in the catalogue', groups.get('NO SURVIVORS') ?? [])
  show('NEVER RAN — registered, no run recorded in 90 days', groups.get('NEVER RAN') ?? [])
  show('STATIC DEAD — hardcoded and nothing live', groups.get('STATIC DEAD') ?? [])
  show('ORPHAN ROWS — rows exist, no code path', groups.get('ORPHAN ROWS') ?? [])
  const summed = report.reduce((n, r) => n + r.active, 0)
  const trueActive = rows.filter(r => r.is_active).length
  console.log(`\nreconciliation: ${summed} live rows across sources vs ${trueActive} live in the table` +
              (summed === trueActive ? '  OK' : '  MISMATCH — the read was truncated'))
  console.log()
}

main()
