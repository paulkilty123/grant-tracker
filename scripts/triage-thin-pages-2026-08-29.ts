/**
 * Triage the rows whose apply_url reads as a nav bar and a footer.
 *
 * WHY THIS IS NOT A RENDERING PROBLEM
 *
 * The obvious theory was that these pages render client-side and a browser
 * would recover them. Measured on 2026-08-29 against the reader proxy, which
 * does execute JavaScript: it returned MORE text than a direct fetch on 1 of
 * 16, and that one only because the host 403s a direct read. On the other 15 it
 * returned the same nav bar and footer, slightly shorter. The text is not
 * hidden. It is not there.
 *
 * So the question is what these pages actually are, and reading them gives four
 * answers, none of which a renderer fixes:
 *
 *   deeper   the site does publish detail, one click on from a thin front door
 *   closed   the programme has closed and the row is still marked live
 *   index    the URL lists several distinct funds; the row is a compound
 *   thin     the funder genuinely publishes almost nothing
 *
 * Link discovery here is deliberately dumber than verify-row's candidateLinks()
 * — every same-site link with its anchor text, scored on the text as well as
 * the path. candidateLinks reported "no candidate links" for Kelly Family
 * Charitable Trust, whose nav plainly offers "Application Criteria" and "How to
 * apply", so on this population it was the wrong instrument.
 *
 * PROPOSES ONLY. Writes nothing. No Anthropic call.
 */
export {}

import { htmlToText } from '../src/lib/page-text'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const SIGNALS: { name: string; re: RegExp }[] = [
  { name: 'who',    re: /\b(who can apply|eligib\w+|we fund|we do not fund|we don’t fund|exclusions?|registered charit\w+|constituted)\b/i },
  { name: 'amount', re: /£\s?[\d,]{3,}/ },
  { name: 'apply',  re: /\b(how to apply|application form|apply online|complete the form|application process|apply in writing)\b/i },
  { name: 'timing', re: /\b(deadline|closing date|closes on|rolling|year round|trustees? meet|application window|next round)\b/i },
]

/**
 * The programme is shut, whatever the row says.
 *
 * The looser first version of this matched "Open in new window" in a cookie
 * banner and declared the Charity Commission register closed. Every alternative
 * now names closure explicitly, and the caller additionally requires funding
 * words nearby, because "closed" on a funder's site is as likely to be about an
 * office at Christmas as about a programme.
 */
const CLOSED = /\b(currently closed|now closed|is closed|closed for applications|closed to applications|not (?:currently )?accepting applications|applications? (?:are|is) (?:now )?closed|no longer accepting|(?:re)?opens? (?:again )?(?:in|on)\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|20\d\d))\b/i

/** Closure has to be about the money, not the office. */
const CLOSED_CONTEXT = /\b(applications?|grants?|programmes?|funds?|funding|round)\b/i

/** The page lists several distinct funds rather than describing one. */
const INDEX_HINT = /\b(our trusts|the trusts|current programmes|our (?:funds|programmes)|funding programmes)\b/i

const WANTED_TEXT = /\b(apply|application|eligib|criteria|guidelines?|guidance|what we fund|who we fund|funding|grants?)\b/i
const NOISE_TEXT  = /\b(news|blog|privacy|cookie|terms|contact|about|careers|jobs|login|donate|shop|press|media|accessibility|sitemap|recipients|awarded|case stud|annual report|trustees)\b/i

type Row = { id: string; title: string; funder: string; apply_url: string; pipeline_state: string }
type Verdict = 'deeper' | 'closed' | 'index' | 'thin'

async function get(url: string): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', 'Accept-Encoding': 'gzip, deflate' },
    redirect: 'follow', signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!/html/i.test(ct)) throw new Error(`non-html (${ct.split(';')[0]})`)
  return { html: await res.text(), finalUrl: res.url }
}

function score(text: string) {
  const hit = SIGNALS.filter(s => s.re.test(text))
  return { n: hit.length, names: hit.map(s => s.name) }
}

function sameSite(a: string, b: string): boolean {
  try {
    const strip = (h: string) => h.replace(/^www\./, '')
    return strip(new URL(a).hostname) === strip(new URL(b).hostname)
  } catch { return false }
}

/** Every same-site link, ranked on anchor text first and path second. */
function links(html: string, base: string): { url: string; label: string }[] {
  const out = new Map<string, { url: string; label: string; score: number }>()
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi
  for (const m of Array.from(html.matchAll(re))) {
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    let abs: string
    try { abs = new URL(m[1], base).toString().replace(/#.*$/, '') } catch { continue }
    if (!sameSite(abs, base)) continue
    if (abs.replace(/\/$/, '') === base.replace(/\/$/, '')) continue
    if (/\.(pdf|docx?|xlsx?|zip|jpe?g|png)$/i.test(abs)) continue
    const hay = `${label} ${abs}`
    if (!WANTED_TEXT.test(hay)) continue
    let s = 0
    if (/\b(how to apply|application|apply)\b/i.test(label)) s += 3
    if (/\b(criteria|eligib|guidelines?|guidance|what we fund|who we fund)\b/i.test(label)) s += 3
    if (WANTED_TEXT.test(abs)) s += 1
    if (NOISE_TEXT.test(label)) s -= 3
    if (s <= 0) continue
    const prev = out.get(abs)
    if (!prev || prev.score < s) out.set(abs, { url: abs, label, score: s })
  }
  return Array.from(out.values()).sort((a, b) => b.score - a.score).slice(0, 6)
}

async function fetchRows(ids: string[]): Promise<Row[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/scraped_grants?select=id,title,funder,apply_url,pipeline_state&id=in.(${ids.join(',')})`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`rows ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Row[]>
}

async function main() {
  const ids: string[] = JSON.parse(process.env.IDS ?? '[]')
  if (ids.length === 0) throw new Error('set IDS to a JSON array of row ids')
  const rows = await fetchRows(ids)
  console.log(`examining ${rows.length} rows (asked for ${ids.length})\n`)

  const results: { row: Row; verdict: Verdict; detail: string; url?: string }[] = []

  for (const row of rows) {
    console.log(`===== ${row.funder} — ${row.title}`)
    console.log(`      ${row.apply_url}   [${row.pipeline_state}]`)
    let page: { html: string; finalUrl: string }
    try { page = await get(row.apply_url) } catch (e) {
      const detail = `apply_url unreadable: ${e instanceof Error ? e.message : String(e)}`
      console.log(`      ${detail}`)
      results.push({ row, verdict: 'thin', detail }); continue
    }
    const text = htmlToText(page.html)

    const closedHit = CLOSED.exec(text)
    const closedNear = closedHit
      ? text.slice(Math.max(0, (closedHit.index ?? 0) - 120), (closedHit.index ?? 0) + 120)
      : ''
    if (closedHit && CLOSED_CONTEXT.test(closedNear)) {
      const at = Math.max(0, (closedHit.index ?? 0) - 90)
      const detail = text.slice(at, at + 240).replace(/\s+/g, ' ').trim()
      console.log(`      CLOSED — …${detail}…`)
      results.push({ row, verdict: 'closed', detail }); continue
    }

    const candidates = links(page.html, page.finalUrl)
    let best: { url: string; label: string; n: number; names: string[]; len: number } | null = null
    for (const c of candidates) {
      try {
        const t = htmlToText((await get(c.url)).html)
        const s = score(t)
        console.log(`      ${s.n}/4  ${t.length.toString().padStart(6)}  ${c.label.slice(0, 34).padEnd(34)} ${c.url}`)
        const clears = (s.n >= 3 && t.length >= 900) || (s.n >= 2 && t.length >= 4000)
        if (clears && (!best || s.n > best.n || (s.n === best.n && t.length > best.len))) {
          best = { url: c.url, label: c.label, n: s.n, names: s.names, len: t.length }
        }
      } catch (e) {
        console.log(`      ---   fetch failed  ${c.url}  (${e instanceof Error ? e.message : String(e)})`)
      }
    }

    if (best) {
      console.log(`      DEEPER -> ${best.url}  (${best.names.join(', ')})`)
      results.push({ row, verdict: 'deeper', detail: `${best.names.join(', ')} | ${best.len} chars`, url: best.url })
      continue
    }
    if (INDEX_HINT.test(text) && candidates.length >= 3) {
      console.log(`      INDEX — the URL lists several funds, so the row is a compound`)
      results.push({ row, verdict: 'index', detail: `${candidates.length} sibling fund links` }); continue
    }
    console.log(`      THIN — the funder publishes almost nothing here`)
    results.push({ row, verdict: 'thin', detail: `${text.length} chars, ${score(text).n}/4 signals` })
  }

  console.log('\n\n########## SUMMARY')
  for (const v of ['deeper', 'closed', 'index', 'thin'] as Verdict[]) {
    const sel = results.filter(r => r.verdict === v)
    console.log(`\n--- ${v} (${sel.length})`)
    for (const r of sel) {
      console.log(`  ${r.row.funder}${r.url ? `\n     -> ${r.url}` : ''}\n     ${r.detail.slice(0, 200)}`)
    }
  }
  const out = process.env.OUT
  if (out) {
    await import('node:fs/promises').then(fs => fs.writeFile(out, JSON.stringify(results, null, 1)))
    console.log(`\nwritten -> ${out}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
