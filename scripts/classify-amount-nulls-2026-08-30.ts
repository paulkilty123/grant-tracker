/**
 * Classify the rows whose published maximum is not on the funder's page.
 *
 * Input: the unsupported list from scripts/amount-sweep-2026-08-29.ts.
 * Output: reports/amount-nulls-2026-08-30.json, and, with APPLY=1, the nulls
 * for the one bucket that needs no judgement.
 *
 * FOUR BUCKETS, per the 30 August brief:
 *
 *   no_figure      The page states no amount at all. Null the maximum.
 *   means_other    The page states a figure that is not a per-grant maximum —
 *                  a threshold to a different scheme, a pool across many
 *                  grants, an income limit. Null, and record what the figure
 *                  actually was so the row does not re-flag.
 *   needs_a_human  Everything else, including the case where the page states a
 *                  figure that LOOKS like a ceiling. See the note at that
 *                  branch: both instances in the first run were wrong, one of
 *                  them lifted out of a case study about a person.
 *   unreadable     The page did not come back. Never a null.
 *
 * Only `no_figure` is applied, and only with APPLY=1. The brief is explicit
 * that there is no blanket application across these rows, and every spot check
 * so far has justified that.
 *
 * NO ANTHROPIC CALL. Page fetches and pattern matching only.
 */
export {}

import { htmlToText } from '../src/lib/page-text'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PROXY        = process.env.READER_PROXY_URL
const PROXY_KEY    = process.env.READER_PROXY_KEY
const APPLY        = process.env.APPLY === '1'
const NOW          = process.env.RUN_AT ?? '2026-08-30T00:00:00.000Z'
const SOURCE       = 'user_verified:amount-null-sweep-2026-08-30'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** The figure is real but is not a per-grant ceiling. */
const MEANS_OTHER = [
  { klass: 'threshold', re: /\b(or above|or more|and above|above this|over this)\b[^.]{0,80}\b(guidance|scheme|programme|apply|application|major|large)\b/i },
  { klass: 'threshold', re: /\bif you (?:wish to |want to )?apply for (?:a )?(?:grant|award)s? of\b[^.]{0,60}\b(or above|or more)\b/i },
  { klass: 'pool',      re: /\b(awarded|distributed|gave|given|totalling|in total|across)\b[^.]{0,60}\b(\d+\s*)?(grants?|organisations|projects|awards)\b/i },
  { klass: 'pool',      re: /\bfund of\b|\bprogramme is worth\b|\btotal (?:fund|pot|budget)\b/i },
  { klass: 'income',    re: /\b(income|turnover|expenditure|reserves)\b[^.]{0,40}(under|below|less than|up to|exceeding|over|above)\b/i },
  { klass: 'project',   re: /\bproject costs?\b[^.]{0,40}(between|up to|under|below|over|above|more than|less than)\b/i },
]

/** The figure reads as a real per-applicant ceiling. */
const REAL_MAX = /\b(grants?|awards?|funding)\b[^.]{0,40}\b(of )?up to\b|\bup to\b[^.]{0,20}(per (?:grant|award|applicant|organisation|project))|\bmaximum (?:grant|award|of)\b|\bwe (?:offer|award|give|fund) (?:grants? of )?up to\b/i

type Unsupported = { row: {
  id: string; funder: string; title: string; apply_url: string
  amount_min: number | null; amount_max: number | null
  grant_sources: { url?: string }[] | null
  field_provenance?: Record<string, { source?: string }>
}; which: string }

async function fetchText(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', 'Accept-Encoding': 'gzip, deflate' },
      redirect: 'follow', signal: AbortSignal.timeout(25000),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    if (!/html/i.test(r.headers.get('content-type') ?? '')) throw new Error('non-html')
    return htmlToText(await r.text())
  } catch (e) {
    if (!PROXY) throw e
    const r = await fetch(`${PROXY}/${url}`, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text',
                 ...(PROXY_KEY ? { Authorization: `Bearer ${PROXY_KEY}` } : {}) },
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) throw new Error(`proxy HTTP ${r.status}`)
    const body = await r.text()
    // The reader proxy answers 200 with its own error text — "AuthenticationR-
    // equiredError: You have been blocked from performing anonymous queries" —
    // which would otherwise be scored as a page that mentions no amount.
    if (/^\s*(AuthenticationRequiredError|Error|Warning)[: ]/i.test(body) || body.trim().length < 200) {
      throw new Error(`proxy returned ${body.trim().slice(0, 60)}`)
    }
    return body
  }
}

const compact = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/(\d)\s+(?=[\d,])/g, '$1').replace(/,\s+(?=\d)/g, ',')

type Figure = { raw: string; value: number; context: string }

function figuresOn(text: string): Figure[] {
  const out: Figure[] = []
  const re = /£\s?([\d][\d,]*(?:\.\d+)?)(\s?(?:million|m|k))?\b/gi
  for (const m of Array.from(text.matchAll(re))) {
    let v = parseFloat(m[1].replace(/,/g, ''))
    const unit = (m[2] ?? '').trim().toLowerCase()
    if (unit === 'k') v *= 1_000
    if (unit === 'm' || unit === 'million') v *= 1_000_000
    if (!Number.isFinite(v)) continue
    const at = m.index ?? 0
    out.push({ raw: m[0].trim(), value: v, context: text.slice(Math.max(0, at - 130), at + 150).trim() })
  }
  return out
}

async function main() {
  const sweep = JSON.parse(readFileSync(process.env.SWEEP ?? 'amount-sweep2.json', 'utf8')) as
    { unsupported: Unsupported[] }
  // Only the rows missing the CEILING. The floor is out of scope per the brief.
  const rows = sweep.unsupported.filter(u => u.which.includes('max'))
  console.log(`classifying ${rows.length} rows whose maximum is not on the page\n`)

  const ledger: Record<string, unknown>[] = []

  for (const u of rows) {
    const r = u.row
    const urls = [r.apply_url, ...(r.grant_sources ?? []).map(s => s?.url).filter(Boolean) as string[]]
    let text = ''
    let reads = 0
    const failures: string[] = []
    // Which URLs actually contributed text, recorded per row.
    //
    // Camden Climate Fund was classified no_figure off 1,256 characters while
    // its apply_url returns 403 on every attempt — the text came from a
    // grant_sources page, and the ledger said `sourceUrl: apply_url`, naming a
    // page that contributed nothing. A null has to say which page justified it.
    const readUrls: string[] = []
    for (const url of urls) {
      try {
        const t = await fetchText(url)
        if (t.trim().length >= 200) { text += ' ' + t; reads++; readUrls.push(url) }
        else failures.push(`${url}: only ${t.trim().length} chars`)
      }
      catch (e) { failures.push(`${url}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    text = compact(text)

    const figs = figuresOn(text)
    let klass: string
    let quote: string
    let proposed: number | null = null

    /**
     * A page we could not read must never become a null.
     *
     * The first run classified Camden Giving as `no_figure`. Its page returns
     * HTTP 403 and 16 characters. "No figure found" and "no page found" are
     * different sentences and only one of them justifies removing a number a
     * user can see. 600 characters is above every 403 and cookie-wall body
     * seen in this sweep and well below the shortest real funder page in it
     * (Steel Charitable Trust, 1,944).
     */
    if (reads === 0 || text.trim().length < 600) {
      klass = 'unreadable'
      quote = `read ${text.trim().length} characters from ${reads} of ${urls.length} URLs`
        + (failures.length ? `; ${failures.join('; ').slice(0, 200)}` : '')
    } else if (figs.length === 0) {
      klass = 'no_figure'
      quote = `No £ figure anywhere in ${text.length} characters read from `
        + readUrls.join(' and ')
    } else {
      const other = MEANS_OTHER.map(p => ({ p, f: figs.find(f => p.re.test(f.context)) }))
                               .find(x => x.f)
      const real  = figs.filter(f => REAL_MAX.test(f.context))
                        .sort((a, b) => b.value - a.value)[0]
      if (real && !other) {
        /**
         * Recorded, never applied, and deliberately not its own bucket.
         *
         * Both instances in the first run were wrong. Wigan's £2,000 is one of
         * several investment pots, not this fund's ceiling. St Martin's £650
         * and £15 come from a case study — "she fled with just £15 to her
         * name". A regex cannot tell a funder's ceiling from a story about a
         * person, so the proposal goes to a human with the sentence attached.
         */
        klass = 'needs_a_human:page_states_a_figure'; proposed = real.value; quote = real.context
      } else if (other?.f) {
        klass = `means_other:${other.p.klass}`; quote = other.f.context
      } else {
        klass = 'needs_a_human'
        quote = figs.slice(0, 3).map(f => `${f.raw} — ${f.context.slice(0, 120)}`).join(' || ')
      }
    }

    console.log(`${klass.padEnd(22)} £${(r.amount_max ?? 0).toLocaleString('en-GB').padStart(10)}  ${r.funder.slice(0, 40)}`)
    ledger.push({
      id: r.id, title: r.title, funder: r.funder, klass,
      quote: quote.slice(0, 400),
      sourceUrl: r.apply_url,
      readUrls,
      unread: failures,
      before: { amount_min: r.amount_min, amount_max: r.amount_max,
                amount_source: r.field_provenance?.['amount_max']?.source ?? null },
      after: klass === 'no_figure' ? { amount_max: null } : null,
      pageFigure: proposed,
      applied: [] as string[],
    })
  }

  const byKlass = new Map<string, number>()
  for (const l of ledger) byKlass.set(String(l.klass), (byKlass.get(String(l.klass)) ?? 0) + 1)
  console.log('\n--- buckets ---')
  for (const [k, n] of Array.from(byKlass.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)

  if (APPLY) {
    /**
     * Confirm every null against a second, independent read before writing.
     *
     * Camden Climate Fund was classified no_figure off 1,256 characters, and
     * its apply_url then returned HTTP 403 on three consecutive attempts
     * minutes later. Whichever read was the fluke, a number a user can see
     * should not be removed on a page state that cannot be reproduced. A row
     * that disagrees with itself is left alone and reported.
     */
    const candidates = ledger.filter(l => l.klass === 'no_figure')
    const toNull: typeof candidates = []
    console.log(`\nre-reading ${candidates.length} pages to confirm before writing`)
    for (const l of candidates) {
      let text = ''
      for (const url of l.readUrls as string[]) {
        try { text += ' ' + await fetchText(url) } catch { /* counted below */ }
      }
      text = compact(text)
      const figs = figuresOn(text)
      if (text.trim().length >= 600 && figs.length === 0) { toNull.push(l); continue }
      l.klass = 'unconfirmed_on_second_read'
      l.after = null
      l.quote = `second read returned ${text.trim().length} characters and `
        + `${figs.length} figure(s); first read found none. Left alone.`
      console.log(`  NOT confirmed: ${l.funder}`)
    }
    console.log(`applying ${toNull.length} nulls of ${candidates.length} candidates`)
    for (const l of toNull) {
      const prov = {
        pinned: false, set_at: NOW, source: SOURCE,
        citation: { confidence: 'high', snippet: String(l.quote) },
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/scraped_grants?id=eq.${l.id}`, {
        method: 'PATCH',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
                   'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          amount_max: null,
          field_provenance: { ...(( (l.before as Record<string, unknown>) ?? {}) as object), amount_max: prov },
        }),
      })
      if (!res.ok) { console.log(`  FAILED ${l.funder}: ${res.status} ${await res.text()}`); continue }
      ;(l.applied as string[]).push('amount_max')
    }
  } else {
    console.log('\nDRY RUN — nothing written. Set APPLY=1 to null the no_figure bucket.')
  }

  mkdirSync('reports', { recursive: true })
  const path = 'reports/amount-nulls-2026-08-30.json'
  writeFileSync(path, JSON.stringify({
    ranAt: NOW, source: SOURCE,
    applied: ledger.filter(l => (l.applied as string[]).length > 0).length,
    note: 'Before-state for every row considered. amount_max has no dedicated source '
        + 'column, so this file is the only record of the figure that was removed.',
    ledger,
  }, null, 1))
  console.log(`\nwritten -> ${path}`)
}

main().catch(e => { console.error(e); process.exit(1) })
