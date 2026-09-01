// How long does a bot wall actually stay up?
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS FOR
//
// `HOST_BACKOFF_HOURS` starts at 1 hour and nothing measured justifies that
// number. What is known bounds the window from ABOVE and no more: 16 of 33
// walled rows read fine on a re-probe roughly two hours later, which says a wall
// often lifts inside two hours and says nothing about where inside it. The
// watchlist session's Wolfson case — one host lifting in about an hour and
// staying lifted — is a single transition, not a distribution.
//
// So the parallel session is reading seven walled hosts from production every 30
// minutes for 8 hours, into a JSONL file outside both session directories. This
// fits the answer.
//
// Deliberately re-runs `classifyPage` over each stored excerpt rather than
// trusting the labelling in the file. Two sessions labelling independently and
// agreeing is worth something; one session reading the other's conclusions is
// not.
//
//   npx tsx scripts/fit-wall-timing-2026-09-01.ts [path]
//
// Reads nothing but the file. Safe to run on a partial run: the `iter` field
// says how far it got, and a truncated tail only costs certainty about the long
// end of the distribution, which is where the ladder already doubles.

import { readFileSync, existsSync } from 'node:fs'
import { classifyPage, selfResolving, type UnreadableReason } from '../src/lib/verification/page-readable'
import { HOST_BACKOFF_HOURS } from '../src/lib/verification/host-backoff'

const FILE = process.argv[2] ?? '/private/tmp/claude-501/wall-timing-2026-09-01.jsonl'

type Row = {
  ts: string; iter: number; url: string
  ok?: boolean; chars?: number; via?: string; excerpt?: string
}

const hostOf = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? u

function main() {
  if (!existsSync(FILE)) { console.error(`no file at ${FILE}`); process.exit(1) }
  const rows = readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l) as Row } catch { return null } })
    .filter((r): r is Row => !!r && !!r.ts && !!r.url)

  if (rows.length === 0) {
    console.log('File is empty. The run writes one object per host per read; nothing yet.')
    return
  }

  const iters = rows.map(r => Number(r.iter)).filter(n => Number.isFinite(n))
  const hosts = new Set(rows.map(r => hostOf(r.url)))
  console.log(`${rows.length} reads, ${hosts.size} hosts, `
            + `iterations ${iters.length ? Math.min(...iters) : 0}..${iters.length ? Math.max(...iters) : 0} of 17\n`)

  // Classify here rather than reading their verdict. `ok:false` in the file is a
  // transport failure; everything else goes through our own detector.
  const judged = rows.map(r => {
    const v = r.ok === false ? { ok: false as const, reason: 'empty' as UnreadableReason, detail: 'fetch failed' }
                             : classifyPage(r.excerpt ?? '')
    return { ...r, host: hostOf(r.url), walled: !v.ok, reason: v.ok ? null : v.reason }
  }).sort((a, b) => a.ts.localeCompare(b.ts))

  const byHost = new Map<string, typeof judged>()
  for (const r of judged) {
    if (!byHost.has(r.host)) byHost.set(r.host, [])
    byHost.get(r.host)!.push(r)
  }

  const clears: { host: string; hours: number; from: UnreadableReason }[] = []
  const stillUp: { host: string; hours: number; reason: UnreadableReason }[] = []

  console.log('PER HOST')
  for (const [host, reads] of Array.from(byHost.entries()).sort()) {
    const strip = reads.map(r => (r.walled ? (r.reason === 'bot_wall' ? 'W' : 'x') : '.')).join('')
    const t0 = Date.parse(reads[0].ts)
    const span = (Date.parse(reads[reads.length - 1].ts) - t0) / 3_600_000

    // The transition we care about: walled at the start, readable later.
    const firstOpen = reads.find(r => !r.walled)
    if (reads[0].walled && firstOpen) {
      const hours = (Date.parse(firstOpen.ts) - t0) / 3_600_000
      clears.push({ host, hours, from: reads[0].reason! })
      console.log(`  ${host.padEnd(30)} ${strip}   cleared after ${hours.toFixed(1)}h`)
    } else if (reads[0].walled) {
      stillUp.push({ host, hours: span, reason: reads[0].reason! })
      console.log(`  ${host.padEnd(30)} ${strip}   still walled after ${span.toFixed(1)}h`)
    } else {
      console.log(`  ${host.padEnd(30)} ${strip}   readable throughout — not a wall, excluded`)
    }
  }
  console.log('\n  . readable   W bot wall   x other unreadable\n')

  // ── The fit ────────────────────────────────────────────────────────────────
  console.log('DISTRIBUTION OF TIME-TO-CLEAR')
  if (clears.length === 0) {
    console.log('  No host cleared during the run.')
    console.log(`  ${stillUp.length} were walled throughout, for at least `
              + `${stillUp.length ? Math.min(...stillUp.map(s => s.hours)).toFixed(1) : '0'}h.`)
    console.log('\n  READ THIS AS CENSORED DATA, NOT AS "WALLS DO NOT LIFT". A run that')
    console.log('  observes no transition bounds the window from BELOW and says nothing')
    console.log('  about the first rung — which is the same shape of non-answer the 16-of-33')
    console.log('  figure gives from the other side.')
    return
  }

  const sorted = clears.map(c => c.hours).sort((a, b) => a - b)
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  console.log(`  n = ${sorted.length} cleared, ${stillUp.length} still walled at the end (censored)`)
  console.log(`  median ${pct(0.5).toFixed(1)}h   p25 ${pct(0.25).toFixed(1)}h   p75 ${pct(0.75).toFixed(1)}h`)
  console.log(`  range  ${sorted[0].toFixed(1)}h to ${sorted[sorted.length - 1].toFixed(1)}h`)

  console.log('\nWHAT EACH CANDIDATE FIRST RUNG WOULD HAVE COST')
  console.log('  rung   wasted retries   rows left waiting past their clear')
  for (const rung of [0.5, 1, 2, 3, 6, ...HOST_BACKOFF_HOURS.slice(0, 3)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)) {
    // A retry before the wall lifts is wasted; a rung longer than the clear
    // leaves the row unverified for the difference.
    const wasted = sorted.filter(h => h > rung).length
    const late   = sorted.filter(h => h < rung).length
    console.log(`  ${String(rung).padStart(4)}h  ${String(wasted).padStart(14)}   ${String(late).padStart(32)}`)
  }
  console.log('\n  Wasted retries cost one fetch pair each. A row left waiting costs')
  console.log('  a day of the catalogue asserting something nobody has checked, so the')
  console.log('  two are not symmetric and the rung should sit BELOW the median.')

  const suggested = HOST_BACKOFF_HOURS.find(h => h >= pct(0.25)) ?? HOST_BACKOFF_HOURS[0]
  console.log(`\n  On this data the first rung wants to be around p25 = ${pct(0.25).toFixed(1)}h.`)
  console.log(`  Current first rung: ${HOST_BACKOFF_HOURS[0]}h.`)
  console.log(`  ${suggested === HOST_BACKOFF_HOURS[0] ? 'No change indicated.' : `Consider ${suggested}h.`}`)

  const byReason: Record<string, number[]> = {}
  for (const c of clears) (byReason[c.from] ??= []).push(c.hours)
  console.log('\nBY REASON (does a wall behave differently from a thin read?)')
  for (const [reason, hs] of Object.entries(byReason)) {
    const m = hs.slice().sort((a, b) => a - b)[Math.floor(hs.length / 2)]
    console.log(`  ${reason.padEnd(20)} n=${String(hs.length).padStart(2)}  median ${m.toFixed(1)}h  `
              + `${selfResolving(reason as UnreadableReason) ? '(self-resolving)' : '(NOT self-resolving — a clear here is a surprise worth reading)'}`)
  }
}
main()
