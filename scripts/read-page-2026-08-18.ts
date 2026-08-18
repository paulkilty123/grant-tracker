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

/**
 * A bot-check page is a SUCCESSFUL response containing prose, so neither the
 * status code nor the length can tell it from a funder's page. artscouncil.org.uk
 * returns 491 characters of "Performing security verification" through the reader
 * proxy — comfortably past any length threshold, and it would have been handed to
 * a judgement step as page content.
 *
 * Checked against content, not size, for that reason. Erring toward false alarms
 * on purpose: a page wrongly called walled gets left flagged for a human, while a
 * CAPTCHA wrongly called readable becomes a verdict about a fund from a page that
 * never described it.
 */
function looksLikeBotWall(text: string): boolean {
  const t = text.slice(0, 1500).toLowerCase()
  return /performing security verification|verify you are (?:not a bot|human)|security service to protect against malicious bots|just a moment\.\.\.|enable javascript and cookies to continue|checking your browser|requiring captcha|access denied|cf-browser-verification/.test(t)
}

async function main() {
  if (!url) { console.error('usage: read-page <url> [chars]'); process.exit(1) }
  let text = ''
  let how = 'direct'
  try {
    text = strip(await direct(url))
    if (text.length < 200) throw new Error(`only ${text.length} chars of text`)
    if (looksLikeBotWall(text)) throw new Error('bot wall')
  } catch (e) {
    how = `proxy (direct failed: ${(e as Error).message})`
    text = strip(await viaProxy(url))
  }
  if (looksLikeBotWall(text)) {
    console.log(`── ${url}\n── BOT WALL: ${how} returned a security-verification page, not the funder's page.`)
    console.log(`── ${text.length} chars. Do NOT judge this fund from the text below.\n`)
    console.log(text.slice(0, 600))
    process.exit(2)
  }
  console.log(`── ${url}\n── via ${how}, ${text.length} chars\n`)
  console.log(text.slice(0, LIMIT))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
