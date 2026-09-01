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
// ─────────────────────────────────────────────────────────────────────────────
// TWO PROPERTIES OF THE DATA THAT CHANGE THE ANSWER
//
// 1. THE INTERVALS ARE NOT UNIFORM. The run was killed and relaunched, so
//    iterations 1 and 2 are thirteen minutes apart and the rest are thirty.
//    `iter` is also not unique across a restart. So `ts` is the only key, and
//    spacing is READ, never inferred — assuming even spacing would mis-time a
//    transition in that first gap by six minutes, in the region the first
//    backoff rung is actually about.
//
// 2. A TRANSITION IS INTERVAL-CENSORED, NOT OBSERVED. A host walled at 17:49 and
//    readable at 18:02 lifted SOMEWHERE IN BETWEEN. Reporting 18:02 as the
//    clear time systematically overstates every measurement by up to one
//    interval, which on a 30-minute cadence is half the size of the thing being
//    measured. So each clear is reported as a BRACKET, and the summary gives
//    both bounds rather than a false point.
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

  // Each clear is a BRACKET: `lo` is the last time we saw it walled, `hi` the
  // first time we saw it open. The truth is somewhere between.
  const clears: { host: string; lo: number; hi: number; from: UnreadableReason }[] = []
  const stillUp: { host: string; hours: number; reason: UnreadableReason }[] = []

  // The cadence is a property of the run, not of the design, so it is measured.
  const stamps = Array.from(new Set(judged.map(r => r.ts))).sort()
  const gaps = stamps.slice(1).map((t, i) => (Date.parse(t) - Date.parse(stamps[i])) / 60_000)
  if (gaps.length) {
    console.log(`OBSERVED CADENCE  ${gaps.map(g => `${g.toFixed(0)}m`).join('  ')}`)
    const uneven = Math.max(...gaps) - Math.min(...gaps) > 2
    if (uneven) console.log('  Uneven, as expected after a restart. Spacing is read from ts, never from iter.\n')
    else console.log('')
  }

  console.log('PER HOST')
  for (const [host, reads] of Array.from(byHost.entries()).sort()) {
    const strip = reads.map(r => (r.walled ? (r.reason === 'bot_wall' ? 'W' : 'x') : '.')).join('')
    const t0 = Date.parse(reads[0].ts)
    const span = (Date.parse(reads[reads.length - 1].ts) - t0) / 3_600_000

    // The transition we care about: walled at the start, readable later.
    const openIdx = reads.findIndex(r => !r.walled)
    if (reads[0].walled && openIdx > 0) {
      const hi = (Date.parse(reads[openIdx].ts) - t0) / 3_600_000
      const lo = (Date.parse(reads[openIdx - 1].ts) - t0) / 3_600_000
      clears.push({ host, lo, hi, from: reads[0].reason! })
      console.log(`  ${host.padEnd(30)} ${strip}   cleared between ${lo.toFixed(2)}h and ${hi.toFixed(2)}h`)
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

  // Reported at BOTH bounds, because the difference between them is the
  // measurement's resolution and quoting a single number hides it.
  const los = clears.map(c => c.lo).sort((a, b) => a - b)
  const his = clears.map(c => c.hi).sort((a, b) => a - b)
  const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]
  console.log(`  n = ${clears.length} cleared, ${stillUp.length} still walled at the end (right-censored)`)
  console.log(`  earliest it could have been:  median ${pct(los, 0.5).toFixed(2)}h  p25 ${pct(los, 0.25).toFixed(2)}h`)
  console.log(`  latest it could have been:    median ${pct(his, 0.5).toFixed(2)}h  p25 ${pct(his, 0.25).toFixed(2)}h`)
  console.log(`  widest bracket in the set:    ${Math.max(...clears.map(c => c.hi - c.lo)).toFixed(2)}h`)

  console.log('\nWHAT EACH CANDIDATE FIRST RUNG WOULD HAVE COST')
  console.log('  rung   wasted retries   rows left waiting   bracket straddles')
  for (const rung of [0.5, 1, 2, 3, 6, ...HOST_BACKOFF_HOURS.slice(0, 3)].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)) {
    // Counted against the bounds a clear could NOT have fallen outside, so a
    // host whose bracket straddles the rung is reported as unknown rather than
    // silently assigned to whichever side flatters the number.
    const wasted  = clears.filter(c => c.lo > rung).length
    const late    = clears.filter(c => c.hi < rung).length
    const straddle = clears.length - wasted - late
    console.log(`  ${String(rung).padStart(4)}h  ${String(wasted).padStart(14)}   ${String(late).padStart(24)}   ${String(straddle).padStart(9)}`)
  }
  console.log('\n  Wasted retries cost one fetch pair each. A row left waiting costs')
  console.log('  a day of the catalogue asserting something nobody has checked, so the')
  console.log('  two are not symmetric and the rung should sit BELOW the median.')

  const suggested = HOST_BACKOFF_HOURS.find(h => h >= pct(los, 0.25)) ?? HOST_BACKOFF_HOURS[0]
  console.log(`\n  On this data the first rung wants to be at or below the p25 of the`)
  console.log(`  EARLIEST bound, ${pct(los, 0.25).toFixed(2)}h — the conservative end, because a rung set`)
  console.log(`  from the latest bound would be too patient by up to one interval.`)
  console.log(`  Current first rung: ${HOST_BACKOFF_HOURS[0]}h.`)
  console.log(`  ${suggested === HOST_BACKOFF_HOURS[0] ? 'No change indicated.' : `Consider ${suggested}h.`}`)

  const byReason: Record<string, number[]> = {}
  for (const c of clears) (byReason[c.from] ??= []).push(c.hi)
  console.log('\nBY REASON (does a wall behave differently from a thin read?)')
  for (const [reason, hs] of Object.entries(byReason)) {
    const m = hs.slice().sort((a, b) => a - b)[Math.floor(hs.length / 2)]
    console.log(`  ${reason.padEnd(20)} n=${String(hs.length).padStart(2)}  median ${m.toFixed(1)}h  `
              + `${selfResolving(reason as UnreadableReason) ? '(self-resolving)' : '(NOT self-resolving — a clear here is a surprise worth reading)'}`)
  }
}
main()
