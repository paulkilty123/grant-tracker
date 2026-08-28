/* eslint-disable @typescript-eslint/no-explicit-any */
// Hull Community Fund — £250,000 is the applicant's turnover ceiling, not the grant.
//
// Two LIVE rows both advertise amount_max 250000 on a fund closing 7 Sep at noon.
// The funder's page says:
//   "You can apply for either an activity grant (up to £2,000) to help address a
//    gap in provision or a Organisational Development grant (up to £10,000)."
//   "Hull Community Fund grants are targeted at small organisations (under
//    £250,000 turnover) with charitable aims..."
//
// So an eligibility ceiling was extracted into the grant size, and the duplicate
// means it is being shown twice. Both rows are corrected, because either may be
// the one a user sees.
//
// NOT de-duplicated here. The pair is not a slip: the two rows come from two
// different pipelines that both catalogue Two Ridings funds under the same
// source name, with different id schemes —
//   crawl.ts crawlTwoRidingsCF  -> two_ridings_cf_<slug>          (27 Jul row)
//   cf-fund-extract.ts          -> cf_fund:<config>:<fund name>   (20 Jul row)
// Hiding either invites its own producer to recreate it on the next run. Which
// pipeline owns CF funds is a decision, not a cleanup.
//
//   npx tsx --env-file=.env.local scripts/hull-community-fund-amount-2026-08-28.ts --dry
//   npx tsx --env-file=.env.local scripts/hull-community-fund-amount-2026-08-28.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const IDS    = ['49d410cd-2107-421e-b35b-158793a21c0e', 'b06af7a3-a1be-4572-a259-70260f20d8b6']
const SOURCE = 'user_verified:hull-community-fund-2026-08-28'
const DRY    = process.argv.includes('--dry')

const CITATION = {
  snippet: 'You can apply for either an activity grant (up to £2,000) to help address a gap in provision or a Organisational Development grant (up to £10,000). Hull Community Fund grants are targeted at small organisations (under £250,000 turnover) with charitable aims.',
  confidence: 'high' as const,
  reason: 'Read from https://tworidingscf.org.uk/fund/hull-community-fund/ on 2026-08-28. The £250,000 previously in amount_max is the applicant turnover ceiling in the second sentence, not a grant size.',
}

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  for (const id of IDS) {
    const { data: before } = await db.from('scraped_grants')
      .select('title, is_active, amount_min, amount_max, max_org_income, external_id, deadline').eq('id', id).maybeSingle()
    const b = before as any
    if (!b) { console.log(`${id}: NOT FOUND`); continue }
    console.log(`── ${b.title}  [${b.external_id}]`)
    console.log(`   before: ${b.amount_min} – ${b.amount_max}  live=${b.is_active}  deadline=${b.deadline}  max_org_income=${b.max_org_income}`)
    if (b.amount_max === 10000) { console.log('   already corrected'); continue }
    if (DRY) { console.log('   DRY — would write amount_max 10000, and max_org_income 250000'); continue }

    const r = await mergeGrantUpdate({
      id,
      // The turnover ceiling is real and belongs in the income gate, where the
      // matcher can use it, rather than being thrown away with the wrong figure.
      fields: { amount_min: null, amount_max: 10000, max_org_income: 250000 },
      source: SOURCE,
      pinned: false,
      db,
      citations: { amount_min: CITATION, amount_max: CITATION, max_org_income: CITATION },
    })
    console.log(`   applied : ${JSON.stringify(r.applied)}`)
    if (r.rejected.length) console.log(`   rejected: ${JSON.stringify(r.rejected)}`)
    const { data: after } = await db.from('scraped_grants').select('amount_min, amount_max, max_org_income').eq('id', id).maybeSingle()
    const a = after as any
    console.log(`   after : ${a.amount_min} – ${a.amount_max}  max_org_income=${a.max_org_income}`)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })
