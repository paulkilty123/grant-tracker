// The 51 live rows the engine flagged `fixable_link: wrong_fund` — fetched and
// characterised, so the decision rests on the page rather than on the URL's looks.
//
// WHY NOT JUST TRUST THE FLAG. Every pile this fortnight has shrunk on being read:
// 38 link corrections became 7 became 1; seven cycle suspects became two; nine
// contradicted rolling rows became six. The flag says the engine could not find
// our fund on the page, which is real evidence, but it was produced by one read
// of one page and some of those reads are weeks old.
//
// WHY NOT JUDGE BY THE URL. Ranking the first twelve URL corrections by how the
// URL LOOKED got three backwards: `/faqs-for-applicants/` answered timing and
// eligibility while `/topics-and-guidance/accelerated-growth-programme`, which
// looks exactly right, answered neither. So this fetches the page.
//
// THE TEST IS THE SENTENCE ABOUT THE USER: could a fundraiser landing here apply?
// Not "does the page mention the fund". So each page is scored on whether it
// carries application detail — a deadline, an eligibility statement, an amount,
// an apply route — as well as on whether our fund's words appear at all.
//
// COSTS NOTHING. Plain HTTP, no model call. The reader proxy is used only where a
// direct fetch is refused, which is the documented behaviour for the ~16 hosts
// behind a WAF.
//
//   npx tsx --env-file=.env.local scripts/probe-wrong-fund-links-2026-08-21.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { readStamp, PAGE_READ_KEY } from '../src/lib/field-evidence'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
import { writeFileSync } from 'fs'

const TODAY = '2026-08-21'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
const PROXY = process.env.READER_PROXY_URL ?? ''

const STOP = new Set(['the','and','for','fund','grant','grants','programme','program','trust','foundation','of','a','to','in','community','charitable','scheme','support','project','projects'])

async function fetchAll(db: any) {
  const out: any[] = []
  for (let from = 0; ; from += 900) {
    const { data, error } = await db.from('scraped_grants').select('*').range(from, from + 899)
    if (error) throw new Error(error.message); out.push(...(data ?? [])); if (!data || data.length < 900) break
  }
  return out
}

function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

/**
 * Direct first, reader proxy only as a fallback.
 *
 * The first run of this probe reported 11 sites as unfetchable and they were
 * nothing of the kind: READER_PROXY_URL is `https://r.jina.ai` with no trailing
 * slash, and `${PROXY}${encodeURIComponent(url)}` built `https://r.jina.aihttps%3A...`,
 * which `fetch` rejects as unparseable. Every one of those 11 rows then read as
 * "0 chars, no detail" — a probe failure wearing the costume of a finding, which
 * is the exact shape this repo has been burned by before. The direct result is
 * now kept separately so a proxy failure can never masquerade as a dead page.
 */
async function grab(url: string): Promise<{ status: number; text: string; via: string; final: string }> {
  let status = 0, body = '', final = url, directErr = ''
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 25000)
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' }, redirect: 'follow', signal: ac.signal })
    clearTimeout(t)
    status = r.status; final = r.url; body = await r.text()
    if (r.ok && body.length > 500) return { status, text: textOf(body), via: 'direct', final }
  } catch (e: any) { directErr = String(e.message).slice(0, 24) }

  if (PROXY) {
    try {
      const ac2 = new AbortController(); const t2 = setTimeout(() => ac2.abort(), 40000)
      // r.jina.ai takes the target RAW after a slash, not percent-encoded.
      const p = await fetch(`${PROXY.replace(/\/$/, '')}/${url}`, { headers: { 'Accept': 'text/plain' }, signal: ac2.signal })
      clearTimeout(t2)
      if (p.ok) {
        const t = await p.text()
        if (t.length > 200) return { status: status || p.status, text: textOf(t), via: 'proxy', final }
      }
      return { status, text: textOf(body), via: `proxy-${p.status}`, final }
    } catch (e: any) {
      return { status, text: textOf(body), via: `proxyerr:${String(e.message).slice(0, 18)}`, final }
    }
  }
  return { status, text: textOf(body), via: directErr ? `direct-err:${directErr}` : 'direct', final }
}

/** Could a fundraiser landing here APPLY? Detail, not mention. */
function applicationDetail(t: string): string[] {
  const hits: string[] = []
  if (/\b(deadline|closing date|clos(?:es|ing)\s+(?:on|at)|apply by|applications? (?:close|open))\b/i.test(t)) hits.push('dates')
  if (/\b(who can apply|eligib|you must be|open to|we fund|we do not fund|exclusions?)\b/i.test(t)) hits.push('eligibility')
  if (/£\s?[\d,]{3,}/.test(t)) hits.push('amount')
  if (/\b(apply now|application form|start your application|how to apply|make an application)\b/i.test(t)) hits.push('apply-route')
  return hits
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const live = (await fetchAll(db)).filter(r => r.is_active === true)
  const flagged = live.filter(r => gateDecision(r as ReviewRow, deriveReviewReasons(r as ReviewRow, TODAY))
    .blocking.some(b => b.code === 'page_describes_different_fund'))
  console.log(`flagged rows: ${flagged.length}\n`)

  const out: any[] = []
  const QUEUE = [...flagged]
  const workers = Array.from({ length: 5 }, async () => {
    while (QUEUE.length) {
      const r = QUEUE.shift()!
      const { status, text, via, final } = await grab(String(r.apply_url))
      const lower = text.toLowerCase()
      const words = String(r.title).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w))
      const hit   = words.filter(w => lower.includes(w))
      const funder = String(r.funder ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w))
      const fHit  = funder.filter(w => lower.includes(w))
      const stamp = readStamp(r.field_evidence as never, PAGE_READ_KEY)
      out.push({
        title: r.title, url: r.apply_url, final, status, via, len: text.length,
        titleWords: words.length, titleHits: hit.length, hitWords: hit.slice(0, 4),
        funderHit: funder.length ? `${fHit.length}/${funder.length}` : 'n/a',
        detail: applicationDetail(text),
        closed: /\b(currently closed|no longer|not currently (?:open|accepting)|now closed|applications are closed)\b/i.test(text),
        readAt: stamp?.checked_at?.slice(0, 10) ?? '?',
      })
      process.stdout.write('.')
    }
  })
  await Promise.all(workers)
  console.log('\n')

  out.sort((a, b) => (b.titleHits / Math.max(1, b.titleWords)) - (a.titleHits / Math.max(1, a.titleWords)))
  for (const o of out) {
    const share = o.titleWords ? `${o.titleHits}/${o.titleWords}` : '0/0'
    console.log(`${String(o.title).slice(0, 42).padEnd(44)} ${String(o.status).padStart(3)} ${o.via.padEnd(7)} title ${share.padEnd(6)} funder ${String(o.funderHit).padEnd(5)} ${o.detail.join('+') || 'NO-DETAIL'}${o.closed ? ' CLOSED-CUE' : ''}`)
    console.log(`    ${String(o.url).slice(0, 100)}   (read ${o.readAt}, ${o.len} chars)`)
  }
  writeFileSync('reports/wrong-fund-links-2026-08-21.json', JSON.stringify(out, null, 2))
  console.log(`\nwritten: reports/wrong-fund-links-2026-08-21.json`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
