// Hidden funds whose own pages already told us when they come back.
//
// TWO OF MY CLAIMS ABOUT THESE ROWS WERE WRONG, and the correction is the point.
//
//   "22 rows with nothing to bring them back" — the operative number was 79, the
//   rows with no `next_open_date_parsed`, which is what `check-coming-soon` fires
//   on.
//
//   "Nothing will ever bring them back" — false. `select_verify_batch` includes
//   any row that is not rejected or archived, so all 75 readable ones were re-read
//   between 16 and 19 August. They are read constantly.
//
//   "56 of them say when they return, so parsing is free" — false. 36 say
//   "Closed — next round TBC" and another dozen say TBC in other words. Only a
//   handful are datable from `next_open_date`.
//
// The real gap is narrower and worse: **the pages ARE read, the answer IS
// captured, and nothing acts on it.** The verifier stores a verbatim quote in
// `field_evidence`, and for these rows that quote says when the fund reopens —
// or that it is open right now. Nothing reads it back.
//
// So this mines evidence we already paid for. No page fetches, no model calls.
//
//   npx tsx --env-file=.env.local scripts/mine-hidden-row-evidence-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/mine-hidden-row-evidence-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:hidden-evidence-mine-2026-08-20'

/**
 * OPEN RIGHT NOW and hidden from users.
 *
 * Routed to `tagged_awaiting_review` rather than made live, which is exactly what
 * `check-coming-soon` does when a fund reopens: visibility is Paul's click, not
 * a script's. Verified against the funder's own page before being moved, because
 * a wrong row in his queue costs a review.
 */
const REOPENED = [
  {
    id: '5ed9736a-814f-42b2-89cc-156e880b1740',
    title: "Wiltshire & Swindon — Older People's Programme",
    fields: { deadline: '2026-09-21', pipeline_state: 'tagged_awaiting_review', next_open_date: null, next_open_date_parsed: null },
    quote: 'wscf.org.uk, re-read 2026-08-20: "This programme is currently open for applications, and will close on Monday 21 September at 12 noon, with decisions being made in mid-November." Open now, and hidden from users while it runs.',
  },
]

/**
 * A reopening date stated in the quote we already hold.
 *
 * Only `next_open_date_parsed` and the prose are set — the row stays hidden. The
 * date's job is to make `check-coming-soon` fire, which routes the row into
 * review on the day. Where the funder names a month rather than a day, the FIRST
 * of that month is used: under-shooting means looking early and finding it shut,
 * which the cadence then pushes out. Over-shooting means missing the opening.
 */
const SCHEDULED = [
  { id: '1805dc7a-5123-42d2-b283-dce6b6098556', title: 'City Bridge — Economic Justice',
    parsed: '2026-09-01', prose: 'Applications for the first round open in September 2026.',
    quote: 'citybridgefoundation.org.uk, read 2026-08-19: "Applications for the first round open in September 2026."' },
  { id: 'efee86d2-ed26-408d-96f2-418ee71cb46f', title: 'CHIP — Community Chest Fund',
    parsed: '2026-09-25', prose: 'Reopens at the end of September 2026, for December decisions.',
    quote: 'chipcharity.org.uk, read 2026-08-18: "Applications for the Community Chest Fund are now closed. This will reopen at the end of September for December."' },
  { id: '08a08c30-453d-469f-9ce2-65a2dafbe0d8', title: 'Peter Kershaw Trust — Ordinary Grants',
    parsed: '2026-11-01', prose: 'One grant window a year, in November 2026.',
    quote: 'peterkershawtrust.org, read 2026-08-16: "There is only one grant window for the receipt and determination of applications which is November."' },
  { id: '87775eeb-4be9-4068-be85-66587cc45af3', title: 'Woodward Charitable Trust — General Grants',
    parsed: '2026-10-01', prose: 'Trustees review once a year, in October 2026 or November 2026.',
    quote: 'woodwardcharitabletrust.org.uk, read 2026-08-19: "Trustees review grant applications once a year, usually in October or November depending on the volume received."' },
  { id: '33f2e884-f1b2-4da0-815b-e7b14f55334a', title: 'Berkshire CF — Priority Grants Round',
    parsed: '2027-06-01', prose: 'Reopens in Summer 2027.',
    quote: 'berkshirecf.org, read 2026-08-17: "Our Priority Grants Round is now closed. The round will reopen for applications in Summer 2027."' },
  { id: '41c8f587-cce9-4b3a-a6a6-cad7e54dbe18', title: 'Nidderdale Plus Community Fund',
    parsed: '2027-01-01', prose: 'Reopens in 2027, funds allowing.',
    quote: 'tworidingscf.org.uk, read 2026-08-17: "Funds allowing, we will then reopen in 2027 for further applications." Hedged by the funder, so January 2027 is a date to LOOK on, not a promise.' },
]

/** Read, quoted, and still not datable. Named so the residue is visible. */
const STILL_UNDATABLE = [
  ['Lloyds Bank Foundation Racial Equity', '"Applications are now open" — but read from actiontogether.org.uk, a third party, not Lloyds. Not moved on someone else\'s page.'],
  ['Wiltshire & Swindon — Community Grants', 'A table of windows that reads as open now on one reading and not on another. Needs a person.'],
  ['Rusholme Wind Farm Fund', '"Microgrants are now closed and will be open towards the end of the summer" alongside "we are now open for standard, larger and multi year grants". Two funds in one row.'],
  ['Highlands and Islands Environment Foundation', '"Applications for grants will be accepted in three periods in 2026" — no periods named.'],
  ['The Pixel Fund', '"Temporarily closed... oversubscribed." Correctly hidden, no date to give.'],
  ['City Bridge — Access to Justice', '"We\'ll share details of future funding opportunities on this page as they\'re confirmed."'],
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  console.log(`reopened: ${REOPENED.length}   scheduled: ${SCHEDULED.length}   left undatable: ${STILL_UNDATABLE.length}\n`)

  let applied = 0, refused = 0
  const run = async (id: string, title: string, fields: Record<string, unknown>, quote: string) => {
    if (DRY) { console.log(`  ${title.slice(0, 44).padEnd(46)} ${JSON.stringify(fields).slice(0, 80)}`); return }
    const citations = Object.fromEntries(Object.keys(fields).map(k => [k, { snippet: quote, confidence: 'high' as const }]))
    const r = await mergeGrantUpdate({ id, fields, source: SOURCE, db, citations })
    console.log(`  ${title.slice(0, 44).padEnd(46)} ${r.applied.join(', ') || '(nothing)'}`)
    applied += r.applied.length
    if (r.rejected?.length) { refused += r.rejected.length; console.log(`      REFUSED: ${r.rejected.map(x => `${x.field} (${x.reason})`).join('; ')}`) }
  }

  console.log('── open now, into the review queue')
  for (const r of REOPENED) await run(r.id, r.title, r.fields, r.quote)

  console.log('\n── reopening date recorded, still hidden')
  for (const s of SCHEDULED) {
    await run(s.id, s.title, { next_open_date: s.prose, next_open_date_parsed: s.parsed }, s.quote)
  }

  console.log('\n── read, quoted, still not datable')
  for (const [t, why] of STILL_UNDATABLE) console.log(`  ${t}\n      ${why}`)

  if (DRY) { console.log('\nDRY RUN — nothing written.\n'); return }
  console.log(`\nfields applied: ${applied}   refused: ${refused}`)

  const { data } = await db.from('scraped_grants')
    .select('title, pipeline_state, next_open_date_parsed, deadline')
    .in('id', [...REOPENED, ...SCHEDULED].map(r => r.id))
  console.log('\nverified:')
  for (const r of (data ?? []) as { title: string; pipeline_state: string; next_open_date_parsed: string | null; deadline: string | null }[]) {
    console.log(`  ${r.title.slice(0, 44).padEnd(46)} ${r.pipeline_state.padEnd(24)} opens ${r.next_open_date_parsed ?? '—'}  deadline ${r.deadline ?? '—'}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
