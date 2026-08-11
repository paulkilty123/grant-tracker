// One-off: triage of the six live rows advertising an already-passed reopen
// date (2026-08-11). Each change is evidenced by a verbatim quote from the
// funder's own page, fetched the same day, and written through mergeGrantUpdate
// so the trust ladder and provenance apply.
//
//   npx tsx scripts/apply-reopen-triage.ts [--dry]
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:reopen-triage-2026-08-11'
const DRY = process.argv.includes('--dry')

type Change = { id: string; title: string; snippet: string; fields: Record<string, unknown> }

const CHANGES: Change[] = [
  {
    id: '1fc7173e-a9af-4efc-bc1d-92c592fd6b2c',
    title: 'King Charles III Charitable Fund — Small Grants',
    snippet: 'The small grants programme is currently open. The application window will close at 12 noon on the 19th August, for the Education and Heritage Conservation funding themes.',
    // Open with a real deadline eight days out. "5 August 2026" described a
    // window that has already opened, so as displayed it is now misleading.
    fields: { deadline: '2026-08-19', next_open_date: null, next_open_date_parsed: null },
  },
  {
    id: '33bac7f6-8b8f-44f5-8ab6-55141aac452c',
    title: 'Environment & Sustainability Grants (Heathrow)',
    snippet: 'For 2026, round 2/2 opens on 2 July and closes on 3 September, decisions announced 14 October, for grants of up to £15,000.',
    fields: { deadline: '2026-09-03', next_open_date: null, next_open_date_parsed: null },
  },
  {
    id: 'ae1bbd08-1216-43fc-9ff3-218543f08925',
    title: 'Projects for Young People Grants (Heathrow)',
    snippet: 'For 2026, round 2/2 will open on 16 July and close on 10 September, with decisions announced on 2 December, for grants up to £15,000.',
    // deadline 2026-09-10 is already correct; only the stale marker goes.
    fields: { next_open_date: null, next_open_date_parsed: null },
  },
  {
    id: '5147342c-5490-4a88-91de-354e1f3cfed3',
    title: 'HAPi & Matched Funding (Heathrow)',
    snippet: 'Our Heathrow Active People Initiative (HAPi) and Matched Funding programmes for Heathrow colleagues have two rounds in 2026, round 2/2 opens on 16 July and closes on 29 October, with decisions announced on 17 December.',
    fields: { next_open_date: null, next_open_date_parsed: null },
  },
  {
    id: '057225d1-6b86-4341-b2df-766f3851ee62',
    title: 'Community Grant Programme (National Grid)',
    snippet: 'our application window for the September panel has now closed. You can still submit an application via the button below, but please note that you will not receive a final decision until the December 2026 panel.',
    // Still accepting applications, so the row stays live and rolling. Only the
    // stale 2026-07-30 marker is cleared.
    fields: { next_open_date: null, next_open_date_parsed: null },
  },
  {
    id: '7430666a-27b7-4f34-884a-f293d438c5a7',
    title: 'BCG UK Social Enterprise Award',
    snippet: 'Applications have now closed for 2026. Register Interest for 2027. The BCG UK Social Enterprise Award is one of the ways BCG’s belief in social impact comes to life in the UK.',
    // The only genuinely closed one. is_active=false plus a reopen date sends it
    // to between_rounds_scheduled under the transition fixed today.
    fields: { is_active: false, next_open_date: '2027 (register interest)', next_open_date_parsed: '2027-01-01' },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    console.log(`   ${JSON.stringify(c.fields)}`)
    if (DRY) { console.log('   (dry run, not written)'); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
