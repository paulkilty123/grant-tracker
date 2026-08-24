// What shape is the catalogue actually in, measured rather than asserted.
//
// Paul, 2026-08-21: "how confident are you that it is mainly accurate and I
// don't need to worry about major issues?"
//
// The honest way to answer that is to run the SAME gate the review queue runs,
// over every row, and count what it says — including over rows that are already
// LIVE, which the queue does not normally show. A live row with a blocking
// reason is the thing that should worry him; a staged row with one is just work.
//
// Everything here is a database read. No API spend. `field_evidence` was paid
// for by the nightly cron and is read back, not re-fetched.
//
//   npx tsx --env-file=.env.local scripts/catalogue-health-2026-08-21.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'
import { sectionOf } from '../src/lib/admin/review-sections'
import { readStamp, PAGE_READ_KEY } from '../src/lib/field-evidence'

const TODAY = '2026-08-21'

async function fetchAll(db: any) {
  const out: Record<string, unknown>[] = []
  const PAGE = 900               // PostgREST caps at 1000; stay under it
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('scraped_grants').select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

function pct(n: number, d: number) { return d === 0 ? '  -  ' : `${((n / d) * 100).toFixed(1)}%`.padStart(6) }

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const rows = await fetchAll(db)
  console.log(`rows in scraped_grants: ${rows.length}\n`)

  const live   = rows.filter(r => r.is_active === true)
  const staged = rows.filter(r => r.is_active !== true)
  console.log(`live to users : ${live.length}`)
  console.log(`not live      : ${staged.length}\n`)

  // ── run the real gate over the live population ────────────────────────────
  const liveBlocking = new Map<string, number>()
  const liveInfo     = new Map<string, number>()
  let liveClean = 0
  const worstExamples = new Map<string, string[]>()

  for (const r of live) {
    const reasons = deriveReviewReasons(r as ReviewRow, TODAY)
    const gate    = gateDecision(r as ReviewRow, reasons)
    if (gate.blocking.length === 0) liveClean++
    for (const b of gate.blocking) {
      liveBlocking.set(b.code, (liveBlocking.get(b.code) ?? 0) + 1)
      const ex = worstExamples.get(b.code) ?? []
      if (ex.length < 3) { ex.push(String(r.title).slice(0, 46)); worstExamples.set(b.code, ex) }
    }
    for (const i of gate.informational) liveInfo.set(i.code, (liveInfo.get(i.code) ?? 0) + 1)
  }

  console.log('── LIVE ROWS, judged by the same gate the queue uses')
  console.log(`   nothing blocking at all : ${liveClean} of ${live.length}  (${pct(liveClean, live.length)})\n`)
  console.log('   blocking on a live row (this is the worry list):')
  for (const [code, n] of Array.from(liveBlocking).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${code.padEnd(26)} ${String(n).padStart(4)}  ${pct(n, live.length)}   e.g. ${(worstExamples.get(code) ?? []).join(' · ')}`)
  }
  console.log('\n   informational only (worth knowing, not wrong):')
  for (const [code, n] of Array.from(liveInfo).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`      ${code.padEnd(26)} ${String(n).padStart(4)}  ${pct(n, live.length)}`)
  }

  // ── the queue, by the section a reviewer would see ────────────────────────
  const QUEUE_STATES = ['captured', 'enriched', 'tagged', 'tagged_awaiting_review']
  const queue = staged.filter(r => QUEUE_STATES.includes(String(r.pipeline_state)))
  const sections = new Map<string, number>()
  for (const r of queue) {
    const reasons = deriveReviewReasons(r as ReviewRow, TODAY)
    const gate    = gateDecision(r as ReviewRow, reasons)
    const s = sectionOf(gate.blocking.map(b => b.code), reasons.map(x => x.code))
    sections.set(s, (sections.get(s) ?? 0) + 1)
  }
  console.log(`\n── THE REVIEW QUEUE (${queue.length} rows awaiting you)`)
  for (const [s, n] of Array.from(sections).sort((a, b) => b[1] - a[1])) console.log(`      ${s.padEnd(26)} ${String(n).padStart(4)}`)

  const otherStates = new Map<string, number>()
  for (const r of staged) if (!QUEUE_STATES.includes(String(r.pipeline_state)))
    otherStates.set(String(r.pipeline_state), (otherStates.get(String(r.pipeline_state)) ?? 0) + 1)
  console.log('\n   not live and not in the queue:')
  for (const [s, n] of Array.from(otherStates).sort((a, b) => b[1] - a[1])) console.log(`      ${s.padEnd(26)} ${String(n).padStart(4)}`)

  // ── has anybody actually READ the page behind a live row? ─────────────────
  let read = 0, readRecent = 0, neverRead = 0
  const cutoff = new Date(TODAY); cutoff.setDate(cutoff.getDate() - 30)
  for (const r of live) {
    const stamp = readStamp(r.field_evidence as never, PAGE_READ_KEY)
    if (!stamp?.checked_at) { neverRead++; continue }
    read++
    if (new Date(stamp.checked_at) >= cutoff) readRecent++
  }
  console.log('\n── HAS THE PAGE BEHIND A LIVE ROW BEEN READ?')
  console.log(`      read at some point        ${String(read).padStart(4)}  ${pct(read, live.length)}`)
  console.log(`      read in the last 30 days  ${String(readRecent).padStart(4)}  ${pct(readRecent, live.length)}`)
  console.log(`      never read                ${String(neverRead).padStart(4)}  ${pct(neverRead, live.length)}`)

  // ── the four things a fundraiser actually needs ───────────────────────────
  const need = (f: (r: Record<string, unknown>) => boolean) => live.filter(f).length
  const hasBrief = need(r => !!r.funder_brief && Object.keys(r.funder_brief as object).length >= 4)
  const hasWho   = need(r => { const b = r.funder_brief as Record<string, unknown> | null; return !!b?.who_can_apply })
  const hasExcl  = need(r => { const b = r.funder_brief as Record<string, unknown> | null; return !!b?.exclusions })
  const hasDate  = need(r => !!r.deadline || r.is_rolling === true || !!r.next_open_date_parsed)
  const hasMoney = need(r => r.amount_min != null || r.amount_max != null || r.amount_undisclosed === true)
  const hasLink  = need(r => !!r.apply_url)
  console.log('\n── WHAT A LIVE CARD TELLS A FUNDRAISER')
  console.log(`      a link to apply           ${String(hasLink).padStart(4)}  ${pct(hasLink, live.length)}`)
  console.log(`      who can apply             ${String(hasWho).padStart(4)}  ${pct(hasWho, live.length)}`)
  console.log(`      exclusions                ${String(hasExcl).padStart(4)}  ${pct(hasExcl, live.length)}`)
  console.log(`      a brief with 4+ fields    ${String(hasBrief).padStart(4)}  ${pct(hasBrief, live.length)}`)
  console.log(`      a date or "rolling"       ${String(hasDate).padStart(4)}  ${pct(hasDate, live.length)}`)
  console.log(`      an amount, or "undisclosed" ${String(hasMoney).padStart(2)}  ${pct(hasMoney, live.length)}`)

  // ── the specific things that have gone wrong before ───────────────────────
  const pastDeadline = live.filter(r => r.deadline && String(r.deadline) < TODAY)
  const rollingNoDate = live.filter(r => r.is_rolling === true && !r.deadline)
  const deadLink = live.filter(r => r.url_status === 'dead')
  const homepage = live.filter(r => r.apply_url && r.apply_url === r.funding_index_url)
  console.log('\n── KNOWN FAILURE MODES, COUNTED')
  console.log(`      live with a deadline already past   ${String(pastDeadline.length).padStart(4)}`)
  if (pastDeadline.length) console.log(`         e.g. ${pastDeadline.slice(0, 4).map(r => `${String(r.title).slice(0, 34)} (${r.deadline})`).join(' · ')}`)
  console.log(`      live and marked rolling, no date    ${String(rollingNoDate.length).padStart(4)}  ${pct(rollingNoDate.length, live.length)}`)
  console.log(`      live with url_status = dead         ${String(deadLink.length).padStart(4)}`)
  console.log(`      live pointing at the funder's index ${String(homepage.length).padStart(4)}  (a front door, not automatically wrong)`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
