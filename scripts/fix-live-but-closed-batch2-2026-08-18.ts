// Live rows with no deadline whose funder page says the fund is shut.
//
// The sharp half of the 27: a row with a future deadline still tells a user
// something, even if its brief text is stale. These told users nothing and were
// live, so a fundraiser could reach them, find nothing to apply to, and have no
// idea when to come back.
//
// Each quote below is from the funder's own page today, not from our brief.
//
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-batch2-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-live-but-closed-batch2-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:live-but-closed-2026-08-18'

const EDITS: { url: string; title: string; snippet: string; fields: Record<string, unknown> }[] = [
  {
    url: 'https://ashden.org/awards/',
    title: 'Ashden Awards — entries closed',
    snippet: 'Entries for this year\'s awards are now closed, but you can already register your interest for our next prizes.',
    fields: { is_active: false, is_rolling: false, pipeline_state: 'between_rounds_scheduled' },
  },
  {
    url: 'https://www.gmmayorscharity.org.uk/apply',
    title: 'GM Mayor\'s Charity — all four programmes closed',
    snippet: 'Seeding the Christmas Big Give: CLOSED FOR APPLICATIONS. Autumn Small Grants Programme: CLOSED FOR APPLICATIONS. Spring/Summer Small Grants Programme: CLOSED FOR APPLICATIONS. Live Well Communities Fund: CLOSED FOR APPLICATIONS. Check back soon.',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' },
  },
  {
    url: 'https://www.heartofenglandcf.org/birmingham-black-country-communities-fund/',
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
    url: 'https://oxfordshire.org/ocf_grants/thriving-in-nature-fund-2/',
    title: 'Oxfordshire Thriving in Nature — EOI stage closed',
    snippet: 'Now closed to Expressions of Interest. Applicants will be notified of the outcome of their EOI on 16th June 2026. This is the third year of the fund; no fourth year is announced.',
    fields: { is_active: false, pipeline_state: 'between_rounds_scheduled' },
  },
  {
    url: 'https://pixelfund.org.uk/',
    title: 'Pixel Fund — temporarily closed, backlog',
    snippet: 'We have temporarily closed to new applications and have therefore removed the contact form at the bottom of this page. Once the backlog is cleared, we will open again. Notice dated 4 February 2026.',
    fields: {
      is_active: false,
      is_rolling: false,
      pipeline_state: 'between_rounds_scheduled',
      next_open_date: 'Reopens once the funder has cleared its backlog; no date given',
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  let applied = 0
  let refused = 0
  for (const e of EDITS) {
    const { data } = await db.from('scraped_grants').select('id').eq('apply_url', e.url).maybeSingle()
    console.log(`\n── ${e.title}`)
    if (!data?.id) { console.log(`   NOT FOUND for ${e.url}`); continue }
    if (DRY) { console.log(`   ${JSON.stringify(e.fields).slice(0, 140)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: data.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
