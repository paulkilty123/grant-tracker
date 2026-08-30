/**
 * Does the funder's own page actually say the grant amount we are showing?
 *
 * Scope: published, active rows whose amount_max was set by a scraper, a seed,
 * a directory listing or nothing at all — never by a read of the funder's page
 * and never by a human. 163 rows on 2026-08-29.
 *
 * NO ANTHROPIC CALL. Fetching a page costs nothing; only the model costs money.
 * The check is string matching: render the page with htmlToText and look for the
 * figure. That answers "is this number on the page" without asking anything to
 * interpret it, which is all that is needed to separate the rows worth a human
 * minute from the rows that are fine.
 *
 * WHY NOT STORED EVIDENCE. Because it is mostly not there. field_evidence is
 * non-empty on 162 of the 163, which is what made a free sweep look possible,
 * but only 56 carry an `amount_max` entry and only 43 of those carry a quote.
 * "Has evidence" and "has evidence about the amount" are different questions and
 * the first one flatters the second.
 *
 * PROPOSES ONLY. Writes nothing.
 */
export {}

import { htmlToText } from '../src/lib/page-text'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PROXY        = process.env.READER_PROXY_URL
const PROXY_KEY    = process.env.READER_PROXY_KEY
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type Row = {
  id: string; funder: string; title: string; apply_url: string
  amount_min: number | null; amount_max: number | null
  grant_sources: { url?: string }[] | null
}

/**
 * Every way a funder might write the figure.
 *
 * Deliberately generous: a false "found it" leaves a row alone, a false "not
 * found" costs a human a minute. The asymmetry favours generosity.
 */
function variants(n: number): string[] {
  const out = new Set<string>([String(n), n.toLocaleString('en-GB')])
  if (n % 1000 === 0) {
    const k = n / 1000
    out.add(`${k}k`); out.add(`${k}K`); out.add(`${k},000`)
  }
  if (n % 1_000_000 === 0) {
    const m = n / 1_000_000
    out.add(`${m}m`); out.add(`${m}M`); out.add(`${m} million`); out.add(`${m}million`)
  }
  if (n >= 1000 && n % 100 === 0 && n % 1000 !== 0) out.add((n / 1000).toFixed(1) + 'k')
  return Array.from(out)
}

/**
 * Whitespace inside a figure is the funder's, not a finding.
 *
 * Rewilding Britain writes "up to £ 100 , 000 per year" and appeared in the
 * first sweep's list purely because of it — the figure is right and its stored
 * evidence already quotes that sentence. Collapse spaces that sit between
 * digits, and between a digit and its thousands comma, before matching.
 */
function compactFigures(s: string): string {
  return s
    .replace(/(\d)\s+(?=[\d,])/g, '$1')
    .replace(/,\s+(?=\d)/g, ',')
}

function pageStates(text: string, n: number): string | null {
  const hay = compactFigures(text.replace(/\s+/g, ' '))
  for (const v of variants(n)) {
    const i = hay.toLowerCase().indexOf(v.toLowerCase())
    if (i < 0) continue
    // A bare digit run inside a longer number is not a match (500 in 500,000).
    const before = hay[i - 1] ?? ' '
    const after  = hay[i + v.length] ?? ' '
    if (/[\d,]/.test(before) || /\d/.test(after)) continue
    return hay.slice(Math.max(0, i - 90), i + 110).trim()
  }
  return null
}

async function fetchText(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', 'Accept-Encoding': 'gzip, deflate' },
      redirect: 'follow', signal: AbortSignal.timeout(25000),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const ct = r.headers.get('content-type') ?? ''
    if (!/html/i.test(ct)) throw new Error(`non-html (${ct.split(';')[0]})`)
    return htmlToText(await r.text())
  } catch (direct) {
    if (!PROXY) throw direct
    // Same escalation the enrich route uses; a bot-wall is not a finding.
    const r = await fetch(`${PROXY}/${url}`, {
      headers: { Accept: 'text/plain', 'X-Return-Format': 'text',
                 ...(PROXY_KEY ? { Authorization: `Bearer ${PROXY_KEY}` } : {}) },
      signal: AbortSignal.timeout(45000),
    })
    if (!r.ok) throw new Error(`direct ${direct instanceof Error ? direct.message : direct}; proxy HTTP ${r.status}`)
    return r.text()
  }
}

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/scraped_grants`
    + `?select=id,funder,title,apply_url,amount_min,amount_max,grant_sources,field_provenance`
    + `&is_active=eq.true&pipeline_state=eq.published&amount_max=not.is.null&limit=1000`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`rows ${res.status}: ${await res.text()}`)
  const all = await res.json() as (Row & { field_provenance?: Record<string, { source?: string }> })[]

  // The population: amount_max set by a scraper, a seed, a directory listing or
  // nothing — never by a read of the funder's page and never by a human.
  // Applied here rather than passed in, so the sweep is reproducible from the
  // script alone.
  const UNVERIFIED = new Set(['scraper', 'seed', 'discovery', 'system', 'none'])
  const target = all.filter(r => {
    // In-kind and free-support rows carry amount_max 0 deliberately — 13 live
    // rows on 2026-08-30. Zero is the funder's answer, not a missing figure,
    // and the first sweep flagged six of them for want of this line. Excluded
    // by rule rather than by naming the six, so new ones cannot creep back in.
    if (r.amount_max === 0) return false
    const src = r.field_provenance?.['amount_max']?.source ?? 'none'
    return UNVERIFIED.has(src.split(':')[0])
  })

  const ids: string[] = JSON.parse(process.env.IDS ?? '[]')
  const rows = ids.length ? all.filter(r => ids.includes(r.id)) : target
  console.log(`${all.length} published rows carry an amount; ${target.length} of them were never checked against the funder's page`)
  console.log(`sweeping ${rows.length} rows\n`)

  const supported: Row[] = []
  const unsupported: { row: Row; which: string; text: number }[] = []
  const unreadable: { row: Row; why: string }[] = []

  let done = 0
  const CONCURRENCY = 6           // gentle: these hosts were swept twice today
  let cursor = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++]
      const urls = [row.apply_url, ...(row.grant_sources ?? []).map(s => s?.url).filter(Boolean) as string[]]
      let text = ''
      let why = ''
      for (const u of urls) {
        try { text += ' ' + await fetchText(u) } catch (e) { why = e instanceof Error ? e.message : String(e) }
      }
      done++
      if (!text.trim()) { unreadable.push({ row, why: why || 'no text' }); continue }

      const maxHit = row.amount_max != null ? pageStates(text, row.amount_max) : null
      const minHit = row.amount_min != null && row.amount_min > 0 ? pageStates(text, row.amount_min) : 'n/a'
      if (maxHit && minHit) { supported.push(row); continue }
      const which = [
        maxHit ? null : `max ${row.amount_max?.toLocaleString('en-GB')}`,
        minHit ? null : `min ${row.amount_min?.toLocaleString('en-GB')}`,
      ].filter(Boolean).join(' and ')
      unsupported.push({ row, which, text: text.length })
      if (done % 25 === 0) console.log(`  ...${done}/${rows.length}`)
    }
  }))

  console.log(`\nswept: ${supported.length + unsupported.length + unreadable.length} of ${rows.length}`)
  console.log(`figure found on the funder's page: ${supported.length}`)
  console.log(`FIGURE NOT ON THE PAGE:            ${unsupported.length}`)
  console.log(`page unreadable (not a finding):   ${unreadable.length}`)

  console.log(`\n--- figure not on the page, largest first ---`)
  for (const u of unsupported.sort((a, b) => (b.row.amount_max ?? 0) - (a.row.amount_max ?? 0))) {
    console.log(`\n  ${u.row.funder} — ${u.row.title.slice(0, 60)}`)
    console.log(`    showing £${u.row.amount_min?.toLocaleString('en-GB') ?? '—'} to £${u.row.amount_max?.toLocaleString('en-GB')}   (${u.which} absent, read ${u.text} chars)`)
    console.log(`    ${u.row.apply_url}`)
  }

  console.log(`\n--- unreadable ---`)
  for (const u of unreadable) console.log(`  ${u.row.funder}: ${u.why}`)

  const out = process.env.OUT
  if (out) await import('node:fs/promises').then(fs => fs.writeFile(out,
    JSON.stringify({ supported: supported.map(r => r.id), unsupported, unreadable }, null, 1)))
}

main().catch(e => { console.error(e); process.exit(1) })
