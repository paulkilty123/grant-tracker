// Two link-bucket rows that are not funds we can send anyone to.
//
// Runnymede Trust is a race-equality research charity. Our row claims a
// £5,000–£30,000 grants programme, and the only route the brief could find is
// "Contact the Runnymede Trust. A contact form is available on their website."
// Their site is research and policy; there is no grants programme on it.
//
// American Express Community Giving points at a US corporate-sustainability page
// (`/en-us/`) describing US disaster relief and the Leadership Academy. There is
// no route by which a UK charity applies for anything.
//
//   npx tsx --env-file=.env.local scripts/fix-link-rows-batch5-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-link-rows-batch5-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-fix-2026-08-18'

const EDITS = [
  {
    id: '6492a3f7-ab34-4109-8d1a-89b00749b173',
    title: 'Runnymede Trust — a research charity, not a grant-maker',
    snippet:
      'The Runnymede Trust site is research and policy on racial justice — its front page leads with wealth-gap statistics. No grants programme, no eligibility, no application form. Our own brief could offer only "Contact the Runnymede Trust. A contact form is available on their website" against a claimed £5,000 to £30,000 range that appears nowhere.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'non_funder: a race-equality research and policy charity, not a grant-maker. No grants programme on its site and no application route; the £5,000 to £30,000 range on this row has no source. Withdrawn 2026-08-18.',
    },
  },
  {
    id: 'ca290a3a-6f64-4fdb-a48f-e02d6b0bb1b3',
    title: 'American Express Community Giving — a US page with no UK route',
    snippet:
      'The linked page is americanexpress.com/en-us/ corporate sustainability, describing funding for disaster relief in the United States since the 1860s and the American Express Leadership Academy. No UK grants programme and no application route for a UK charity.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'out_of_scope: a US corporate-sustainability page describing US disaster relief and a leadership academy. Real philanthropy, but nothing a UK charity, CIC or social enterprise can apply for. Withdrawn 2026-08-18.',
    },
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  let applied = 0
  for (const e of EDITS) {
    console.log(`\n── ${e.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(e.fields).slice(0, 120)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(e.fields).map(k => [k, { snippet: e.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: e.id, fields: e.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`)
  }
  if (!DRY) console.log(`\nfields applied: ${applied}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
