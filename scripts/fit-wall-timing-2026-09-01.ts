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
// A synthetic file in the real run's shape lives at
// /private/tmp/claude-501/wall-timing-SYNTHETIC.jsonl — two cadence regimes,
// five hosts that clear and two that do not. It is what caught the excerpt-cap
// defect below, before the real data existed to catch it with.
//
// Reads nothing but the file. Safe to run on a partial run: the `iter` field
// says how far it got, and a truncated tail only costs certainty about the long
// end of the distribution, which is where the ladder already doubles.

import { readFileSync, existsSync } from 'node:fs'
import { classifyPage, selfResolving, type UnreadableReason } from '../src/lib/verification/page-readable'
import { HOST_BACKOFF_HOURS } from '../src/lib/verification/host-backoff'

/**
 * One or more JSONL files, concatenated.
 *
 * The collection is deliberately more than one process: adding a host to a
 * running series would be a discontinuity in it, whereas a parallel process
 * writing its own file is none — and two processes appending to one descriptor
 * over eight hours is a corruption risk worth avoiding. So coop.co.uk, the
 * second Imperva host, runs beside the main seven at the same cadence and lands
 * in its own file.
 *
 * Defaults to every wall-timing file in the shared directory, so a reader does
 * not have to know how many there are.
 */
const DEFAULT_FILES = [
  '/private/tmp/claude-501/wall-timing-2026-09-01.jsonl',
  '/private/tmp/claude-501/wall-timing-2026-09-01-imperva2.jsonl',
]
const FILES = process.argv.slice(2).filter(a => !a.startsWith('-'))
const SOURCES = FILES.length ? FILES : DEFAULT_FILES

type Row = {
  ts: string; iter: number; url: string
  ok?: boolean; chars?: number; via?: string; excerpt?: string
}

const hostOf = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? u

/**
 * Which PRODUCT served this interstitial.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE UNIT OF ANALYSIS IS THE VENDOR, NOT THE HOST
 *
 * Raised by the watchlist session, and it is a sharper objection than the small-n
 * caution it replaces. Of the seven hosts in the run, FOUR serve a byte-similar
 * Cloudflare managed challenge. If a block duration is a policy rather than a
 * random draw — and WAF timeouts usually are — those four clear together and
 * contribute four CORRELATED observations that a pooled percentile reads as four
 * independent ones. The result then looks far more precise than it is.
 *
 * My own verification sample has the same shape and is no better: 10 distinct
 * walled hosts across 4 vendors, 6 of them on the one Cloudflare product.
 *
 * So the interesting question is not "what is the p25 over hosts" but "does a
 * vendor have a timeout". If the four clear within one interval of each other,
 * that is worth more than any percentile: it means the rung should be set from
 * the vendor's policy, and the answer generalises to every walled host we ever
 * meet rather than to these seven.
 */
function productOf(text: string): { vendor: string; product: string } {
  const t = (text ?? '').toLowerCase()
  // ── Imperva. TWO PRODUCTS, ONE VENDOR, AND THE DISTINCTION NEARLY BROKE THE
  //    EXPERIMENT. Barnet answers "Request unsuccessful. Incapsula incident ID";
  //    coop.co.uk answers "Pardon Our Interruption", which is Distil, acquired
  //    by Imperva in 2019. Keyed on the phrase alone they landed in separate
  //    buckets, so the simultaneity test would never have compared them — and
  //    comparing that pair is the entire reason the second host was added.
  //
  //    Not collapsed either, because they were separate products with separate
  //    block logic and may still be. So: grouped by VENDOR for the policy test,
  //    with the PRODUCT kept visible so a reader can see they are different
  //    challenges rather than assume one implementation.
  if (t.includes('incapsula') || t.includes('request unsuccessful')) return { vendor: 'Imperva', product: 'Incapsula' }
  if (t.includes('pardon our interruption')
   || t.includes('made us think you were a bot'))                    return { vendor: 'Imperva', product: 'Distil' }
  // ── Cloudflare. Four challenge types, one policy engine.
  if (t.includes('performing security verification')
   || t.includes('security service to protect'))                     return { vendor: 'Cloudflare', product: 'managed challenge' }
  if (t.includes('enable javascript and cookies'))                   return { vendor: 'Cloudflare', product: 'JS challenge' }
  if (t.includes('confirm you are human')
   || t.includes('complete the security check'))                     return { vendor: 'Cloudflare', product: 'Turnstile' }
  if (t.includes('just a moment'))                                   return { vendor: 'Cloudflare', product: 'IUAM' }
  if (t.includes('attention required'))                              return { vendor: 'Cloudflare', product: 'block page' }
  return { vendor: 'unclassified', product: 'unclassified' }
}

const vendorOf = (text: string) => productOf(text).vendor

function main() {
  const present = SOURCES.filter(f => existsSync(f))
  if (present.length === 0) { console.error(`no file at ${SOURCES.join(' or ')}`); process.exit(1) }
  for (const f of SOURCES) {
    if (!existsSync(f)) console.log(`(not present, skipped: ${f})`)
  }
  const rows = present.flatMap(f =>
    readFileSync(f, 'utf8').split('\n').filter(Boolean)
      .map(l => { try { return JSON.parse(l) as Row } catch { return null } })
      .filter((r): r is Row => !!r && !!r.ts && !!r.url))
  console.log(`sources: ${present.length} file(s)`)

  if (rows.length === 0) {
    console.log('File is empty. The run writes one object per host per read; nothing yet.')
    return
  }

  const iters = rows.map(r => Number(r.iter)).filter(n => Number.isFinite(n))
  const hosts = new Set(rows.map(r => hostOf(r.url)))
  // Rounds, not `iter`, and no hardcoded total. The run has been re-planned once
  // already (17 rounds at 30 minutes became ~29 across two regimes) and `iter`
  // is not unique across a restart, so both are read from the data.
  const rounds = new Set(rows.map(r => r.ts)).size
  console.log(`${rows.length} reads, ${hosts.size} hosts, ${rounds} rounds\n`)

  // Classify here rather than reading their verdict. `ok:false` in the file is a
  // transport failure; everything else goes through our own detector.
  //
  // ───────────────────────────────────────────────────────────────────────────
  // THE LENGTH FLOOR MUST NOT BE APPLIED TO A TRUNCATED EXCERPT.
  //
  // The collector stores `excerpt` capped at 400 characters, and
  // MIN_USEFUL_CHARS is 400. So a perfectly readable funder page arrives here
  // as exactly 400 characters, trims to 399 if the cut lands on a space, and
  // classifies as `too_short` — a wall that is entirely OUR truncation.
  //
  // Caught on a synthetic run before the real data landed, and it would have
  // been near-invisible in it: every host would have read as walled for all 29
  // rounds, the fitter would have reported "no host cleared", and that is
  // exactly what a genuinely stubborn set of walls looks like. An eight-hour
  // measurement would have produced a confident, wrong, unfalsifiable zero.
  //
  // The file also stores `chars`, which is the length of the WHOLE page. That is
  // the honest input to a length test, so the floor is answered from it and the
  // excerpt is used only for the signature tests it can actually support.
  const EXCERPT_CAP = 400
  const judged = rows.map(r => {
    const text = r.excerpt ?? ''
    const truncated = text.length >= EXCERPT_CAP
    let v = r.ok === false
      ? { ok: false as const, reason: 'empty' as UnreadableReason, detail: 'fetch failed' }
      : classifyPage(text)
    // A `too_short` verdict on a truncated excerpt is about the excerpt, not the
    // page. The full length decides it.
    if (!v.ok && v.reason === 'too_short' && truncated && (r.chars ?? 0) >= EXCERPT_CAP) {
      v = { ok: true as const, text } as never
    }
    return { ...r, host: hostOf(r.url), walled: !v.ok, reason: v.ok ? null : v.reason }
  }).sort((a, b) => a.ts.localeCompare(b.ts))

  // Say so, loudly, if the collector's cap is at or below our floor. This is a
  // property of the DATA that silently inverts the result, so it must not be
  // something a reader has to know to look for.
  const capped = rows.filter(r => (r.excerpt ?? '').length >= EXCERPT_CAP).length
  if (capped > 0) {
    console.log(`NOTE  ${capped} of ${rows.length} excerpts are at the ${EXCERPT_CAP}-char cap, which equals`)
    console.log(`      MIN_USEFUL_CHARS. The length floor is answered from the stored \`chars\`,`)
    console.log(`      not the excerpt, or every readable page would read as too_short.\n`)
  }

  const byHost = new Map<string, typeof judged>()
  for (const r of judged) {
    if (!byHost.has(r.host)) byHost.set(r.host, [])
    byHost.get(r.host)!.push(r)
  }

  // Each clear is a BRACKET: `lo` is the last time we saw it walled, `hi` the
  // first time we saw it open. The truth is somewhere between.
  const clears: { host: string; lo: number; hi: number; from: UnreadableReason; vendor: string; product: string }[] = []
  const stillUp: { host: string; hours: number; reason: UnreadableReason }[] = []

  // The cadence is a property of the run, not of the design, so it is measured.
  // PER HOST, not across the file. Two collectors write to two files a couple of
  // minutes apart, so the union of their timestamps alternates 8m/2m and reads
  // as jitter that is not in either series. Brackets were never affected —
  // those are computed from one host's own consecutive reads — but a cadence
  // line nobody can interpret is worse than none.
  const cadenceOf = (host: string) => {
    const ts = Array.from(new Set((byHost.get(host) ?? []).map(r => r.ts))).sort()
    return ts.slice(1).map((t, i) => (Date.parse(t) - Date.parse(ts[i])) / 60_000)
  }
  const anyHost = Array.from(byHost.keys()).sort()[0]
  const gaps = anyHost ? cadenceOf(anyHost) : []
  if (gaps.length) {
    console.log(`OBSERVED CADENCE (${anyHost})  ${gaps.map(g => `${g.toFixed(0)}m`).join('  ')}`)
    const uneven = Math.max(...gaps) - Math.min(...gaps) > 2
    console.log(uneven
      ? '  Uneven, as expected after a restart. Spacing is read from ts, never from iter.\n'
      : '')
  }

  // Vendor first, because it is the unit that decides whether the observations
  // below are independent.
  const vendors = new Map<string, string[]>()
  for (const [host, reads] of Array.from(byHost.entries())) {
    const v = vendorOf(reads[0].excerpt ?? '')
    if (!vendors.has(v)) vendors.set(v, [])
    vendors.get(v)!.push(host)
  }
  console.log('WHO IS DOING THE BLOCKING')
  for (const [v, hs] of Array.from(vendors.entries()).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${v.padEnd(14)} ${String(hs.length).padStart(2)} host(s)`)
    for (const h of hs.sort()) {
      const prod = productOf(byHost.get(h)![0].excerpt ?? '').product
      console.log(`       ${h.padEnd(30)} ${prod}`)
    }
  }
  // VENDOR, not product — the six Cloudflare hosts run four different challenge
  // types, so calling them "one product" was simply false once the two levels
  // were separated. The correlation risk is at the vendor level, because that is
  // where a block-duration policy would live.
  const biggest = Math.max(...Array.from(vendors.values()).map(h => h.length))
  if (biggest > 1) {
    const worst = Array.from(vendors.entries()).sort((a, b) => b[1].length - a[1].length)[0]
    const prods = new Set(worst[1].map(h => productOf(byHost.get(h)![0].excerpt ?? '').product))
    console.log(`\n  ${biggest} hosts sit behind ${worst[0]}`
              + `${prods.size > 1 ? ` across ${prods.size} challenge types` : ''}, so their clears may`)
    console.log('  NOT be independent observations. Read the grouped section below rather')
    console.log('  than the pooled percentile.')
  }
  console.log('')

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
      const pv = productOf(reads[0].excerpt ?? '')
      clears.push({ host, lo, hi, from: reads[0].reason!, vendor: pv.vendor, product: pv.product })
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

  // AT OR BELOW, which is what the line above promises. The first version took
  // the smallest rung >= p25 and would have answered "consider 6h" to a p25 of
  // 2.38 — the opposite of the stated rule, and in the patient direction, which
  // is the harmful one.
  const p25lo = pct(los, 0.25)
  const eligible = HOST_BACKOFF_HOURS.filter(h => h <= p25lo)
  const suggested = eligible.length ? eligible[eligible.length - 1] : HOST_BACKOFF_HOURS[0]
  console.log(`\n  TREAT THE PERCENTILE AS A SUMMARY, NOT AN ESTIMATE. n is hosts, not`)
  console.log(`  independent draws, and the vendor grouping above says how much of it`)
  console.log(`  is one product answering ${clears.length} times.`)
  console.log(`\n  On this data the first rung wants to be at or below the p25 of the`)
  console.log(`  EARLIEST bound, ${pct(los, 0.25).toFixed(2)}h — the conservative end, because a rung set`)
  console.log(`  from the latest bound would be too patient by up to one interval.`)
  console.log(`  Current first rung: ${HOST_BACKOFF_HOURS[0]}h.`)
  console.log(`  ${suggested === HOST_BACKOFF_HOURS[0] ? 'No change indicated.' : `Consider ${suggested}h.`}`)

  // ── The finding that would actually generalise ─────────────────────────────
  console.log('\nGROUPED BY VENDOR — is a block duration a POLICY?')
  const byVendor = new Map<string, typeof clears>()
  for (const c of clears) {
    if (!byVendor.has(c.vendor)) byVendor.set(c.vendor, [])
    byVendor.get(c.vendor)!.push(c)
  }
  for (const [v, cs] of Array.from(byVendor.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const los = cs.map(c => c.lo), his = cs.map(c => c.hi)
    const spread = Math.max(...his) - Math.min(...los)
    console.log(`  ${v}  (${cs.length} host${cs.length === 1 ? '' : 's'} cleared)`)
    for (const c of cs.sort((a, b) => a.lo - b.lo)) {
      console.log(`     ${c.host.padEnd(28)} ${c.lo.toFixed(2)}h to ${c.hi.toFixed(2)}h   (${c.product})`)
    }
    if (cs.length === 1) {
      console.log('     One host. Says nothing about the vendor, only about this site.')
      console.log('     Two is the minimum that can test a policy.')
    } else {
      // "Together" means TWO brackets wide, not one. Two hosts under an
      // identical timeout still land one sampling step apart if one clears just
      // before a read and the other just after, so a single-bracket test calls
      // an identical policy a difference. Two adjacent brackets is the width at
      // which the sampling genuinely cannot tell them apart.
      const widest = Math.max(...cs.map(c => c.hi - c.lo))
      console.log(spread <= widest * 2
        ? `     ALL WITHIN ${spread.toFixed(2)}h, no wider than the sampling can resolve.`
          + '\n     That is consistent with a fixed timeout, and is worth more than the'
          + '\n     percentile above: set the rung from the vendor, not from these hosts.'
        : `     Spread over ${spread.toFixed(2)}h, wider than the ${widest.toFixed(2)}h brackets.`
          + '\n     Not a single timeout, so these do behave as separate observations.')
    }
  }

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
