// The two the URL lookup could not reach, addressed by id.
//
// A NOTE ON WHY THE LAST SCRIPT MISSED ONE. It resolved rows with
// `.eq('apply_url', url).maybeSingle()`, and maybeSingle returns null when MORE
// than one row matches, not only when none does. The Heart of England fund has
// THREE rows on one URL — two archived, one live — so the script printed "NOT
// FOUND" for a row that exists and is live. Ambiguity reported as absence is the
// same failure shape as a truncated window reported as a full one: the query
// answered a different question and the wording hid it.
//
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-batch3-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-batch3-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:live-but-closed-2026-08-18'

const EDITS = [
  {
    id: 'e50c4cb8-d335-448c-857d-dc92837ccf84',
    title: 'Heart of England Birmingham & Black Country — reopens September 2026',
    snippet: 'This fund is currently closed due to unprecedented demand. We expect to reopen applications in September 2026.',
    fields: {
      is_active: false,
      is_rolling: false,
      pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Expected to reopen September 2026',
      next_open_date_parsed: '2026-09-01',
    },
  },
  {
    id: 'b959ee0d-0000-0000-0000-000000000000',   // resolved by title+funder below
    title: 'Suffolk Harwich Haven Fund — opening September 2026',
    snippet: 'Grant opens: Opening September 2026. Maximum grant available £5,000. Grants of up to £5,000 per year for up to 3 years for charitable, voluntary and community groups.',
    fields: {
      is_active: false,
      is_rolling: false,
      pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Opening September 2026',
      next_open_date_parsed: '2026-09-01',
      amount_max: 5000,
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: hh } = await db.from('scraped_grants')
    .select('id').eq('apply_url', 'https://suffolkcf.org.uk/grants/harwich-haven-authority-fund/')
    .eq('is_active', true).limit(1)
  if (hh?.[0]?.id) EDITS[1].id = hh[0].id
  else { console.log('(Harwich Haven live row not found — skipping)'); EDITS.splice(1, 1) }

  let applied = 0
  let refused = 0
  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(e.fields).slice(0, 140)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
