// Fetch a page as text with a browser user agent. DIRECT ONLY — no reader
// proxy, no third party between the page and the quote.
//
// Written for docs/handoffs/programmes-cities-2026-09-08.md, whose rule 4 says
// node's fetch then the Chrome browser tools, and no third-party reader proxy.
// scripts/read-page-2026-08-18.ts falls back to one, which is why this exists
// rather than reusing it: a proxy-rendered page is not what a checker re-reading
// the URL sees, and that cost a citation on the holds job the same day.
//
//   npx tsx scripts/read-page-direct-2026-09-08.ts <url> [chars]
//
// Exit 0 readable, 2 bot wall, 1 fetch failed. READ ONLY.

const [, , url, charsArg] = process.argv
const LIMIT = Number(charsArg ?? 4000)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'

async function direct(u: string): Promise<string> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 25000)
  try {
    const res = await fetch(u, { signal: c.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally { clearTimeout(t) }
}

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&pound;/g, '£').replace(/&#163;/g, '£').replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Same contract as the 18 Aug reader: a bot wall is a SUCCESSFUL response
// containing prose, so neither status nor length can tell it from a real page.
function looksLikeBotWall(text: string): boolean {
  const t = text.slice(0, 1500).toLowerCase()
  return /performing security verification|verify you are (?:not a bot|human)|security service to protect against malicious bots|just a moment\.\.\.|enable javascript and cookies to continue|checking your browser|requiring captcha|access denied|cf-browser-verification|please wait while your request is being verified/.test(t)
}

async function main() {
  if (!url) { console.error('usage: read-page-direct <url> [chars]'); process.exit(1) }
  const text = strip(await direct(url))
  if (looksLikeBotWall(text)) {
    console.log(`── ${url}\n── BOT WALL: a security-verification page, not the provider's page. ${text.length} chars.`)
    console.log(text.slice(0, 400))
    process.exit(2)
  }
  console.log(`── ${url}\n── direct, ${text.length} chars\n`)
  console.log(text.slice(0, LIMIT))
}

main().catch(e => { console.error('FAILED:', (e as Error).message); process.exit(1) })

// Module scope, so this file's top-level names do not collide with the other
// standalone reader script under tsc's global-script rules.
export {}
