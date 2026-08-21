// "Apply any time" is on 254 live cards and the funder's page backs 93 of them.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS ACTUALLY WRONG
//
// `is_rolling` has been derived as `!deadline` — a date the extractor could not
// parse becomes a positive promise to the user that there is no date. Measured
// 2026-08-21 across the live catalogue:
//
//     page read and AGREES it is rolling      93   36.6%
//     page CONTRADICTS it                      9    3.5%
//     no evidence either way                 152   59.8%
//
// The rendering layer was already fixed on 16 August — a row with is_rolling
// false or null and no deadline now renders "Check website", not "Rolling". So
// this is purely a data fix plus closing the taps that keep refilling it.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS A DE-ASSERTION, WHICH IS THE DIRECTION ALREADY AUTHORISED
//
// The removal actuator's safety asymmetry, set by Paul on 17 August: it may take
// claims DOWN unattended and may never put them up. Removing an unsupported
// "apply any time" is squarely inside that. Nothing here asserts that a fund is
// NOT rolling unless the funder's own page says so.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO BUCKETS, TWO DIFFERENT SOURCES, ON PURPOSE
//
//   THE SIX — the page names dated rounds. is_rolling true → FALSE, quoting the
//     page. Written `user_verified:` (trust 70) because Paul ruled on these
//     specifically on 2026-08-21, so ai_enrich at 60 cannot quietly flip them
//     back. NOT `admin:` — admin auto-pins and would freeze the field for good.
//
//     The armed actuator already has a `rolling_unset` class for exactly these
//     rows and has been abstaining on all nine, because `abstainReason` with
//     requireYear demands the quote name a year and "trustees meet 4 times a
//     year" does not. That is the abstain rule working: it held the decision for
//     a human, and this is the human deciding.
//
//   THE UNSUPPORTED — no evidence either way. is_rolling true → NULL, not false.
//     Null is "we do not know", which is the true state; false would be a second
//     unsupported claim in the opposite direction. Written `system:` (trust 50):
//     above `scraper` (40) so the nightly crawl cannot re-derive `!deadline` over
//     the top, but below `ai_enrich` (60) so the verification engine can still
//     set a real value the day it reads one. Deliberately not user_verified —
//     Paul approved the class, not 150-odd individual rows.
//
// THREE OF THE NINE CONTRADICTED ROWS ARE NOT IN THE SIX, and that is the point
// of reading them rather than counting them. Drapers' says "You can apply at any
// time of the year", Movement for Good says "Nominations open all year", and
// Didymus takes expressions of interest continuously. The engine marked all
// three agrees=false because the page ALSO mentions a meeting cycle — but for a
// user, "apply whenever, decided at the next meeting" IS rolling. Flipping them
// would replace a right answer with a wrong one.
//
//   npx tsx --env-file=.env.local scripts/fix-rolling-flag-2026-08-21.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-rolling-flag-2026-08-21.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { readStamp, type FieldEvidence } from '../src/lib/field-evidence'
import { deriveReviewReasons, type ReviewRow } from '../src/lib/admin/review-reasons'
import { gateDecision } from '../src/lib/admin/publish-gate'

const DRY   = process.argv.includes('--dry')
const TODAY = '2026-08-21'

/** Paul's ruling, 2026-08-21. Matched on title prefix because these titles are
 *  long and some are truncated in the reports. Each must match exactly one row
 *  or the script aborts — a silent zero-match is how a "fix" does nothing. */
const THE_SIX = [
  'Toy Trust',
  'Corra Foundation — Alcohol and Drugs Fund',
  'Strategic Legal Fund for Vulnerable Young Mi',
  'The 1989 Willan Charitable Trust',
  // NOT a bare "National Lottery Heritage Grants" prefix. There are two live
  // rows, they are different tiers, and they genuinely differ: the £10k-£250k
  // tier's page says "There is no deadline so you can apply whenever you are
  // ready" and IS rolling. Only the big tier has quarterly rounds. The one-match
  // guard below caught this; a prefix match would have flipped a correct row.
  'National Lottery Heritage Grants £250,000 to',
  'Social Investment Programme',
]

async function fetchAll(db: any) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += 900) {
    const { data, error } = await db.from('scraped_grants').select('*').range(from, from + 899)
    if (error) throw new Error(error.message)
    out.push(...(data ?? [])); if (!data || data.length < 900) break
  }
  return out
}

/** What the card will say once is_rolling stops being true. Mirrors the
 *  three-state branch in search/page.tsx — if that changes, this lies. */
function cardAfter(r: Record<string, unknown>): string {
  if (r.deadline) return `the deadline, ${r.deadline}`
  if (r.next_open_date) return 'Opens ... (or "Check funder")'
  return 'Check website'
}

async function main() {
  const db   = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const all  = await fetchAll(db)
  const live = all.filter(r => r.is_active === true)
  const rolling = live.filter(r => r.is_rolling === true)
  console.log(`live rows: ${live.length}   marked rolling: ${rolling.length}\n`)

  // ── bucket 1: the six Paul ruled on ───────────────────────────────────────
  console.log('── THE SIX (is_rolling → false, quoting the page)')
  const six: Record<string, unknown>[] = []
  for (const prefix of THE_SIX) {
    const hits = rolling.filter(r => String(r.title).startsWith(prefix))
    if (hits.length !== 1) {
      console.log(`   ABORT: "${prefix}" matched ${hits.length} rows, expected 1`)
      process.exit(1)
    }
    six.push(hits[0])
  }
  for (const r of six) {
    const s = readStamp(r.field_evidence as never, 'is_rolling')
    console.log(`   ${String(r.title).slice(0, 44).padEnd(46)} → ${cardAfter(r)}`)
    console.log(`      "${String(s?.quote ?? '').slice(0, 120)}"`)
  }

  // ── bucket 2: rolling asserted with nothing behind it ─────────────────────
  const sixIds = new Set(six.map(r => r.id))
  const unsupported = rolling.filter(r => {
    if (sixIds.has(r.id as string)) return false
    const s = readStamp(r.field_evidence as never, 'is_rolling')
    return !s || s.agrees == null            // no stamp, or a stamp that decided nothing
  })
  console.log(`\n── NO EVIDENCE EITHER WAY (is_rolling → null): ${unsupported.length} rows`)
  const after = new Map<string, number>()
  for (const r of unsupported) {
    const k = cardAfter(r).startsWith('the deadline') ? 'the deadline (unaffected)' : cardAfter(r)
    after.set(k, (after.get(k) ?? 0) + 1)
  }
  console.log('   what those cards will say instead of "Rolling":')
  for (const [k, n] of Array.from(after).sort((a, b) => b[1] - a[1])) console.log(`      ${String(n).padStart(4)}  ${k}`)

  // ── what it does to the queue ─────────────────────────────────────────────
  let newlyBlocking = 0
  for (const r of unsupported) {
    const before = gateDecision({ ...r } as ReviewRow, deriveReviewReasons({ ...r } as ReviewRow, TODAY)).blocking.length
    const hypo   = { ...r, is_rolling: null }
    const afterN = gateDecision(hypo as ReviewRow, deriveReviewReasons(hypo as ReviewRow, TODAY)).blocking.length
    if (before === 0 && afterN > 0) newlyBlocking++
  }
  console.log(`\n   live rows that will newly carry a blocking flag: ${newlyBlocking}`)
  console.log('   (they stay visible to users — the gate governs publishing, not display)')

  // ── the ones we are deliberately NOT touching ─────────────────────────────
  const confirmed = rolling.filter(r => readStamp(r.field_evidence as never, 'is_rolling')?.agrees === true)
  const leftAlone = rolling.filter(r => {
    const s = readStamp(r.field_evidence as never, 'is_rolling')
    return s?.agrees === false && !sixIds.has(r.id as string)
  })
  console.log(`\n── LEFT ALONE`)
  console.log(`   page confirms rolling                    ${confirmed.length}`)
  console.log(`   contradicted but the quote says rolling  ${leftAlone.length}  ${leftAlone.map(r => String(r.title).slice(0, 26)).join(' · ')}`)

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }

  // ── write ─────────────────────────────────────────────────────────────────
  let okSix = 0, okUnsup = 0
  const refused: string[] = []
  for (const r of six) {
    const s = readStamp(r.field_evidence as never, 'is_rolling')
    const res = await mergeGrantUpdate({
      id: r.id as string, fields: { is_rolling: false }, db,
      source: 'user_verified:rolling-ruling-2026-08-21',
      citations: { is_rolling: { snippet: `Paul ruled on this row 2026-08-21. The funder's page: "${String(s?.quote ?? '').slice(0, 220)}" — dated rounds, not rolling.`, confidence: 'high' } },
    })
    if (res.applied.includes('is_rolling')) okSix++; else refused.push(`${r.title} (six)`)
  }
  for (const r of unsupported) {
    const res = await mergeGrantUpdate({
      id: r.id as string, fields: { is_rolling: null }, db,
      source: 'system:rolling-unsupported-2026-08-21',
      citations: { is_rolling: { snippet: 'De-asserted 2026-08-21. Nothing on the funder\'s page supports "apply any time"; the flag came from a missing deadline, not a finding. Null is "we do not know", not "not rolling".', confidence: 'high' } },
    })
    if (res.applied.includes('is_rolling')) okUnsup++; else refused.push(String(r.title))
  }
  console.log(`\nwritten: ${okSix}/${six.length} of the six · ${okUnsup}/${unsupported.length} de-asserted`)
  if (refused.length) console.log(`REFUSED by the trust ladder (${refused.length}): ${refused.slice(0, 8).join(' · ')}`)

  // ── verify against the DB, not against my own return values ───────────────
  const fresh = (await fetchAll(db)).filter(r => r.is_active === true)
  console.log(`\nverified: live rows still marked rolling: ${fresh.filter(r => r.is_rolling === true).length} (was ${rolling.length})`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
