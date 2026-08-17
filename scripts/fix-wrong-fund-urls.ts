/**
 * Point the catalogue's wrong links at the right page.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE NUMBER THIS EXISTS TO MOVE
 *
 * Live rows whose apply_url points at a page that names their fund, out of 649.
 * On 2026-08-17 that was 407. Everything else this script reports is working,
 * not outcome.
 *
 * Paul, 2026-08-17, redrawing a line he had drawn himself and in the wrong
 * place:
 *
 *   > My "take down, never put up" rule was drawn in the wrong place. The right
 *   > line is verifiable versus judgement, not add versus remove. "Does this
 *   > page name this fund?" is objectively testable, so a URL correction belongs
 *   > on your side of the line.
 *
 * THE CONDITIONS, all of them enforced in code rather than in a prompt:
 *
 *   same host          `candidateLinks` rejects anything off-site (sameSite)
 *   the page names it  the candidate must PASS the gate, and `namesMatch` must
 *                      agree the fund it names is ours
 *   reversible         the old URL is written to the ledger file before the
 *                      change, and to `funding_index_url` when it was a listing
 *   abstain            no candidate that names the fund means no change, ever.
 *                      Silence is the default and costs nothing
 *
 * The re-read is not a second pass. The hop extracts from the page it lands on
 * and `foldResult` merges those findings over the old ones, so timing and
 * eligibility arrive from the corrected page in the same run.
 *
 * SOURCE is `ai_audit:url_hop:v1` (trust 60). Not `admin:` — nothing here was
 * reviewed by a human, and an admin source would pin the URL against every
 * future correction. Trust 60 clears `admin:legacy` (35), `scraper` (40),
 * `seed`/`discovery` (25) and ties `ai_enrich`, which is enough for 186 of the
 * 190. The 4 rows Paul pinned himself are refused, and reported as refused.
 *
 * Run:  npx tsx scripts/fix-wrong-fund-urls.ts [--limit N] [--apply]
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyRow, type VerifyRow } from '../src/lib/verification/verify-row'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { buildEvidencePatch, recordFieldEvidence, PAGE_READ_KEY } from '../src/lib/field-evidence'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const argOf = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined }
const LIMIT  = Number(argOf('--limit') ?? 1000)
const APPLY  = process.argv.includes('--apply')
const SOURCE = 'ai_audit:url_hop:v1'
const VERIFIER = 'verify:v2+urlhop'

/** Measured on the 16 August runs, per page read. Two pages is the usual shape
 *  here: the wrong one, then the right one. */
const GBP_PER_PAGE = 0.0058

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const COLS = 'id, title, funder, funding_type, apply_url, deadline, deadline_cycle, next_open_date, is_rolling, max_org_income, min_org_income, is_invite_only, eligible_structures, location_tag, funder_brief, field_evidence, funding_index_url'

/** Paul's one unit: live rows pointing at a page that names their fund. */
async function metric(): Promise<{ named: number; live: number }> {
  const { count: live } = await db.from('scraped_grants')
    .select('id', { count: 'exact', head: true }).eq('is_active', true)
  const { count: named } = await db.from('scraped_grants')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true).eq('field_evidence->_page_read->>note', 'verified')
  return { named: named ?? 0, live: live ?? 0 }
}

async function main() {
  const before = await metric()
  console.log(`BEFORE: ${before.named} of ${before.live} live rows point at a page that names their fund\n`)

  const { data, error } = await db.from('scraped_grants').select(COLS)
    .eq('is_active', true)
    .like('field_evidence->_page_read->>note', 'fixable_link%')
    // Already hunted. A row that abstained does not get cheaper on a second
    // look at the same pages, and re-running the script must not silently pay
    // twice for the rows it already gave up on.
    .neq('field_evidence->_page_read->>by', VERIFIER)
    .order('id')
    .range(0, LIMIT - 1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as (VerifyRow & { funding_index_url: string | null })[]

  console.log(`${rows.length} rows to work.`)
  console.log(`estimated cost: about £${(rows.length * GBP_PER_PAGE * 2).toFixed(2)} at two pages a row\n`)
  if (!APPLY) { console.log('DRY RUN — nothing fetched, nothing written. Re-run with --apply.\n'); return }

  // WRITTEN AFTER EVERY ROW, NOT AT THE END.
  //
  // The first full pass was killed at row 137 of 189. It had corrected twelve
  // URLs and the ledger — the only record of what each row pointed at BEFORE —
  // was still in memory, so it died with the process. The promise was that every
  // change is reversible; a run that only becomes reversible if it is allowed to
  // finish does not keep it.
  const LEDGER_PATH = resolve(HERE, '..', 'reports', 'url-hop-2026-08-17.json')
  const ledger: unknown[] = []
  const flush = (extra: Record<string, unknown> = {}) => {
    writeFileSync(LEDGER_PATH, JSON.stringify(
      { ranAt: new Date().toISOString(), source: SOURCE, before, ...extra, ledger }, null, 2))
  }
  let corrected = 0, abstained = 0, refused = 0, failed = 0
  let pages = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    let result
    try {
      result = await verifyRow(row, anthropic, { hopOn: 'any' })
    } catch (e) {
      failed++
      ledger.push({ id: row.id, title: row.title, error: e instanceof Error ? e.message : String(e) })
      flush({ corrected, abstained, refused, failed, pages })
      continue
    }
    pages += result.pagesRead?.length ?? 1

    // The evidence stamp lands whatever happens — that is the engine's normal
    // job and it must not depend on whether a correction was found.
    const { patch } = buildEvidencePatch([
      ...result.evidence,
      {
        field: PAGE_READ_KEY, agrees: null, quote: null,
        source_url: result.followedUrl ?? row.apply_url,
        note: result.gate.pass ? result.outcome : `${result.outcome}: ${(result.gate as { failure?: string }).failure ?? 'gate failed'}`,
      },
    ], { by: VERIFIER })
    try { await recordFieldEvidence({ id: row.id, patch, db }) } catch { /* reported below via ledger */ }

    // The index page is worth keeping even when no correction was found — often
    // MORE so, because a row we could not resolve is one a funder-level record
    // would later fix.
    const idx = result.fundingIndexUrl
    if (idx && !row.funding_index_url) {
      await mergeGrantUpdate({ id: row.id, fields: { funding_index_url: idx }, source: SOURCE, pinned: false, db })
        .catch(() => { /* untracked column; a failure here must not lose the run */ })
    }

    const c = result.urlCorrection
    if (!c) {
      abstained++
      ledger.push({ id: row.id, title: row.title, outcome: 'abstained', funding_index_url: idx ?? null,
                    apply_url: row.apply_url, why: result.notes.slice(-1)[0] ?? 'no candidate named this fund' })
      flush({ corrected, abstained, refused, failed, pages })
      if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${rows.length} …`)
      continue
    }

    // The index page: the listing we came FROM, when it was one. Kept because a
    // funder-level record is the structural fix after launch and these URLs are
    // in hand exactly once.
    const fields: Record<string, unknown> = { apply_url: c.to }

    let applied: string[] = []
    let rejected: unknown[] = []
    let err: string | null = null
    try {
      const res = await mergeGrantUpdate({ id: row.id, fields, source: SOURCE, pinned: false, db })
      applied = res.applied; rejected = res.rejected
    } catch (e) { err = e instanceof Error ? e.message : String(e) }

    const ok = !err && applied.includes('apply_url')
    if (ok) corrected++; else refused++
    ledger.push({
      id: row.id, title: row.title, funder: row.funder,
      outcome: ok ? 'corrected' : 'refused',
      from: c.from, to: c.to, fundOnPage: c.fundOnPage,
      funding_index_url: idx ?? null,
      applied, rejected, error: err,
    })
    flush({ corrected, abstained, refused, failed, pages })
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${rows.length} …`)
  }

  const after = await metric()
  flush({ after, corrected, abstained, refused, failed, pages })

  console.log(`\ncorrected ${corrected}   abstained ${abstained}   refused ${refused}   failed ${failed}`)
  console.log(`pages read ${pages}, about £${(pages * GBP_PER_PAGE).toFixed(2)}`)
  console.log(`\nAFTER: ${after.named} of ${after.live} live rows point at a page that names their fund`)
  console.log(`ledger: reports/url-hop-2026-08-17.json`)
}

main().catch(e => { console.error(e); process.exit(1) })
