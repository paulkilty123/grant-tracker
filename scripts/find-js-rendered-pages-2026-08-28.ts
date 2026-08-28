/**
 * Find catalogue rows whose apply_url is a real, content-rich page that our
 * enricher nevertheless reads as almost empty.
 *
 * Cause: fetchPageText() strips tags with /<[^>]+>/g, which deletes everything
 * held INSIDE an attribute value. Sites that render from a JSON blob on the
 * element (tabs="[{...}]", cards="[...]") therefore yield only the footer.
 * Nothing fails: HTTP 200, url_status ok, source reads live_fetch.
 *
 * No Anthropic call. HTTP fetches only.
 */
export {}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Fingerprint thresholds. A page is "blind" when a large HTML body collapses to
// a trivial amount of text. Both halves matter: a genuinely short page is not a
// bug, and a long page that strips well is fine.
const MIN_HTML_BYTES   = 15000
const MAX_STRIPPED     = 1500

type Row = { id: string; title: string; funder: string; apply_url: string; pipeline_state: string }

function strip(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Characters sitting in long attribute values that parse as JSON — the copy
 *  the stripper throws away. This is what separates "attribute-rendered" from
 *  "genuinely thin page". */
function attributePayload(html: string): number {
  let total = 0
  for (const m of Array.from(html.matchAll(/\s[a-zA-Z_][a-zA-Z0-9_-]*="([^"]{200,})"/g))) {
    const raw = m[1]
      .replace(/&quot;/g, '"').replace(/&#x22;/g, '"')
      .replace(/&#x3A;/g, ':').replace(/&#x2C;/g, ',')
      .replace(/&#x5B;/g, '[').replace(/&#x5D;/g, ']')
      .replace(/&#x7B;/g, '{').replace(/&#x7D;/g, '}')
      .replace(/&#x5C;/g, '\\').replace(/&#x2F;/g, '/')
      .replace(/&#x20;/g, ' ').replace(/&amp;/g, '&')
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') total += raw.length
    } catch { /* not a JSON blob — ignore */ }
  }
  return total
}

async function fetchRows(): Promise<Row[]> {
  const out: Row[] = []
  for (let offset = 0; ; offset += 1000) {
    const url = `${SUPABASE_URL}/rest/v1/scraped_grants`
      + `?select=id,title,funder,apply_url,pipeline_state`
      + `&is_active=eq.true&apply_url=not.is.null`
      + `&order=id&limit=1000&offset=${offset}`
    const res = await fetch(url, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
    if (!res.ok) throw new Error(`rows ${res.status}: ${await res.text()}`)
    const page = await res.json() as Row[]
    out.push(...page)
    if (page.length < 1000) return out
  }
}

type Result = {
  row: Row
  status: number | null
  error?: string
  htmlBytes: number
  stripped: number
  attrPayload: number
  blind: boolean
}

async function probe(row: Row): Promise<Result> {
  const base = { row, htmlBytes: 0, stripped: 0, attrPayload: 0, blind: false }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(row.apply_url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
      },
    })
    if (!res.ok) return { ...base, status: res.status, error: `HTTP ${res.status}` }
    const ct = res.headers.get('content-type') ?? ''
    const html = await res.text()
    // PDFs and other non-HTML are a different problem; do not count them here.
    if (!/html/i.test(ct)) return { ...base, status: res.status, error: `non-html (${ct.split(';')[0]})` }
    const text = strip(html)
    const attr = attributePayload(html)
    return {
      row,
      status: res.status,
      htmlBytes: html.length,
      stripped: text.length,
      attrPayload: attr,
      blind: html.length > MIN_HTML_BYTES && text.length < MAX_STRIPPED,
    }
  } catch (err) {
    return { ...base, status: null, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const rows = await fetchRows()
  console.log(`live rows with an apply_url: ${rows.length}`)

  const results: Result[] = []
  const CONCURRENCY = 12
  let cursor = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < rows.length) {
      const i = cursor++
      results.push(await probe(rows[i]))
      if (results.length % 50 === 0) console.log(`  ...${results.length}/${rows.length}`)
    }
  }))

  console.log(`probed: ${results.length}`)   // must equal rows.length — see CLAUDE.md on zsh loops

  const ok      = results.filter(r => !r.error)
  const blind   = ok.filter(r => r.blind).sort((a, b) => b.attrPayload - a.attrPayload)
  const errored = results.filter(r => r.error)

  console.log(`\nfetched as HTML: ${ok.length}   errored/non-html: ${errored.length}`)
  console.log(`BLIND (>${MIN_HTML_BYTES} bytes of HTML, <${MAX_STRIPPED} chars of text): ${blind.length}\n`)

  for (const r of blind) {
    console.log(
      `${r.stripped.toString().padStart(5)} chars | html ${(r.htmlBytes / 1000).toFixed(0)}k`
      + ` | attr-json ${(r.attrPayload / 1000).toFixed(1)}k | ${r.row.funder} — ${r.row.title}`
    )
    console.log(`        ${r.row.apply_url}`)
  }

  const byError = new Map<string, number>()
  for (const r of errored) {
    const k = (r.error ?? '').replace(/\d+/g, 'N').slice(0, 40)
    byError.set(k, (byError.get(k) ?? 0) + 1)
  }
  console.log('\nerror classes (a separate problem, not counted above):')
  for (const [k, n] of Array.from(byError.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)}  ${k}`)

  const path = process.env.OUT ?? 'js-rendered-scan.json'
  await import('node:fs/promises').then(fs => fs.writeFile(path, JSON.stringify(results, null, 1)))
  console.log(`\nfull results -> ${path}`)
}

main().catch(e => { console.error(e); process.exit(1) })
