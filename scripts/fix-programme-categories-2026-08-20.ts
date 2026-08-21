// Four "category problems" in the programmes tab. One was real, and it was an
// amount, not a category.
//
// COACH CORE — I had this backwards. The row shows amount_max = 0, and I read the
// employer-partnership page as "you host an apprentice and pay for it", which
// would make it not funding at all. The money runs the other way: Coach Core
// "has granted over £3.5 million to employers", and an employer receives roughly
// £3,500 per level 2 apprentice, "free to use that grant for purposes of
// supporting their apprentice — some use this grant to top up the salary,
// others to pay for additional training, qualifications, travel costs".
//
// So it is a real grant to the organisation, and £0 on the card was the fault.
// £0 also raises `amount_zero`, so the row was flagged for the wrong reason.
//
// THE OTHER THREE SURVIVED THE CHECK:
//
//   Spacehive     I called it "a platform, not a funder". It is a platform, and
//                 it is also the route to council match funds of up to £50,000 —
//                 real money a community project can win. `match_funding` already
//                 says what it is. Left as a programme.
//
//   Business Wales  Support for Welsh businesses "at all stages", which includes
//                 social enterprises. Aimed wider than our audience, but not
//                 outside it. Left.
//
//   VCSE Contract Readiness, WCIT AI/ML   I suggested moving both to In-Kind.
//                 Both are structured cohort programmes you apply to and join,
//                 which is exactly what the Programmes tab is for. In-Kind is for
//                 a resource handed over — software, space, pro bono hours. Left.
//
// Three of four wrong, and the one that was right was right for a different
// reason than I gave.
//
//   npx tsx --env-file=.env.local scripts/fix-programme-categories-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-programme-categories-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:programme-categories-2026-08-20'
const COACH_CORE = 'c67c1e54-64e2-4b82-b651-952aecfa434d'

const QUOTE =
  'coachcore.org.uk and its published reporting: "Coach Core has granted over £3.5 million to employers, unlocking an '
  + 'additional £17.5 million in impact." An employer receives roughly £3,500 per level 2 apprentice and is "free to use '
  + 'that grant for purposes of supporting their apprentice, both personally and professionally. Some use this grant to '
  + 'top up the salary of their apprentice, whilst others use it to pay for additional training, qualifications, travel '
  + 'costs or other expenses." The row showed £0, which reads as "no money" and also raised amount_zero.'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('scraped_grants')
    .select('title, amount_min, amount_max, funding_type, funder_brief').eq('id', COACH_CORE).limit(1)
  if (!data?.length) { console.error('row not found'); process.exit(1) }
  const row = data[0] as { title: string; amount_min: number | null; amount_max: number | null; funder_brief: Record<string, unknown> | null }

  console.log(`\n${row.title}`)
  console.log(`   was: ${row.amount_min ?? '—'} to ${row.amount_max ?? '—'}`)
  console.log(`   now: 3500 (grant to the employer, per level 2 apprentice)`)

  if (DRY) { console.log('\nDRY RUN.\n'); return }

  const brief = { ...((row.funder_brief ?? {}) as Record<string, unknown>) }
  brief.typical_award =
    'Around £3,500 to the employing organisation per level 2 apprentice, paid by Coach Core and usable for salary '
    + 'top-up, additional training, qualifications or travel. Separate from the government contribution towards '
    + 'education costs. The organisation employs and pays the apprentice for a minimum of 30 hours a week.'

  const r = await mergeGrantUpdate({
    id: COACH_CORE,
    fields: { amount_min: 3500, amount_max: 3500, funder_brief: brief },
    source: SOURCE, db,
    citations: {
      amount_min: { snippet: QUOTE, confidence: 'high' },
      amount_max: { snippet: QUOTE, confidence: 'high' },
      funder_brief: { snippet: QUOTE, confidence: 'high' },
    },
  })
  console.log(`   applied: ${r.applied.join(', ') || '(nothing)'}`)
  if (r.rejected?.length) console.log(`   REFUSED: ${JSON.stringify(r.rejected)}`)

  const { data: after } = await db.from('scraped_grants').select('amount_min, amount_max').eq('id', COACH_CORE).limit(1)
  const a = after?.[0] as { amount_min: number | null; amount_max: number | null }
  console.log(`   verified: ${a.amount_min} to ${a.amount_max}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
