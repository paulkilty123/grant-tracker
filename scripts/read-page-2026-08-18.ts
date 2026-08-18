// Fetch a funder page as text, direct first and via the reader proxy on failure.
// Mirrors the fallback in src/app/api/admin/enrich-grant/route.ts so that what
// this prints is what the enrichment path would see.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/read-page-2026-08-18.ts <url> [chars]
//
// READ ONLY. Prints to stdout; the proxy key stays in the environment.
const [, , url, charsArg] = process.argv
const LIMIT = Number(charsArg ?? 4000)

async function direct(u: string): Promise<string> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 20000)
  try {
    const res = await fetch(u, {
      signal: c.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally { clearTimeout(t) }
}

async function viaProxy(u: string): Promise<string> {
  const base = process.env.READER_PROXY_URL
  if (!base) throw new Error('READER_PROXY_URL not configured')
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 45000)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/${u}`, {
      signal: c.signal,
      headers: {
        Accept: 'text/plain',
        ...(process.env.READER_PROXY_KEY ? { Authorization: `Bearer ${process.env.READER_PROXY_KEY}` } : {}),
      },
    })
    if (!res.ok) throw new Error(`reader proxy HTTP ${res.status}`)
    return await res.text()
  } finally { clearTimeout(t) }
}

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&pound;/g, '£').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  if (!url) { console.error('usage: read-page <url> [chars]'); process.exit(1) }
  let text = ''
  let how = 'direct'
  try {
    text = strip(await direct(url))
    if (text.length < 200) throw new Error(`only ${text.length} chars of text`)
  } catch (e) {
    how = `proxy (direct failed: ${(e as Error).message})`
    text = strip(await viaProxy(url))
  }
  console.log(`── ${url}\n── via ${how}, ${text.length} chars\n`)
  console.log(text.slice(0, LIMIT))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
