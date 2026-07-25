// Re-read every queue row whose funder page could not be read, then re-tag it.
//
//   npx tsx scripts/bulk-reread-unreadable.ts                 # dry run
//   npx tsx scripts/bulk-reread-unreadable.ts --apply         # run the chain
//   npx tsx scripts/bulk-reread-unreadable.ts --apply --limit 5
//
// 42 of 128 queue rows carry page_unreadable or no_brief. Those cannot be judged
// by a human at all: every value on them was written from the model's memory
// rather than from the funder's page, so "approve" would ship invented figures
// and "reject" would throw away a real fund. The only sane move is to read the
// page again, and that needs no judgement to start — which makes it the one
// genuinely bulk-able quarter of the queue.
//
// ── WHY THIS RUNS AGAINST LOCALHOST, NOT PRODUCTION ──
// The chain is enrich -> classify, and the classify fix (evidence required to
// REMOVE an eligibility structure) is committed but NOT deployed. Pointing this
// at production would run the OLD classifier, which narrows on silence, and
// would undo the 24-row restore on exactly the rows it just touched.
//
// So: start `npx next dev -p 3100` and let this call it. Localhost runs the
// working tree. Set BASE to the production origin only once the fix is live.
//
// Auth is the ADMIN_SECRET bearer token, which both routes accept
// (isAdminBearerToken in src/lib/auth/require-admin.ts) — no browser session
// needed.
//
// ── PROBE BEFORE SPENDING AN LLM CALL ──
// A first pass over all 42 showed the "unreadable" cluster is three different
// problems, not one:
//
//   19  fetch fine (200, real content) — the stored brief is just stale, from a
//       run when the fetch happened to fail. Re-reading genuinely fixes these.
//   18  HTTP 403 — bot-walled (Arts Council, Groundwork, camden.gov.uk and
//       friends). Re-reading CANNOT work: enrich-grant fails the fetch and
//       writes another knowledge_fallback brief from memory. That costs a real
//       LLM call to make no progress, and re-derives tags from memory rather
//       than from the page.
//    4  HTTP 404 — malformed apply_url with a duplicated path segment
//       (.../grants-and-support/groups/grants-and-support/groups/...), a
//       relative-link resolution bug in the scraper. All four resolve once the
//       repeat is stripped, so the URL is repaired first and the row then joins
//       the fetchable set.
//
// So each row is probed before it is enriched. Skipping the 403s is not giving
// up on them — it is refusing to report "42 re-read" when 18 of them silently
// went nowhere.
//
// ── SEQUENTIAL, DELIBERATELY ──
// Each row is one page fetch plus two LLM calls. Running these in parallel would
// hammer the Anthropic API and make a partial failure impossible to reason
// about. 42 rows at roughly a minute each is a background job, not an
// interactive one.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const BASE = process.env.REREAD_BASE ?? 'http://localhost:3100'
const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']
const COLS = [
  'id', 'title', 'funder', 'apply_url', 'is_active', 'pipeline_state',
  'url_status', 'url_quality_score', 'location_tag',
  'amount_min', 'amount_max', 'deadline', 'is_rolling', 'next_open_date', 'deadline_cycle',
  'eligible_structures', 'impact_sectors', 'target_beneficiaries',
  'funder_brief', 'field_provenance', 'raw_data', 'needs_intervention_reason',
].join(', ')

const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.ADMIN_SECRET}` }

async function post(path: string, body: unknown, timeoutMs: number) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST', headers: auth, body: JSON.stringify(body), signal: ctl.signal,
    })
    const json = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, json: json as Record<string, unknown> }
  } finally {
    clearTimeout(t)
  }
}

/** .../a/b/a/b/leaf -> .../a/b/leaf. Returns null when nothing repeats. */
function stripDuplicatedSegments(u: string): string | null {
  try {
    const url = new URL(u)
    const segs = url.pathname.split('/').filter(Boolean)
    for (let n = Math.floor(segs.length / 2); n >= 1; n--) {
      for (let i = 0; i + 2 * n <= segs.length; i++) {
        if (segs.slice(i, i + n).join('/') === segs.slice(i + n, i + 2 * n).join('/')) {
          const out = [...segs.slice(0, i + n), ...segs.slice(i + 2 * n)]
          url.pathname = '/' + out.join('/') + (u.endsWith('/') ? '/' : '')
          return url.toString()
        }
      }
    }
  } catch { /* not a URL we can reason about */ }
  return null
}

const PROBE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

/** Cheap HEAD-ish check so a bot wall costs a request, not an LLM call. */
async function probe(u: string): Promise<{ ok: boolean; why: string }> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), 15_000)
  try {
    const res = await fetch(u, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': PROBE_UA, Accept: 'text/html' } })
    if (!res.ok) return { ok: false, why: `HTTP ${res.status}${res.status === 403 ? ' (bot wall)' : ''}` }
    const body = await res.text()
    if (/just a moment|enable javascript|checking your browser/i.test(body)) return { ok: false, why: '200 but JS/bot wall' }
    if (body.length < 3000) return { ok: false, why: `200 but only ${body.length} bytes` }
    return { ok: true, why: 'ok' }
  } catch (e) {
    return { ok: false, why: `network error (${e instanceof Error ? e.message.slice(0, 30) : 'unknown'})` }
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const limArg = process.argv.indexOf('--limit')
  const limit = limArg > -1 ? Number(process.argv[limArg + 1]) : Infinity

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data, error } = await db
    .from('scraped_grants')
    .select(COLS)
    .in('pipeline_state', QUEUE_STATES)
    .not('saved_for_later', 'is', 'true')
    .limit(1000)
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  const rows = (data ?? []) as unknown as Array<ReviewRow & { title: string; funder: string | null; apply_url: string | null }>

  const targets = rows.filter(r => {
    const codes = deriveReviewReasons(r).map(x => x.code)
    return codes.includes('page_unreadable') || codes.includes('no_brief')
  })

  // A row with no apply_url has nothing to re-read. Re-reading it would fail 42
  // times over and look like a broken job rather than missing data.
  const withUrl = targets.filter(r => (r.apply_url ?? '').trim().length > 0)
  const noUrl   = targets.filter(r => (r.apply_url ?? '').trim().length === 0)

  console.log(`\nqueue: ${rows.length} rows`)
  console.log(`unreadable / no brief : ${targets.length}`)
  console.log(`  have a URL to re-read : ${withUrl.length}`)
  console.log(`  NO URL, cannot re-read: ${noUrl.length}`)
  for (const r of noUrl) console.log(`     ${(r.funder ?? '').slice(0, 30).padEnd(30)} ${r.title.slice(0, 44)}`)

  // ── Repair duplicated path segments ──
  // .../a/b/a/b/leaf/ is a relative-link resolution bug, not a dead fund. All
  // four affected rows resolve 200 once the repeat is removed.
  const repaired: Array<{ id: string; from: string; to: string }> = []
  for (const r of withUrl) {
    const fixed = stripDuplicatedSegments(r.apply_url!)
    if (fixed && fixed !== r.apply_url) repaired.push({ id: r.id, from: r.apply_url!, to: fixed })
  }
  if (repaired.length) {
    console.log(`\nmalformed URLs (duplicated path segment): ${repaired.length}`)
    for (const x of repaired) console.log(`  ${x.to}`)
    if (apply) {
      for (const x of repaired) {
        const { error: e } = await db.from('scraped_grants')
          .update({ apply_url: x.to, url_status: 'unchecked', url_last_checked: null })
          .eq('id', x.id)
        if (e) console.error(`  repair failed ${x.id}: ${e.message}`)
        else {
          const row = withUrl.find(w => w.id === x.id)
          if (row) row.apply_url = x.to
        }
      }
      console.log(`  repaired ${repaired.length}`)
    }
  }

  // ── Probe ──
  console.log('\nprobing URLs before spending LLM calls...')
  const fetchable: typeof withUrl = []
  const unfetchable: Array<{ r: typeof withUrl[0]; why: string }> = []
  for (let i = 0; i < withUrl.length; i += 6) {
    const slice = withUrl.slice(i, i + 6)
    const results = await Promise.all(slice.map(r => probe(r.apply_url!)))
    slice.forEach((r, j) => {
      const p = results[j]
      if (p.ok) fetchable.push(r)
      else unfetchable.push({ r, why: p.why })
    })
    process.stdout.write('.')
  }
  console.log('')
  const byWhy = new Map<string, number>()
  for (const u of unfetchable) byWhy.set(u.why, (byWhy.get(u.why) ?? 0) + 1)
  console.log(`  fetchable, worth re-reading : ${fetchable.length}`)
  console.log(`  NOT fetchable, skipped      : ${unfetchable.length}`)
  for (const [w, n] of Array.from(byWhy.entries()).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(3)}  ${w}`)

  const batch = fetchable.slice(0, limit)
  if (!apply) {
    console.log(`\nwould re-read ${batch.length} rows via ${BASE}`)
    for (const r of batch.slice(0, 10)) console.log(`  ${(r.funder ?? '').slice(0, 30).padEnd(30)} ${r.title.slice(0, 44)}`)
    if (batch.length > 10) console.log(`  ... and ${batch.length - 10} more`)
    console.log('\nDRY RUN — nothing written. Start `npx next dev -p 3100`, then re-run with --apply.\n')
    return
  }

  let enriched = 0, enrichFailed = 0, classified = 0, classifyFailed = 0
  const failures: string[] = []

  for (let i = 0; i < batch.length; i++) {
    const r = batch[i]
    const label = `${(r.funder ?? '').slice(0, 26).padEnd(26)} ${r.title.slice(0, 34)}`
    process.stdout.write(`[${String(i + 1).padStart(3)}/${batch.length}] ${label} ... `)

    const e = await post('/api/admin/enrich-grant', { grantId: r.id }, 180_000)
      .catch(err => ({ ok: false, status: 0, json: { error: String(err) } }))
    if (!e.ok) {
      enrichFailed++
      failures.push(`${label} — enrich: ${e.json.error ?? `HTTP ${e.status}`}`)
      console.log('enrich FAILED')
      continue
    }
    enriched++

    // preserve_empty: an empty array from the model is "no signal", not a
    // deliberate clear. Automated chains must never wipe good tags.
    const c = await post('/api/admin/classify-grants', {
      grant_ids: [r.id], include_review: true, force: true, preserve_empty: true,
    }, 180_000).catch(err => ({ ok: false, status: 0, json: { error: String(err) } }))
    if (!c.ok) {
      classifyFailed++
      failures.push(`${label} — classify: ${c.json.error ?? `HTTP ${c.status}`}`)
      console.log('enriched, classify FAILED')
      continue
    }
    classified++
    console.log('ok')
  }

  console.log(`\nenriched ${enriched} (${enrichFailed} failed), re-tagged ${classified} (${classifyFailed} failed)`)
  if (failures.length) {
    console.log('\nfailures:')
    for (const f of failures) console.log(`  ${f}`)
  }

  // Re-derive from fresh data. "It ran" is not the same as "it helped", and the
  // only honest measure is how many rows stopped being unreadable.
  const { data: after } = await db
    .from('scraped_grants').select(COLS)
    .in('pipeline_state', QUEUE_STATES).not('saved_for_later', 'is', 'true').limit(1000)
  const stillBad = ((after ?? []) as unknown as ReviewRow[]).filter(r => {
    const codes = deriveReviewReasons(r).map(x => x.code)
    return codes.includes('page_unreadable') || codes.includes('no_brief')
  })
  console.log(`\nunreadable rows: ${targets.length} -> ${stillBad.length}`)
  console.log(`queue: ${rows.length} -> ${(after ?? []).length}\n`)
}

main()
