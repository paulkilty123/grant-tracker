// Aldi Scottish Sport Fund: show WHEN IT OPENS, not a deadline nine months out.
//
// The North-East / Highlands and Islands window runs 11 May to 7 June each year.
// The row carried deadline 2027-06-07, which is true and useless: a card showing
// a closing date reads as a fund you can apply to now, and this one cannot be
// applied to until May.
//
// The card only renders "Opens ..." when there is NO deadline — see
// `deadlineDisplay` in the search page and `formatNextOpen` in utils. So the
// deadline is cleared and the opening date carries the timing instead. The
// deadline is not lost: `deadline_cycle` still holds the 7 June close, and
// `check-coming-soon` routes the row back into review on 11 May 2027, which is
// when a real closing date should be set from the funder's page.
//
// The next_open_date text is rewritten because the old one, "This region opens
// 11 May each year", has no YEAR in it. `formatNextOpen` needs month + 4-digit
// year, so it fell through to "Closed — check funder" — the true thing, but not
// the useful one.
//
// Paul, 2026-08-19, choosing this over hiding the row: "a Scottish sports club
// planning next season would never learn the fund exists."
//
//   npx tsx --env-file=.env.local scripts/aldi-opens-not-deadline-2026-08-19.ts --dry
//   npx tsx --env-file=.env.local scripts/aldi-opens-not-deadline-2026-08-19.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const ID = '5eff1abd-978d-442e-8f7c-01d59b541f42'
const SOURCE = 'user_verified:aldi-opens-not-deadline-2026-08-19'

const SNIPPET =
  'Run a sports club in Scotland? Apply for up to £3,000 in funding. Applications open by region: NE, '
  + 'Highlands & Islands (postcode areas AB, IV, PH, KW, ZE, HS) are open from Monday 11th May to Sunday 7th June. '
  + 'The window is annual, so the next one for this region opens 11 May 2027.'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const fields: Record<string, unknown> = {
    deadline: null,
    next_open_date: 'Applications for this region open on 11 May 2027 and close on 7 June 2027.',
    next_open_date_parsed: '2027-05-11',
    is_active: true,
  }

  if (DRY) { console.log(JSON.stringify(fields, null, 2), '(dry)'); return }

  const citations = Object.fromEntries(
    Object.keys(fields).map(k => [k, { snippet: SNIPPET, confidence: 'high' as const }]),
  )
  const r = await mergeGrantUpdate({ id: ID, fields, source: SOURCE, db, citations })
  console.log(`applied:  ${JSON.stringify(r.applied)}`)
  if (r.rejected?.length) console.log(`REFUSED:  ${JSON.stringify(r.rejected)}`)

  const { data } = await db.from('scraped_grants')
    .select('title, deadline, next_open_date, next_open_date_parsed, deadline_cycle, is_active, is_rolling, pipeline_state')
    .eq('id', ID).limit(1)
  console.log('\nnow:', JSON.stringify(data?.[0], null, 2))
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
