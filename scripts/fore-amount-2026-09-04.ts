// The Fore Grants Programme, 2026-09-04.
//
// Paul: the card says "Amount not disclosed" while the description says
// £45,000. The amount-null sweep of 2 September nulled amount_max because the
// row's page, thefore.org/who-we-fund/, states only the income threshold. The
// figure lives on thefore.org/what-we-offer/: "Up to £45,000 over one to
// three years". The sweep read the right page for eligibility and the wrong
// page for the amount, and the flag it set (amount_undisclosed) says the
// funder publishes no figure, which is false.
//
// Restored from the sentence, with what-we-offer attached as a source so the
// verifier reads it. Rounds: registration windows three times a year; the
// Autumn 2026 window ran 8 to 15 July with applications due 7 September, so
// the row carries the registration pattern rather than a dead date.
//
//   npx tsx --env-file=.env.local scripts/fore-amount-2026-09-04.ts [--apply]

import { getAdminDb } from '../src/lib/admin/admin-db'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const APPLY  = process.argv.includes('--apply')
const SOURCE = 'user_verified:fore-amount-2026-09-04'
const ID     = '3b887829-eff4-41fe-823c-3f8155755b2e'
const OFFER  = 'https://thefore.org/what-we-offer/'
const APPLYP = 'https://thefore.org/apply/'

async function main() {
  const db = getAdminDb()
  const { data: row } = await db.from('scraped_grants').select('title, amount_max, amount_undisclosed').eq('id', ID).single()
  if (row?.title !== 'The Fore Grants Programme') throw new Error(`wrong row: ${row?.title}`)
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: amount_max ${row.amount_max} undisclosed ${row.amount_undisclosed} -> 45000, false`)
  if (!APPLY) return
  const r = await mergeGrantUpdate({
    id: ID,
    fields: {
      amount_min: null, amount_max: 45000, amount_undisclosed: false,
      next_open_date: 'Three funding rounds a year. Registration for each round opens for one week; Autumn 2026 registration ran 8 to 15 July, with applications due 7 September. Watch the site for the next registration week.',
      grant_sources: [
        { url: OFFER,  label: 'What we offer (grant size), read 2026-09-04', added_at: '2026-09-04' },
        { url: APPLYP, label: 'Apply (round dates), read 2026-09-04',       added_at: '2026-09-04' },
      ],
    },
    source: SOURCE, db,
    citations: {
      amount_max:         { snippet: 'Up to £45,000 over one to three years', confidence: 'high' },
      amount_undisclosed: { snippet: 'Up to £45,000 over one to three years', confidence: 'high' },
      next_open_date:     { snippet: 'Registration is now closed for our Autumn 2026 funding round ... From 12pm (midday) on Wednesday 8th July to 12pm (midday) on Wednesday 15th July ... Application deadline for charities with a confirmed place on funding round 5pm, Monday 7th September.', confidence: 'high' },
    },
  })
  console.log('applied:', r.applied.join(', '))
  const refused = r.rejected.filter(x => x.reason !== 'idempotent')
  if (refused.length) console.log('REFUSED:', JSON.stringify(refused))
}
main().catch(e => { console.error(e); process.exit(1) })
