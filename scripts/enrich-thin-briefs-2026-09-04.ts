// Enrich every live row whose brief needs it, 2026-09-04, at Paul's request
// after spotting the Army Benevolent Fund card looking thin.
//
// WHAT "NEEDS IT" MEANS HERE. `needsEnrichment()` in funder-brief.ts is the
// narrow test: no brief, a stub source, or no who_can_apply. That catches 12
// rows. It does not catch a brief that exists and is shallow, which is what
// Paul actually saw: the eight rows staged from the newsletter batch carry
// five hand-written fields and none of the depth ones. So the target set is
// the narrow test PLUS any live row missing exclusions, funder_tips or
// strong_application.
//
// THE CHECK THAT CAN FAIL. enrich-grant writes a `knowledge_fallback` brief
// when the fetch fails, and a guard added earlier today refuses that when the
// row already holds a `live_fetch` brief. The guard could not be forced from
// outside — three attempts on hosts that block us locally all fetched fine
// from Vercel's egress — so this run is its test: every brief's source is
// recorded before and compared after, and any live_fetch that comes back
// knowledge_fallback is a guard failure, printed loudly at the end.
//
//   npx tsx --env-file=.env.local scripts/enrich-thin-briefs-2026-09-04.ts [--apply] [--limit N]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { writeFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const LIMIT = Number(process.argv.find((_, i, a) => a[i - 1] === '--limit') ?? 0) || Infinity
const CONCURRENCY = 3
const BASE = 'https://www.shootsfunding.co.uk'
const SNAPSHOT = '/private/tmp/claude-501/-Users-paulkilty-dev-grant-tracker/3c36ea25-ae41-49d8-99e7-cceae9c714f6/scratchpad/brief-sources-before.json'

type Row = { id: string; title: string; source: string | null; reason: string }

function classify(b: Record<string, unknown> | null): string | null {
  if (!b) return 'no brief'
  const src = typeof b.source === 'string' ? b.source : ''
  if (src === 'knowledge_fallback' || src === 'desk_research') return `stub (${src})`
  if (!b.who_can_apply) return 'no who_can_apply'
  if (!b.exclusions || !b.funder_tips || !b.strong_application) return 'thin'
  return null
}

async function main() {
  const secret = process.env.ADMIN_SECRET
  if (!secret) throw new Error('ADMIN_SECRET not in env')
  const db = getAdminDb()

  const { data, error } = await db.from('scraped_grants')
    .select('id, title, funder_brief')
    .eq('is_active', true).eq('pipeline_state', 'published')
  if (error) throw new Error(error.message)

  const targets: Row[] = []
  for (const r of data ?? []) {
    const b = (r.funder_brief ?? null) as Record<string, unknown> | null
    const reason = classify(b)
    if (!reason) continue
    targets.push({ id: r.id, title: String(r.title), source: (b?.source as string) ?? null, reason })
  }
  const work = targets.slice(0, LIMIT === Infinity ? undefined : LIMIT)

  const counts = work.reduce<Record<string, number>>((a, r) => ({ ...a, [r.reason]: (a[r.reason] ?? 0) + 1 }), {})
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${work.length} of ${targets.length} rows`, counts)
  if (!APPLY) { work.slice(0, 10).forEach(r => console.log(`  ${r.reason.padEnd(20)} ${r.title.slice(0, 54)}`)); return }

  writeFileSync(SNAPSHOT, JSON.stringify(work, null, 1))
  console.log(`snapshot of ${work.length} brief sources written`)

  let done = 0, ok = 0, skipped = 0, failed = 0
  const queue = [...work]
  const runOne = async (r: Row) => {
    try {
      const res = await fetch(`${BASE}/api/admin/enrich-grant`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantId: r.id }),
      })
      const j = await res.json().catch(() => ({})) as { skipped?: string; error?: string }
      if (j.skipped) { skipped++; console.log(`  SKIPPED ${r.title.slice(0, 44)} (${j.skipped})`) }
      else if (!res.ok || j.error) { failed++; console.log(`  FAILED  ${r.title.slice(0, 44)} (${j.error ?? res.status})`) }
      else ok++
    } catch (e) {
      failed++; console.log(`  FAILED  ${r.title.slice(0, 44)} (${e instanceof Error ? e.message : String(e)})`)
    }
    done++
    if (done % 10 === 0) console.log(`  ... ${done}/${work.length}`)
  }
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) { const next = queue.shift(); if (!next) return; await runOne(next) }
  })
  await Promise.all(workers)
  console.log(`\nenriched ${ok}, skipped ${skipped}, failed ${failed}`)

  // The check. Any live_fetch that came back knowledge_fallback means the
  // guard did not hold, and the row lost a page-written brief.
  const { data: after } = await db.from('scraped_grants')
    .select('id, title, funder_brief').in('id', work.map(w => w.id))
  const byId = new Map(work.map(w => [w.id, w]))
  const downgraded = (after ?? []).filter(r => {
    const before = byId.get(r.id)?.source
    const now = (r.funder_brief as { source?: string } | null)?.source
    return before === 'live_fetch' && now === 'knowledge_fallback'
  })
  if (downgraded.length > 0) {
    console.log(`\nGUARD FAILED on ${downgraded.length} row(s) — a page-written brief was replaced from memory:`)
    downgraded.forEach(r => console.log(`  ${String(r.title).slice(0, 60)}  (${r.id})`))
    process.exit(1)
  }
  console.log('guard held: no live_fetch brief was replaced by a knowledge_fallback one')

  const still = (after ?? []).filter(r => classify((r.funder_brief ?? null) as Record<string, unknown> | null))
  console.log(`still short after the pass: ${still.length}`)
}
main().catch(e => { console.error(e); process.exit(1) })
