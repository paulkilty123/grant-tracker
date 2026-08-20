// The 17 amount contradictions the sweep found, judged one at a time.
//
// The quotes are trustworthy — the verifier will not raise a proposal without a
// quote it found on the page — so the work here is not "is this real" but "what
// does it MEAN". Three different faults turned up, and treating them alike would
// have written eight wrong numbers.
//
//   A. The page is simply right and we were wrong.        8 applied here.
//   B. The number is right and the SLOT is wrong.         1, Ian Askew.
//   C. The extraction is literal-minded or conflates two
//      different grants.                                  6 rejected, listed below.
//   D. Per-year versus total, genuinely arguable.         2 left for Paul.
//
// This is why verify-rows REPORTS proposals and never applies them.
//
//   npx tsx --env-file=.env.local scripts/fix-contradicted-amounts-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-contradicted-amounts-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:contradicted-amounts-2026-08-20'

const APPLY: { id: string; title: string; fields: Record<string, unknown>; quote: string }[] = [
  { id: '8d98b098-984e-4ee1-a340-facede127492', title: "Drapers' Charitable Fund", fields: { amount_max: 20000 },
    quote: 'Grants are awarded for sums up to £20,000 but larger grants may be selectively awarded. We showed £25,000.' },
  { id: '1d5f09bb-2f34-4c27-b3bb-a909028c6c62', title: 'Ballantrae Community Fund', fields: { amount_min: 1000 },
    quote: 'You can apply for grants between £1000 and £25,000. We held no minimum.' },
  { id: '6e7e1ce3-5e49-4bc4-95a2-d0615ee943ef', title: 'Jack Petchey — Educational Visit Grants', fields: { amount_max: 1200 },
    quote: 'A contribution of up to £20 per young person, to a maximum £1,200 grant value per application. We showed £2,000.' },
  { id: 'dbf2a937-f72b-49f5-9a02-d827a1f9d191', title: 'Paul Hamlyn — Youth Fund', fields: { amount_min: 30000 },
    quote: 'We do not make grants of less than £30,000 per year. An explicit floor, and we held none.' },
  { id: '39f3ef6c-a008-40da-a293-6f78a7ae0abe', title: 'Sport England — The Movement Fund', fields: { amount_min: 300 },
    quote: 'Grants or pledges from £300 to £15,000. We held no minimum.' },
  { id: '0114ad82-c985-4e59-9c5b-791cd5c3f1df', title: 'Alpkit Foundation', fields: { amount_min: 50 },
    quote: 'We focus mainly on small awards that have a direct impact, with support in the region of £50-£500. We showed a £500 minimum against a £500 maximum, which reads as a fixed award.' },
  { id: '120e1d2a-d2ef-4663-8934-c0e091138818', title: 'Movement for Good — £1,000 Draws', fields: { amount_max: 1000 },
    quote: 'Enter your favourite charities for the chance to win £1,000. The row is the £1,000 draw; £5,000 belongs to a different Movement for Good award.' },
  // ── B. Right number, wrong slot ──
  { id: 'ec9f1ec9-426a-49aa-aaea-4a3e1a718afc', title: 'Ian Askew Charitable Trust', fields: { amount_max: 3000 },
    quote: '"Funder No Min - £3,000 no deadline". The £3,000 is the MAXIMUM and the page states there is no minimum; the extractor offered 3000 as a minimum, and our stored maximum of £500 was wrong on top of that.' },
]

/** Not applied, and why. Printed so the reasoning survives the run. */
const REJECTED = [
  ['Community and Environment Fund', 'min → £1', '"How much you can get From £1 to £250,000". Literally true and useless: "from £1" is the funder saying there is no minimum, not setting one.'],
  ['London Social and Affordable Homes', 'max → £11,700,000,000', '"Funding amount: up to £11.7 billion" is the whole programme budget, not one applicant\'s award. The prompt says a pot is not an amount and it failed on the largest possible example.'],
  ['Scops Arts Trust', 'min → £100', '"Grant awards typically start from a few hundred pounds". A few hundred is not £100, and inventing precision from vagueness is how a wrong floor gets on a card.'],
  ['SEAD Fund', 'min → £250', '"Grants are typically £250" is a typical, not a floor, and our maximum is already £250.'],
  ['Cuthbert Horn Trust', 'min → £4,000', '"Grants tend to be for about £4,000" is a typical, not a floor, and our maximum is already £4,000.'],
  ['SWEF Enterprise Fund Start-Up', 'min → £500, max → £1,500', 'Two different grants conflated. "Start-up grants are awarded up to £500" — so £500 is the MAXIMUM, not the minimum. The £1,500 is a separate follow-on available only after six months of trading.'],
]

/** Genuinely arguable. Paul's call, not a guess. */
const FOR_PAUL = [
  ['The 1989 Willan Charitable Trust', 'max £10,000 → £20,000', '"core and unrestricted grants of up to £20,000, £10,000 per year". £20,000 is the most anyone receives; £10,000 is the most in one year. Which belongs on a card is a product decision.'],
  ['Scops Arts Trust', 'max £30,000 → £15,000', '"in exceptional cases we make multi-year grants of up to £15,000 per annum". Same shape: £15,000 a year, and our £30,000 may be two years of it.'],
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  console.log(`applying ${APPLY.length}, rejecting ${REJECTED.length}, leaving ${FOR_PAUL.length} for Paul\n`)
  let applied = 0, refused = 0
  for (const e of APPLY) {
    if (DRY) { console.log(`  ${e.title.slice(0, 40).padEnd(42)} ${JSON.stringify(e.fields)}`); continue }
    const citations = Object.fromEntries(Object.keys(e.fields).map(k => [k, { snippet: e.quote, confidence: 'high' as const }]))
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`  ${e.title.slice(0, 40).padEnd(42)} ${r.applied.join(', ') || '(nothing)'}`)
    applied += r.applied.length
    if (r.rejected?.length) { refused += r.rejected.length; console.log(`      REFUSED: ${r.rejected.map(x => `${x.field} (${x.reason}, held by ${x.blockedBy?.source})`).join('; ')}`) }
  }

  console.log(`\n── rejected, and why`)
  for (const [t, change, why] of REJECTED) console.log(`  ${t} — ${change}\n      ${why}`)
  console.log(`\n── for Paul: per-year versus total`)
  for (const [t, change, why] of FOR_PAUL) console.log(`  ${t} — ${change}\n      ${why}`)

  if (DRY) return
  console.log(`\nfields applied: ${applied}   refused: ${refused}`)

  const { data } = await db.from('scraped_grants').select('title, amount_min, amount_max').in('id', APPLY.map(e => e.id))
  console.log('\nverified:')
  for (const r of (data ?? []) as { title: string; amount_min: number | null; amount_max: number | null }[]) {
    console.log(`  ${r.title.slice(0, 44).padEnd(46)} ${r.amount_min ?? '—'} to ${r.amount_max ?? '—'}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
