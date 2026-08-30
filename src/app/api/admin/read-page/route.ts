// Admin-only. Read a page the way the enrichment pipeline reads it, and return
// what it saw. No model call, so no spend.
//
// WHY THIS EXISTS
//
// Every existing route that reads a funder page also asks a model about it, so
// the only way to answer "what does this page actually say" was to buy an
// answer. That is the wrong shape twice over: it costs money to settle a
// question of fact, and it puts the model between the reader and the page.
//
// The immediate need, 2026-08-30: three rows in the amount sweep could not be
// confirmed because this machine's network is rate-limited by the funders'
// hosts and blocked by the reader proxy (HTTP 401, "bad network reputation").
// Production's egress is not, and was observed the same day recovering 3,209
// characters through the proxy after a direct 401. A page read is a property of
// the network you read it from, so the fix is to read from the network that
// works rather than to retry from the one that does not.
//
// Deliberately returns text and figures rather than a verdict. The caller is a
// person or a script deciding what a row should say; this only fetches.
//
// `excerpt` is capped and SAYS it is capped (`excerptChars`, `truncated`). Pass
// `contains: [...]` to test membership against the whole page instead of
// against the window — asking the excerpt a question about the page is how
// ekct.org.uk was reported as not belonging to the Ernest Kleinwort Trust.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isAdminBearerToken } from '@/lib/auth/require-admin'
import { htmlToText } from '@/lib/page-text'

export const dynamic     = 'force-dynamic'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

async function isAuthorised(req: NextRequest): Promise<boolean> {
  if (isAdminBearerToken(req.headers.get('authorization'))) return true
  return (await requireAdmin()).ok
}

async function readDirect(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
      // Never 'br': Node's fetch does not decompress Brotli and the bytes are
      // then processed as garbage HTML. Same reason as enrich-grant.
      'Accept-Encoding': 'gzip, deflate',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') ?? ''
  if (!/html/i.test(ct)) throw new Error(`non-html (${ct.split(';')[0]})`)
  return htmlToText(await res.text())
}

async function readViaProxy(url: string): Promise<string> {
  const base = process.env.READER_PROXY_URL
  if (!base) throw new Error('reader proxy not configured')
  const res = await fetch(`${base.replace(/\/$/, '')}/${url}`, {
    headers: {
      Accept: 'text/plain',
      'X-Return-Format': 'text',
      ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(45_000),
  })
  // A block is HTTP 401 with a 146-byte body, so !ok catches it. The body test
  // is for degenerate 200s, which have not been observed but cost nothing to
  // refuse — a short error string scored as page text manufactures a silence.
  if (!res.ok) throw new Error(`proxy HTTP ${res.status}`)
  const body = await res.text()
  if (/^\s*(AuthenticationRequiredError|Error|Warning)[: ]/i.test(body)) {
    throw new Error(`proxy returned ${body.trim().slice(0, 80)}`)
  }
  return body
}

/** Whitespace inside a figure is the funder's formatting, not a different number. */
const compact = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/(\d)\s+(?=[\d,])/g, '$1').replace(/,\s+(?=\d)/g, ',')

export async function POST(req: NextRequest) {
  if (!await isAuthorised(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { url, urls, contains } = await req.json() as
    { url?: string; urls?: string[]; contains?: string[] }
  const targets = (urls?.length ? urls : url ? [url] : []).filter(Boolean)
  if (targets.length === 0) return NextResponse.json({ error: 'url or urls required' }, { status: 400 })
  if (targets.length > 20)  return NextResponse.json({ error: 'at most 20 urls' }, { status: 400 })

  const results = await Promise.all(targets.map(async (target) => {
    if (!/^https?:\/\//i.test(target)) {
      return { url: target, ok: false, error: 'not an http(s) url' }
    }
    let text: string
    let via: 'direct' | 'proxy'
    let directError: string | null = null
    try {
      text = await readDirect(target); via = 'direct'
    } catch (e) {
      directError = e instanceof Error ? e.message : String(e)
      try { text = await readViaProxy(target); via = 'proxy' }
      catch (e2) {
        return { url: target, ok: false, directError,
                 proxyError: e2 instanceof Error ? e2.message : String(e2) }
      }
    }
    const flat = compact(text)
    /**
     * `(?![a-z])` is load-bearing: without it the unit alternation swallows the
     * first letter of the NEXT word. "£25,000 Multi year awards" parsed as
     * £25 billion, "£2,000 may be supported" as £2 billion, and a "£200 Maximum
     * Grant" line as £200 million. Found 2026-08-30 when a scan built on this
     * route reported four impossible ceilings; the bug was here, in the reader,
     * so every caller had it.
     */
    const figures = Array.from(new Set(flat.match(/£\s?[\d][\d,]*(?:\s?(?:million|m|k))?(?![a-z])/gi) ?? []))
      .map(f => {
        const at = flat.indexOf(f)
        return { figure: f.trim(), context: flat.slice(Math.max(0, at - 120), at + 160).trim() }
      })
    /**
     * `excerpt` is a WINDOW and callers have to be told so.
     *
     * A measurement on 2026-08-30 asked "does this page name the funder" of the
     * excerpt and reported ekct.org.uk/grants/ as not the Ernest Kleinwort
     * Trust's page. The page is 7,029 characters, the excerpt was the first
     * 4,000, and the name sits outside it. That is a bug in the reader's
     * contract, not a quirk of one caller: a field named `excerpt` that arrives
     * looking like the page will be used as the page.
     *
     * So the cut is now named — `excerptChars` and `truncated` — and `contains`
     * answers membership against the WHOLE text, which is the question callers
     * were using the excerpt to answer badly.
     */
    const EXCERPT_CHARS = 4000
    const found: Record<string, boolean> = {}
    for (const needle of contains ?? []) {
      if (typeof needle !== 'string' || !needle) continue
      found[needle] = flat.toLowerCase().includes(needle.toLowerCase())
    }
    return {
      url: target, ok: true, via, directError,
      chars: flat.length,
      figures,
      excerpt: flat.slice(0, EXCERPT_CHARS),
      excerptChars: Math.min(flat.length, EXCERPT_CHARS),
      truncated: flat.length > EXCERPT_CHARS,
      ...(contains?.length ? { found } : {}),
    }
  }))

  return NextResponse.json({ results })
}
