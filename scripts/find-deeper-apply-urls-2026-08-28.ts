/**
 * For rows whose apply_url reads as a nav bar and a footer, find the page on
 * the same site that actually carries application detail.
 *
 * This is the half of the blind-page problem that reading harder cannot fix
 * (see src/lib/page-text.ts). Either the URL points at a thin homepage and the
 * detail is one click deeper, or it is an embedded form with nothing behind it.
 *
 * PROPOSES ONLY. It writes nothing. A wrong row in the queue costs a review; a
 * row that looks fixed costs a user, so anything that does not clear the floor
 * below is reported as "nothing clears" and left alone.
 *
 * No Anthropic call — link scoring is the repo's own candidateLinks(), and the
 * floor is keyword evidence quoted back so a human can check it.
 */
export {}

import { candidateLinks } from '../src/lib/verification/verify-row'
import { htmlToText } from '../src/lib/page-text'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/**
 * The floor. Not "the page mentions the fund" — that admits an FAQ, a news
 * item and a grants-awarded list. The question is whether a fundraiser landing
 * here could work out whether to apply and how.
 */
const SIGNALS: { name: string; re: RegExp }[] = [
  { name: 'who can apply', re: /\b(who can apply|eligib\w+|we fund|we do not fund|we don’t fund|exclusions?|registered charit\w+|constituted)\b/i },
  { name: 'amount',        re: /£\s?[\d,]{3,}/ },
  { name: 'how to apply',  re: /\b(how to apply|application form|apply online|complete the form|submit(ting)? (an|your) application|application process)\b/i },
  { name: 'timing',        re: /\b(deadline|closing date|closes on|rolling|year round|trustees? meet|application window|next round)\b/i },
]

/** Enough signals AND enough text. Either alone lets a brochure page through. */
const MIN_SIGNALS = 3
const MIN_TEXT    = 1200

type Row = { id: string; title: string; funder: string; apply_url: string }

async function get(url: string, timeoutMs = 20000): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', 'Accept-Encoding': 'gzip, deflate' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!/html/i.test(ct)) throw new Error(`non-html (${ct.split(';')[0]})`)
  return res.text()
}

function score(text: string) {
  const hit = SIGNALS.filter(s => s.re.test(text))
  const quotes = hit.map(s => {
    const m = s.re.exec(text)
    if (!m) return `${s.name}: ?`
    const at = Math.max(0, (m.index ?? 0) - 60)
    return `${s.name}: …${text.slice(at, at + 170).replace(/\s+/g, ' ').trim()}…`
  })
  return { n: hit.length, names: hit.map(s => s.name), quotes, len: text.length }
}

async function fetchRows(ids: string[]): Promise<Row[]> {
  const url = `${SUPABASE_URL}/rest/v1/scraped_grants`
    + `?select=id,title,funder,apply_url&id=in.(${ids.join(',')})`
  const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
  if (!res.ok) throw new Error(`rows ${res.status}: ${await res.text()}`)
  return res.json() as Promise<Row[]>
}

async function main() {
  const ids: string[] = JSON.parse(process.env.IDS ?? '[]')
  if (ids.length === 0) throw new Error('set IDS to a JSON array of row ids')
  const rows = await fetchRows(ids)
  console.log(`rows to examine: ${rows.length} (asked for ${ids.length})`)

  const proposals: { row: Row; url: string; signals: string[]; len: number; quotes: string[] }[] = []
  const nothing: { row: Row; why: string }[] = []

  for (const row of rows) {
    console.log(`\n===== ${row.funder} — ${row.title}`)
    console.log(`      now: ${row.apply_url}`)
    let source: string
    try { source = await get(row.apply_url) } catch (e) {
      const why = `apply_url unreadable: ${e instanceof Error ? e.message : String(e)}`
      console.log(`      ${why}`); nothing.push({ row, why }); continue
    }

    // Same link scoring production uses, asked for detail rather than funding
    // so eligibility and guidance pages outrank a generic /funding landing.
    const seen: string[] = []
    const links = [
      ...candidateLinks(source, row.apply_url, false, 'detail', seen),
      ...candidateLinks(source, row.apply_url, false, 'funding', seen),
    ]
    const unique = Array.from(new Set(links)).slice(0, 8)
    if (unique.length === 0) {
      console.log('      no candidate links on the page')
      nothing.push({ row, why: 'no candidate links' }); continue
    }

    const scored: { url: string; s: ReturnType<typeof score> }[] = []
    for (const link of unique) {
      try {
        const text = htmlToText(await get(link))
        const s = score(text)
        scored.push({ url: link, s })
        console.log(`      ${s.n}/4  ${s.len.toString().padStart(6)}  ${link}`)
      } catch (e) {
        console.log(`      ---   fetch failed  ${link}  (${e instanceof Error ? e.message : String(e)})`)
      }
    }

    const best = scored
      .filter(x => x.s.n >= MIN_SIGNALS && x.s.len >= MIN_TEXT)
      .sort((a, b) => b.s.n - a.s.n || b.s.len - a.s.len)[0]

    if (!best) {
      console.log('      NOTHING CLEARS THE FLOOR — leaving the row alone')
      nothing.push({ row, why: 'no candidate carried application detail' })
      continue
    }
    console.log(`      PROPOSE -> ${best.url}`)
    for (const q of best.s.quotes) console.log(`          ${q}`)
    proposals.push({ row, url: best.url, signals: best.s.names, len: best.s.len, quotes: best.s.quotes })
  }

  console.log(`\n\n########## SUMMARY`)
  console.log(`proposals: ${proposals.length}   nothing clears: ${nothing.length}   examined: ${rows.length}`)
  console.log(`\n--- proposed changes (NOT applied) ---`)
  for (const p of proposals) {
    console.log(`${p.row.funder}\n  from ${p.row.apply_url}\n  to   ${p.url}\n  signals: ${p.signals.join(', ')} | ${p.len} chars`)
  }
  console.log(`\n--- left alone ---`)
  for (const n of nothing) console.log(`${n.row.funder}: ${n.why}`)

  const out = process.env.OUT
  if (out) {
    await import('node:fs/promises').then(fs =>
      fs.writeFile(out, JSON.stringify({ proposals, nothing }, null, 1)))
    console.log(`\nwritten -> ${out}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
