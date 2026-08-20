// The seven "clearest suspects" among unsupported deadlines, checked one by one.
//
// FOUR OF THE SEVEN WERE CORRECT. `system:cycle_derive:v1` looked like the
// weakest provenance in the pile — it is the mechanism that gave A Sinclair
// Henderson Trust a deadline in a year with no trustee meeting — so I proposed
// taking all seven. Reading them says otherwise:
//
//   Schroder Charity Trust  — "5pm on the 28th August 2026". Correct.
//   Bellahouston Bequest    — quarterly trustee cut-offs, verified 19 August. Correct.
//   Sizewell C              — "Sunday 27th September 2026 at 23:59". Correct.
//   Ballantrae              — "Application Deadline: 09/10/26". Correct.
//
// A derived date is not a wrong date. The cycles behind these four came off real
// pages and the derivation rolled them forward correctly; the verifier simply did
// not find the date on the page it happened to read.
//
// TWO NEEDED SOMETHING, and only one of them is about a deadline:
//
//   Continuo Foundation — its own cycle labels read "Spring round (approx)" and
//   "Autumn round (approx)". A date derived from an entry that says approx is a
//   guess wearing a date's clothes, and the page publishes no deadlines at all —
//   it announces rounds after the fact. The row also already says "TBC — between
//   rounds" while showing 1 September, which is a card contradicting itself.
//
//   East Midlands Airport — apply_url points at active-together.org, a
//   third-party funding directory, not the airport. The funder's own page is
//   eastmidlandsairport.com/community/supporting-the-local-community/ and
//   applications run through magcommunityfunds.smapply.org. Published deadlines
//   conflict between sources, so the derived 5 October is not established either.
//
//   Aviva Financial Futures returns 403 and is left alone.
//
//   npx tsx --env-file=.env.local scripts/fix-derived-deadlines-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-derived-deadlines-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:derived-deadline-review-2026-08-20'

const EDITS = [
  {
    id: '49a1fffd-2412-4105-8897-8a5af286b797',
    title: 'Continuo Foundation Project Grants',
    fields: { deadline: null },
    quote: 'continuofoundation.co.uk/our-grants publishes no application deadlines: it announces rounds after they are awarded ("its eleventh round of grant awards to 30 period-instrument ensembles"). '
      + 'The 1 September date was derived from this row\'s own deadline_cycle, whose labels read "Spring round (approx)" and "Autumn round (approx)". '
      + 'A date derived from an entry marked approx is a guess with a date\'s precision, and the row was already saying "TBC — between rounds" beside it. '
      + 'The cycle is kept; only the asserted date goes.',
  },
  {
    id: 'a7e93d28-fc29-48ff-91fa-b06b1f30eafe',
    title: 'East Midlands Airport Community Fund',
    fields: {
      apply_url: 'https://www.eastmidlandsairport.com/community/supporting-the-local-community/',
      funding_index_url: 'https://magcommunityfunds.smapply.org/',
      deadline: null,
    },
    quote: 'apply_url pointed at active-together.org/fundingfinder/805, a third-party funding directory rather than the funder. '
      + 'The airport\'s own community page is eastmidlandsairport.com/community/supporting-the-local-community/ and applications run through '
      + 'magcommunityfunds.smapply.org. Published deadlines conflict across sources (6 July 2026 in one, 6 October 2025 in another), so the '
      + '5 October date derived from our cycle is not established. Grants are up to £2,000 for organisations in the EMA Area of Benefit.',
  },
]

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  let applied = 0, refused = 0
  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(e.fields)} (dry)`); continue }
    const citations = Object.fromEntries(Object.keys(e.fields).map(k => [k, { snippet: e.quote, confidence: 'high' as const }]))
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${r.applied.join(', ') || '(nothing)'}`)
    applied += r.applied.length
    if (r.rejected?.length) { refused += r.rejected.length; console.log(`   REFUSED:  ${r.rejected.map(x => `${x.field} (${x.reason})`).join('; ')}`) }
  }
  if (DRY) return
  console.log(`\nfields applied: ${applied}   refused: ${refused}`)

  const { data } = await db.from('scraped_grants')
    .select('title, deadline, apply_url, deadline_cycle').in('id', EDITS.map(e => e.id))
  console.log('\nverified:')
  for (const r of (data ?? []) as { title: string; deadline: string | null; apply_url: string; deadline_cycle: unknown }[]) {
    console.log(`  ${r.title.slice(0, 40).padEnd(42)} deadline ${r.deadline ?? '—'}  cycle kept: ${Array.isArray(r.deadline_cycle) ? 'yes' : 'no'}`)
    console.log(`      ${r.apply_url}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
