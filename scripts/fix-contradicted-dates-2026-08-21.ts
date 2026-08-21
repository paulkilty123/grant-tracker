// Ten live rows where the stored deadline disagrees with the page. Read, not
// counted — and the pile shrank again, this time in an instructive direction.
//
// ─────────────────────────────────────────────────────────────────────────────
// THREE OF THE TEN PROPOSE AN OPENING DATE AS A CLOSING DATE
//
// One Stop: "will re-open on Tuesday 1 September 2026."
// Bethnal Green Ventures: "Applications ... will re-open in May 2026."
// Heart of England: "We expect to reopen applications in September 2026."
//
// The extractor read each correctly and filed it under `deadline`. Applying
// those would tell a fundraiser to apply BY the date the fund actually OPENS —
// an inversion, and a worse error than the blank we show today. All three rows
// already carry `next_open_date`, which is where that fact belongs.
//
// This is the same family as the index-vs-programme status trap: the sentence is
// extracted faithfully and assigned to the wrong field.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO PROPOSE A PAST DATE BECAUSE THE QUOTE NAMES NO YEAR
//
// Suffolk Giving Fund: "For applications up until 10th August" → proposed
//   2025-08-10. Greggs: "open for applications until 28th August at 12 noon" →
//   proposed 2025-08-28, against our stored 2026-08-28, which is almost certainly
//   right given the page was read on 16 August 2026.
//
// This is exactly the failure the reopening detector's `quoteStatesTheYear`
// guard was built for, and the abstain rule's `requireYear` exists for it too.
// Neither is applied here, so both rows are reported rather than written.
//
// ─────────────────────────────────────────────────────────────────────────────
// FIVE ARE SOUND AND ARE APPLIED. Every one names its year in the funder's own
// sentence. Adding a deadline PUTS A CLAIM UP, which the actuator may never do
// unattended — Paul authorised these ten specifically on 2026-08-21.
//
//   npx tsx --env-file=.env.local scripts/fix-contradicted-dates-2026-08-21.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-contradicted-dates-2026-08-21.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:date-ruling-2026-08-21'

type Fix = { id: string; title: string; fields: Record<string, unknown>; why: string }

const APPLY: Fix[] = [
  {
    id: '8bb0acde-a49f-4a86-995a-9f19b23115f0', title: 'JRCT — Sustainable Future Programme',
    fields: { deadline: '2026-09-02', is_rolling: false },
    why: '"The next open round for the Sustainable Future programme closes on September 2, 2026." Names the year, names the round, unambiguous.',
  },
  {
    id: '5aaf0863-889f-47cb-8426-a195e2ebe153', title: 'Barrhill Greener Homes',
    fields: { deadline: '2026-09-01', is_rolling: false },
    why: '"Apply by: 01/09/26" on the Foundation Scotland fund page. Year present, and it is a closing date, not an opening one.',
  },
  {
    id: '88fd8569-c9e4-4973-b69f-b85a31425e0c', title: 'York Community Fund',
    fields: { deadline: '2026-10-12', is_rolling: false },
    why: '"York Community Fund ... Deadline: 12/10/2026" in the Two Ridings funding table. Four-digit year, stated as a deadline.',
  },
  {
    id: '2b5a4026-5608-4b72-8849-137631789a90', title: 'Grassroots Grants',
    fields: { deadline: '2027-02-28' },
    why: 'We showed 2027-03-31. Berkshire CF says "submitted by end of February 2027 (TBC)". The funder marks it TBC, so neither date is certain — but a month EARLIER is the safe direction to be wrong in, and it is the funder\'s own figure rather than ours.',
  },
  {
    id: 'e42b9811-5acf-4472-8ff2-a08db6f9a356', title: 'Small Grants Scheme (Merchant Taylors)',
    // Both facts, because the deadline alone would read as "open now".
    fields: { deadline: '2026-11-30', is_rolling: false, next_open_date: 'Applications open 14 September 2026' },
    why: '"We will re-open for applications from the 14th of September to the 30th of November 2026 (5pm)." One sentence carrying both dates: the window opens 14 Sep and closes 30 Nov. Storing only the deadline would make a currently-shut fund read as open, so the opening date goes on too.',
  },
]

const REPORT: { title: string; problem: string; detail: string }[] = [
  { title: 'One Stop Community Partnership Programme', problem: 'opening date proposed as a deadline',
    detail: '"will re-open on Tuesday 1 September 2026" — applying it would say apply BY the day it opens. next_open_date already set.' },
  { title: 'Tech for Good Programme (Bethnal Green Ventures)', problem: 'opening date, and already past',
    detail: '"Applications for our next programme will re-open in May 2026" — that was three months ago, so the page itself is stale. Our stored 2027-05-01 is unsourced. Row needs a look.' },
  { title: 'Birmingham and Black Country Communities Fund', problem: 'opening date proposed as a deadline',
    detail: '"currently closed due to unprecedented demand. We expect to reopen applications in September 2026." next_open_date already set.' },
  { title: 'Suffolk Giving Fund', problem: 'no year in the quote, proposed date is in the past',
    detail: '"For applications up until 10th August" → proposed 2025-08-10. 10 August 2026 has also now passed, so the current round is shut either way.' },
  { title: 'Community Action Fund (Greggs)', problem: 'the engine is wrong, not us',
    detail: '"open for applications until 28th August at 12 noon", read 16 Aug 2026 → proposed 2025-08-28. Our stored 2026-08-28 is right. Leave it.' },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log('── APPLYING (the quote names its year and states a CLOSING date)')
  for (const f of APPLY) {
    console.log(`   ${f.title.padEnd(42)} ${JSON.stringify(f.fields)}`)
    console.log(`      ${f.why}\n`)
  }
  console.log('── REPORTING, NOT WRITING')
  for (const r of REPORT) console.log(`   ${r.title.padEnd(46)} ${r.problem}\n      ${r.detail}\n`)

  if (DRY) { console.log('DRY RUN — nothing written.\n'); return }

  let ok = 0
  for (const f of APPLY) {
    const citations: Record<string, { snippet: string; confidence: 'high' }> = {}
    for (const k of Object.keys(f.fields)) citations[k] = { snippet: f.why, confidence: 'high' }
    const res = await mergeGrantUpdate({ id: f.id, fields: f.fields, source: SOURCE, db, citations })
    const wrote = Object.keys(f.fields).some(k => res.applied.includes(k))
    if (wrote) ok++
    console.log(`   ${wrote ? 'ok      ' : 'REFUSED '} ${f.title}  applied=[${res.applied.join(', ')}]${res.rejected?.length ? ` rejected=${JSON.stringify(res.rejected)}` : ''}`)
  }
  console.log(`\nwritten: ${ok}/${APPLY.length}`)

  const { data } = await db.from('scraped_grants').select('title,deadline,is_rolling,next_open_date,is_active').in('id', APPLY.map(f => f.id))
  console.log('\nverified against the database:')
  for (const r of (data ?? []) as any[]) console.log(`   ${String(r.title).slice(0, 42).padEnd(44)} deadline=${r.deadline} rolling=${r.is_rolling} live=${r.is_active}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
