// Are the "dead" rows actually dead?
//
//   npx tsx scripts/audit-dead-never-checked.ts [sampleSize]
//
// 625 rows carry url_status='dead' and 564 of them have url_last_checked=null,
// meaning no validator ever ran against them. That is 35% of the catalogue
// hidden from users on a status nothing verified.
//
// Manchester City Council is the case that prompted this: marked dead, but its
// page returns HTTP 403 to automated fetches and loads perfectly in a browser.
// A 403 is a bot-wall, not a dead link, and treating the two the same buries
// live funders. There are known to be ~16 such hosts.
//
// Classifies rather than just counting, because the three outcomes need
// completely different responses:
//   ALIVE      200 — the row is recoverable now
//   BOT-WALLED 403/406/429 — the page is almost certainly fine; we cannot read it
//   DEAD       404/410 — correctly marked
//   UNREACHABLE DNS failure, timeout, connection reset — could be either
// Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

type Row = { id: string; funder: string | null; title: string | null; apply_url: string | null; pipeline_state: string }

async function probe(url: string): Promise<{ code: number; note: string }> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    })
    return { code: r.status, note: '' }
  } catch (e) {
    const msg = (e as Error).message ?? ''
    if (/ENOTFOUND|getaddrinfo/i.test(msg)) return { code: 0, note: 'DNS' }
    if (/timeout|abort/i.test(msg))         return { code: 0, note: 'timeout' }
    if (/ECONNRESET|socket/i.test(msg))     return { code: 0, note: 'reset' }
    return { code: 0, note: msg.slice(0, 40) }
  }
}

async function main() {
  const sample = parseInt(process.argv[2] ?? '60', 10)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, funder, title, apply_url, pipeline_state')
    .eq('url_status', 'dead')
    .is('url_last_checked', null)
    .not('apply_url', 'is', null)
    .limit(sample)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Row[]

  console.log(`\nprobing ${rows.length} rows marked dead that were never checked\n`)

  const buckets: Record<string, Row[]> = { ALIVE: [], 'BOT-WALLED': [], DEAD: [], UNREACHABLE: [] }
  const detail: string[] = []

  // Sequential with a small concurrency window — hammering funder sites from one
  // IP is how you get the whole catalogue bot-walled for real.
  const CONCURRENCY = 5
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(async r => ({ r, p: await probe(r.apply_url!) })))
    for (const { r, p } of results) {
      const bucket =
        p.code === 200 ? 'ALIVE'
        : [403, 406, 429].includes(p.code) ? 'BOT-WALLED'
        : [404, 410].includes(p.code) ? 'DEAD'
        : 'UNREACHABLE'
      buckets[bucket].push(r)
      detail.push(`${String(p.code || p.note).padEnd(8)} ${bucket.padEnd(12)} ${(r.funder ?? '').slice(0, 32).padEnd(32)} ${(r.title ?? '').slice(0, 40)}`)
    }
  }

  for (const d of detail) console.log(d)
  console.log(`\n${'─'.repeat(72)}`)
  for (const [k, v] of Object.entries(buckets)) {
    const pct = rows.length ? Math.round(100 * v.length / rows.length) : 0
    console.log(`${k.padEnd(12)} ${String(v.length).padStart(3)}  (${pct}%)`)
  }
  const recoverable = buckets.ALIVE.length + buckets['BOT-WALLED'].length
  console.log(`\nApparently recoverable: ${recoverable} of ${rows.length} sampled (${Math.round(100 * recoverable / rows.length)}%)`)
  console.log(`A 200 here means the URL resolves — NOT that the fund is open. Each still needs a content check before reactivation.`)
}

main().catch(e => { console.error(e); process.exit(1) })
