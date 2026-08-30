/**
 * Remove the FLOOR from the rows whose page states no amount at all.
 *
 * The 30 August sweep nulled the ceiling on 19 rows where the funder's page
 * carries no figure, and left the floor. That was wrong and in a way that made
 * the row worse rather than better: Esmée Fairbairn's Natural World guidance
 * states no figure, and the row went from "£30,000 to £200,000" — which reads
 * as a rough band — to "from £30,000", which reads as a threshold the applicant
 * has to clear. A floor is the same class of unsupported figure as a ceiling and
 * came from the same places: of the 16 rows that kept one, 15 have no
 * provenance for it at all and the sixteenth is a scraper's.
 *
 * It also suppressed the flag the same day's migration built.
 * derive_amount_undisclosed returns false the moment EITHER figure is present,
 * which is correct — "the funder publishes no per-grant figure" cannot be true
 * of a row publishing a floor — so only 4 of the 19 carried it.
 *
 * Same stamp and same ledger as the ceiling pass, so the two halves of one
 * decision stay in one file.
 *
 * NO ANTHROPIC CALL.
 */
export {}

import { htmlToText } from '../src/lib/page-text'
import { readFileSync, writeFileSync } from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const APPLY        = process.env.APPLY === '1'
const NOW          = process.env.RUN_AT ?? new Date().toISOString()
const SOURCE       = 'user_verified:amount-null-sweep-2026-08-30'
const REPORT       = 'reports/amount-nulls-2026-08-30.json'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** JRCT was handled on its own reasoning and is not in the no_figure bucket. */
const JRCT_TITLE = 'JRCT — Rights & Justice Programme'

type Ledger = {
  id: string; title: string; funder: string; klass: string
  readUrls?: string[]; sourceUrl: string
  before: { amount_min: number | null; amount_max: number | null; amount_source: string | null }
  floor?: unknown
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', 'Accept-Encoding': 'gzip, deflate' },
    redirect: 'follow', signal: AbortSignal.timeout(25000),
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  if (!/html/i.test(r.headers.get('content-type') ?? '')) throw new Error('non-html')
  return htmlToText(await r.text())
}

const compact = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/(\d)\s+(?=[\d,])/g, '$1').replace(/,\s+(?=\d)/g, ',')

async function main() {
  const report = JSON.parse(readFileSync(REPORT, 'utf8')) as { ledger: Ledger[]; ranAt: string; source: string }
  const targets = report.ledger.filter(l => l.klass === 'no_figure' || l.title === JRCT_TITLE)
  console.log(`rows whose page states no figure: ${targets.length}`)

  // Current floors, straight from the DB rather than from the ledger's
  // before-state, so a row someone has edited since is not silently reverted.
  const ids = targets.map(t => t.id)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/scraped_grants?select=id,funder,title,amount_min,amount_max,field_provenance&id=in.(${ids.join(',')})`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`rows ${res.status}: ${await res.text()}`)
  const live = new Map((await res.json() as {
    id: string; amount_min: number | null; amount_max: number | null
    field_provenance: Record<string, { source?: string }> | null
  }[]).map(r => [r.id, r]))

  const withFloor = targets.filter(t => (live.get(t.id)?.amount_min ?? null) !== null)
  console.log(`still carrying a floor: ${withFloor.length}\n`)

  let applied = 0
  for (const t of withFloor) {
    const row = live.get(t.id)!
    const urls = t.readUrls?.length ? t.readUrls : [t.sourceUrl]

    // Same standard the ceiling pass ended on: confirm against a live read
    // before removing a number a user can see.
    // Three attempts. The first dry run skipped Rayne, SSE and Camden on a
    // zero-character read and all three serve the page perfectly on a retry —
    // a transient failure is not evidence about the row.
    let text = ''
    for (const u of urls) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { text += ' ' + await fetchText(u); break } catch { /* retry */ }
      }
    }
    text = compact(text)
    const figures = text.match(/£\s?[\d][\d,]*(?:\s?(?:million|m|k))?/gi) ?? []

    const floorSrc = row.field_provenance?.['amount_min']?.source ?? null

    /**
     * JRCT is the one row allowed past the no-figures guard, and only because
     * a human established what its figure is.
     *
     * The page says "we are expecting to fund two to five new groups with
     * grants between £20,000-80,000 for 1-3 years", and that belongs to the
     * immigration detention and deportation round rather than the Rights &
     * Justice programme the row describes. So the page does carry a figure and
     * still publishes no floor for this programme. Named explicitly rather than
     * by widening the rule, because the rule is what protects the other 19.
     */
    const namedException = t.title === JRCT_TITLE && figures.length > 0

    if (text.trim().length < 600 || (figures.length > 0 && !namedException)) {
      console.log(`  SKIP ${t.funder}: read ${text.trim().length} chars, ${figures.length} figure(s)`)
      t.floor = { skipped: true, reason: `second read found ${figures.length} figure(s) in ${text.trim().length} chars` }
      continue
    }

    console.log(`  £${(row.amount_min ?? 0).toLocaleString('en-GB').padStart(9)}  ${t.funder.slice(0, 44)}  (was ${floorSrc ?? 'no provenance'})`)
    t.floor = {
      before: { amount_min: row.amount_min, amount_source: floorSrc },
      after: { amount_min: null },
      quote: namedException
        ? `jrct.org.uk/rights-and-justice read ${NOW.slice(0, 10)}. The page publishes no floor for `
          + `this programme. Its only figures, "grants between £20,000-80,000 for 1-3 years", belong `
          + `to the immigration detention and deportation round, not Rights & Justice. The £10,000 `
          + `floor came from ${floorSrc ?? 'no recorded source'} and is not on the page.`
        : `No £ figure anywhere in ${text.length} characters read from ${urls.join(' and ')}. `
          + `The floor came from ${floorSrc ?? 'a source that left no provenance'} and is the same `
          + `class of unsupported figure as the ceiling removed earlier the same day.`,
      applied: [] as string[],
    }

    if (!APPLY) continue
    const prov = { pinned: false, set_at: NOW, source: SOURCE,
                   citation: { confidence: 'high', snippet: (t.floor as { quote: string }).quote } }
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/scraped_grants?id=eq.${t.id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
                 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ amount_min: null,
                             field_provenance: { ...(row.field_provenance ?? {}), amount_min: prov } }),
    })
    if (!patch.ok) { console.log(`    FAILED ${patch.status} ${await patch.text()}`); continue }
    ;((t.floor as { applied: string[] }).applied).push('amount_min')
    applied++
  }

  console.log(`\n${APPLY ? `applied ${applied} floor nulls` : 'DRY RUN — nothing written. Set APPLY=1.'}`)

  writeFileSync(REPORT, JSON.stringify({
    ...report,
    floorPassRanAt: NOW,
    floorPassApplied: applied,
    floorPassNote: 'The ceiling pass left the floor on 16 of 20 rows. A floor on a page that '
      + 'states no figure is the same unsupported claim, reads as a threshold the applicant '
      + 'must clear, and suppressed amount_undisclosed on 15 rows because the trigger '
      + 'correctly refuses the flag while either figure is present.',
    ledger: report.ledger,
  }, null, 1))
  console.log(`ledger updated -> ${REPORT}`)
}

main().catch(e => { console.error(e); process.exit(1) })
