// Impact Hub: the index says open, the programme says closed.
//
// Paul spotted the homepage first. Relinking to /programmes looked like the fix,
// because that page carries "Together for Wellbeing: A Mental Health Incubator —
// Applications now open!". He then clicked into it. The programme's own page
// says "Applications now closed", the 2026 cohort of seven was announced on
// 3 June 2026, and the programme runs June to December 2026.
//
// So the relink was a half-fix that moved the row from a page saying nothing to a
// page saying something untrue.
//
// A FUNDER'S OWN INDEX CAN ADVERTISE A CLOSED PROGRAMME AS OPEN, and this is a
// trap for the verification engine as much as for a person: a read that lands on
// the index sees "Applications now open!" in the funder's own words, quotes it,
// and records the fund as live. The quote is real. The claim is stale. Nothing in
// the engine distinguishes an index's summary of a programme from the programme's
// own status, and the index is the page more likely to be linked.
//
// Impact Hub has nothing open. Every other programme on that page — Together for
// Wellbeing 2025, ASSETS, Boosting Life Sciences & Social Economy, New Roots, The
// Circular Startup — is marked closed.
//
// So the row is hidden rather than left presenting an open door. `apply_url`
// stays on /programmes, which is the right front door for when something
// reopens, and the reopening detector built earlier today will bring the row back
// when a page there states a closing date that has not passed.
//
//   npx tsx --env-file=.env.local scripts/fix-impact-hub-2026-08-20.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-impact-hub-2026-08-20.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const ID = 'c57f8bba-b4e4-4a24-997a-90a2c59ff573'
const SOURCE = 'user_verified:impact-hub-2026-08-20'

const QUOTE =
  'london.impacthub.net/programmes/together-for-wellbeing-programme-2026, read 2026-08-20: "Applications now closed". '
  + 'The 2026 cohort of seven social enterprises was announced on 3 June 2026 and the programme runs June to December 2026. '
  + 'The /programmes index still carries "Applications now open!" for the same programme. Every other programme listed there '
  + '— Together for Wellbeing 2025, ASSETS, Boosting Life Sciences & Social Economy, New Roots, The Circular Startup — is closed.'

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', ID).limit(1)
  if (!data?.length) { console.error('row not found'); process.exit(1) }

  const brief = { ...((data[0].funder_brief ?? {}) as Record<string, unknown>) }
  brief.how_to_apply =
    'Nothing is open at present. Impact Hub London runs cohort programmes announced on '
    + 'london.impacthub.net/programmes; the most recent, Together for Wellbeing 2026, closed to applications before its '
    + 'June 2026 start. The programme page offers a sign-up to hear about future rounds. Note that the index page can '
    + 'still show a programme as open after its own page has closed.'

  const fields = {
    is_active: false,
    pipeline_state: 'between_rounds_scheduled',
    next_open_date: 'No date announced. Together for Wellbeing 2026 closed before its June 2026 start; sign up on the programme page to hear about the next cohort.',
    funder_brief: brief,
  }

  console.log(`\nImpact Hub Programmes`)
  console.log(`   → hidden as between rounds; apply_url stays on /programmes`)
  if (DRY) { console.log(`   ${JSON.stringify(fields).slice(0, 120)} (dry)\n`); return }

  const citations = Object.fromEntries(Object.keys(fields).map(k => [k, { snippet: QUOTE, confidence: 'high' as const }]))
  const r = await mergeGrantUpdate({ id: ID, fields, source: SOURCE, db, citations })
  console.log(`   applied: ${r.applied.join(', ') || '(nothing)'}`)
  if (r.rejected?.length) console.log(`   REFUSED: ${JSON.stringify(r.rejected)}`)

  const { data: after } = await db.from('scraped_grants')
    .select('title, is_active, pipeline_state, apply_url, next_open_date').eq('id', ID).limit(1)
  const a = after?.[0] as { title: string; is_active: boolean; pipeline_state: string; apply_url: string; next_open_date: string | null }
  console.log(`\n   ${a.title}: ${a.pipeline_state}, ${a.is_active ? 'LIVE' : 'hidden'}`)
  console.log(`   ${a.apply_url}`)
  console.log(`   ${a.next_open_date}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
