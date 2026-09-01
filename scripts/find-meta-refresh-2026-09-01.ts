// Which catalogue rows point at a page that has MOVED?
//
// We follow HTTP 3xx and not meta refresh, so a `<meta http-equiv="refresh">`
// stub gets read, extracted and judged as though it were the funder's page. It
// is not: it is a forwarding note, and the destination is in the tag.
//
// The watchlist session found five council entries like this on 2026-09-01, all
// reporting healthy, all fingerprinting the stub in perpetuity. sheffield.gov.uk
// /grants is 446 bytes; the real page behind it is 162,199.
//
// This is the only unreadable reason that comes with its own fix, so the output
// is a list of proposed URL corrections rather than a list of problems.
//
// READ ONLY. Fetches raw HTML directly, because the signal is a meta tag and
// text extraction destroys it.
//
//   npx tsx --env-file=.env.local scripts/find-meta-refresh-2026-09-01.ts

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { classifyPage } from '../src/lib/verification/page-readable'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** htmlToText's job, in miniature. Enough to tell a stub from a page. */
const strip = (html: string) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rows: Record<string, unknown>[] = []
  for (let f = 0; f < 6000; f += 500) {
    const { data } = await db.from('scraped_grants')
      .select('id, title, funder, apply_url, is_active, pipeline_state')
      .not('pipeline_state', 'in', '("rejected","archived")').order('id').range(f, f + 499)
    rows.push(...(data ?? [])); if ((data ?? []).length < 500) break
  }
  const targets = rows.filter(r => /^https?:\/\//i.test(String(r.apply_url ?? '')))
  console.log(`${targets.length} rows with a web apply_url. Fetching raw HTML...\n`)

  const found: { row: Record<string, unknown>; to: string }[] = []
  let checked = 0, unreachable = 0
  const LIMIT = 8
  let i = 0
  async function worker() {
    while (i < targets.length) {
      const r = targets[i++]
      const url = String(r.apply_url)
      try {
        const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000),
          headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Encoding': 'gzip, deflate' } })
        if (!res.ok) { unreachable++; continue }
        if (!/html/i.test(res.headers.get('content-type') ?? '')) { unreachable++; continue }
        const html = await res.text()
        const v = classifyPage(strip(html), html)
        if (!v.ok && v.reason === 'meta_refresh') {
          const to = v.detail.replace(/^the page redirects to /, '').replace(/ via a meta refresh.*$/, '')
          found.push({ row: r, to })
        }
      } catch { unreachable++ }
      checked++
      if (checked % 100 === 0) console.error(`  ${checked}/${targets.length}`)
    }
  }
  await Promise.all(Array.from({ length: LIMIT }, worker))

  console.log(`\nchecked ${checked}, unreachable from this machine ${unreachable}`)
  console.log(`\nROWS POINTING AT A META-REFRESH STUB: ${found.length}\n`)
  for (const f of found) {
    const base = new URL(String(f.row.apply_url))
    let abs = f.to
    try { abs = new URL(f.to, base).toString() } catch { /* leave relative */ }
    console.log(`  ${f.row.is_active ? 'LIVE' : 'hid '} ${String(f.row.funder ?? '').slice(0, 26).padEnd(26)} ${String(f.row.title ?? '').slice(0, 34)}`)
    console.log(`       from ${f.row.apply_url}`)
    console.log(`       to   ${abs}`)
  }
  if (!found.length) {
    console.log('  None. Note this machine is blocked by some funder hosts, so a')
    console.log('  clean result here is weaker evidence than the same sweep from production.')
  }
}
main()
