// The five Arts Council of Wales rows in Needs-reading, each read against its
// own page. Approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/acw-cluster-2026-08-18.ts [--dry]
//
// Writes reports/acw-cluster-2026-08-18.json first. NOTHING HERE ACTIVATES A ROW.
//
// THE POINT OF THIS ONE: the three Creative Learning funds look interchangeable
// — same funder, same family of pages, same small awards, all five rows carrying
// the identical pair of gaps (no_deadline, eligibility_missing). They are not
// interchangeable. Go and See and Experiment are open to state-maintained
// schools ONLY; Have a Go admits "arts and cultural organisations in Wales"
// alongside schools. A bulk judgement across the cluster gets one of the three
// wrong whichever way it goes.
//
// eligible_structures values are taken from this funder's OWN live rows
// (Create and Engage, Project Investment) rather than invented, so the cluster
// stays internally consistent.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { writeFileSync } from 'node:fs'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')

const ORGS = ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'ltd_shares', 'cooperative']
const ORGS_AND_INDIVIDUALS = [...ORGS, 'sole_trader', 'individual']

const WITHDRAW = [
  {
    id: '1c1c047e-bf3d-4f48-b9b8-a4e6fc3b1be7',
    title: 'Arts Council of Wales — Go and see',
    reason: 'applicant_not_social_sector',
    quote: 'The Go and See Fund offers grants up to £1,000 to enable teachers in state-maintained schools in Wales to take their learners to see high-quality art in venues across Wales.',
  },
  {
    id: 'e5fa6087-9dc3-4ae1-9876-c0d73339c674',
    title: 'Arts Council of Wales — Experiment',
    reason: 'applicant_not_social_sector',
    quote: 'Experiment is open to state-maintained schools in Wales, including: Primary schools, Secondary schools, Voluntary-aided schools, Special schools, Pupil Referral Units (PRUs). Unfortunately, independent schools are not eligible to apply.',
  },
  {
    id: '2faeeaab-2e1b-4b7b-a819-4056a95a7633',
    title: 'Arts Council of Wales — Arts Capital Investment',
    reason: 'round_closed_2026-07',
    quote: 'If the recent weather has affected your ability to submit your application to the Arts Capital Investment Fund by the original deadline of 12 noon on Friday 3 July, please contact us as soon as possible... We will consider requests for an extension until midnight on Sunday 5 July.',
    caution: 'This row also carries amount_max = 8,000,000, which the page calls "we expect to award up to £8million in funding for capital projects" — the whole programme pot, not a per-applicant ceiling. The page\'s only per-applicant figure is scoping grants up to £15,000. NOT corrected here, because amounts are propose-only and the row is being withdrawn; recorded so the figure does not come back with the row if a future round revives it.',
  },
]

const CORRECT = [
  {
    id: 'b774d28f-4f07-4ebd-8702-8f3c3e0cfe5a',
    title: 'Arts Council of Wales — Have a Go',
    quote: 'The fund offers grants of up to £1,500 and applications can be made by state-maintained schools, pupil referral units and/or arts and cultural organisations in Wales.',
    fields: { eligible_structures: ORGS },
    note: 'The one Creative Learning fund of the three a charity or CIC can actually apply to. Organisations only, so no sole_trader or individual.',
  },
  {
    id: '13837671-a3eb-4045-a5e7-2a7bf2951f4d',
    title: 'Arts Council of Wales — International Opportunities Fund',
    quote: 'Who can apply? Arts organisations and individual creative professionals based in Wales.',
    fields: { eligible_structures: ORGS_AND_INDIVIDUALS },
    note: 'Individuals named explicitly, so this matches the funder\'s Create and Engage set. Existing amount_max of £7,500 already agrees with the page ("Up to £7,500") and is left alone.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const ids = [...WITHDRAW.map(r => r.id), ...CORRECT.map(r => r.id)]
  const { data: before } = await db
    .from('scraped_grants')
    .select('id, title, is_active, pipeline_state, rejection_reason, eligible_structures, amount_min, amount_max, deadline')
    .in('id', ids)

  if (!DRY) {
    writeFileSync('reports/acw-cluster-2026-08-18.json', JSON.stringify({
      written_at_utc: new Date().toISOString(),
      approved_by: 'Paul, 2026-08-18',
      withdraw: WITHDRAW, correct: CORRECT, before,
    }, null, 2))
    console.log('report → reports/acw-cluster-2026-08-18.json')
  }

  for (const r of WITHDRAW) {
    console.log(`\n── WITHDRAW ${r.title}  (${r.reason})`)
    if (DRY) { console.log('   (dry)'); continue }
    const res = await mergeGrantUpdate({
      id: r.id,
      fields: { pipeline_state: 'rejected', rejection_reason: r.reason, is_active: false },
      source: SOURCE, db,
    })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }

  for (const r of CORRECT) {
    console.log(`\n── TAG ${r.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(r.fields)} (dry)`); continue }
    const citations = { eligible_structures: { snippet: r.quote, confidence: 'high' as const } }
    const res = await mergeGrantUpdate({ id: r.id, fields: r.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
