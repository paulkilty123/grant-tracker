/* eslint-disable @typescript-eslint/no-explicit-any */
// Hull Community Fund — clear the pin holding £250,000 on the second live row.
//
// The sibling row was corrected to £10,000 on 2026-08-28 from the funder's page.
// This row refused that write: amount_max is pinned by admin:paulkilty1@gmail.com,
// set 2026-07-22, trust 100. That is four days before the form-save pinning cause
// was fixed on 26 Jul, so it is one of the artefacts — the Grant Manager sent its
// whole form state on save and update-grant pinned every field on screen, looked
// at or not. Paul cleared it explicitly on 2026-08-28.
//
// admin: is used because it is the only source that gets past a pin, and
// pinned:false so this does not rebuild the same trap on the way out.
//
//   npx tsx --env-file=.env.local scripts/hull-clear-pin-2026-08-28.ts --dry
//   npx tsx --env-file=.env.local scripts/hull-clear-pin-2026-08-28.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID     = '49d410cd-2107-421e-b35b-158793a21c0e'
const SOURCE = 'admin:hull-turnover-ceiling-2026-08-28'
const DRY    = process.argv.includes('--dry')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: before } = await db.from('scraped_grants')
    .select('title, amount_max, is_active, field_provenance').eq('id', ID).maybeSingle()
  const b = before as any
  console.log(`── ${b.title}  live=${b.is_active}`)
  console.log(`   before : amount_max=${b.amount_max}`)
  console.log(`   held by: ${JSON.stringify(b.field_provenance?.amount_max)}`)
  if (b.amount_max === 10000) { console.log('   already corrected'); return }
  if (DRY) { console.log('   DRY — would write amount_max 10000 as admin, pinned:false'); return }

  const r = await mergeGrantUpdate({
    id: ID,
    fields: { amount_max: 10000 },
    source: SOURCE,
    pinned: false,
    db,
    citations: {
      amount_max: {
        snippet: 'You can apply for either an activity grant (up to £2,000) to help address a gap in provision or a Organisational Development grant (up to £10,000). Hull Community Fund grants are targeted at small organisations (under £250,000 turnover) with charitable aims.',
        confidence: 'high',
        reason: 'Read from https://tworidingscf.org.uk/fund/hull-community-fund/ on 2026-08-28. £250,000 is the applicant turnover ceiling and is already held in max_org_income.',
      },
    },
  })
  console.log(`   applied : ${JSON.stringify(r.applied)}`)
  if (r.rejected.length) console.log(`   rejected: ${JSON.stringify(r.rejected)}`)

  const { data: after } = await db.from('scraped_grants')
    .select('amount_max, field_provenance').eq('id', ID).maybeSingle()
  const a = after as any
  console.log(`   after  : amount_max=${a.amount_max}  pinned=${a.field_provenance?.amount_max?.pinned}`)

  // Both live copies must agree, or the fix has only moved the problem.
  const { data: all } = await db.from('scraped_grants')
    .select('id, amount_max, is_active').ilike('title', 'Hull Community Fund')
  console.log('   both copies:', JSON.stringify((all ?? []).map((r2: any) => ({ live: r2.is_active, max: r2.amount_max }))))
}
main().catch(e => { console.error(e.message); process.exit(1) })
