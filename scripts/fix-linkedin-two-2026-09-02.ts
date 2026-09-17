// Two catalogue rows that disagreed with LinkedIn posts of 2 September, each
// corrected from the funder's own page, read the same day. No model call.
//
//   JJ Charitable Trust Literacy Programme   amount £5,000 to £20,000, deadline
//     1 October 2026 (autumn round), apply_url to the application portal that
//     states both. Source: sfct.powerappsportals.com/jjapplication/.
//   PHF Teacher Development Fund             deadline 11 November 2026, apply_url
//     to the fund's own page (the row pointed at the funding index).
//
// Drapers' Charitable Fund is NOT changed: the post said £25,000, the page says
// "Grants are awarded for sums up to £20,000", which is what the row holds.
//
//   npx tsx --env-file=.env.local scripts/fix-linkedin-two-2026-09-02.ts          dry run
//   APPLY=1 npx tsx --env-file=.env.local scripts/fix-linkedin-two-2026-09-02.ts  write

import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { buildEvidencePatch, recordFieldEvidence } from '../src/lib/field-evidence'

const APPLY = process.env.APPLY === '1'
const SOURCE = 'user_verified:linkedin-check-2026-09-02'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const JJ = 'e38c97ec-04dd-4809-8d51-a42522033adb'
const TDF = 'a5b9182e-a0e1-4fc9-ad3f-4465ebc51c85'
const JJ_URL = 'https://sfct.powerappsportals.com/jjapplication/'
const TDF_URL = 'https://www.phf.org.uk/funding/teacher-development-fund/'
const Q = {
  jjAmount: 'You can apply for grants between £5,000 and £20,000 spread over a period of 1,2 or 3 years. The maximum total amount is £20,000',
  jjDeadline: 'Autumn grant round: applications by 1st October 2026',
  jjWho: 'You need to be a registered charity, Community Interest Company, Charitable Incorporated Organisation or registered as an exempt charity. Priority is given to organisations with an annual income of less than £1 million',
  tdf: 'Amount: Up to £165,000 per application Deadline: 11 November 2026 at 12 noon',
}

async function main() {
  const { data } = await db.from('scraped_grants').select('id,title,amount_min,amount_max,deadline,apply_url,eligible_structures').in('id', [JJ, TDF])
  const by = Object.fromEntries((data ?? []).map(r => [r.id, r]))
  if (by[JJ]?.amount_max !== null || by[JJ]?.deadline !== null) throw new Error('JJ moved')
  if (by[TDF]?.deadline !== null || by[TDF]?.amount_max !== 165000) throw new Error('TDF moved')
  const plans = [
    { id: JJ, name: by[JJ].title, fields: { amount_min: 5000, amount_max: 20000, deadline: '2026-10-01', apply_url: JJ_URL, eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares'] },
      ev: [
        { field: 'amount_min', quote: Q.jjAmount, source_url: JJ_URL, agrees: true },
        { field: 'amount_max', quote: Q.jjAmount, source_url: JJ_URL, agrees: true },
        { field: 'deadline', quote: Q.jjDeadline, source_url: JJ_URL, agrees: true },
        { field: 'eligible_structures', quote: Q.jjWho, source_url: JJ_URL, agrees: true },
      ] },
    { id: TDF, name: by[TDF].title, fields: { deadline: '2026-11-11', apply_url: TDF_URL },
      ev: [
        { field: 'deadline', quote: Q.tdf, source_url: TDF_URL, agrees: true },
        { field: 'amount_max', quote: Q.tdf, source_url: TDF_URL, agrees: true },
      ] },
  ]
  for (const p of plans) {
    console.log(`\n${p.name}: ${JSON.stringify(p.fields)}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: p.id, fields: p.fields, source: SOURCE, db })
    // JJ's apply_url carries admin:legacy provenance (trust 100), which
    // user_verified cannot overwrite. The trust page it holds links straight to
    // the portal, so a refused relink is reported, not fatal.
    const missing = Object.keys(p.fields).filter(f => !res.applied.includes(f) && f !== 'apply_url')
    if (res.rejected.some(r => r.field === 'apply_url')) console.log(`  apply_url kept: ${res.rejected.find(r => r.field === 'apply_url')?.reason}`)
    if (missing.length) throw new Error(`${p.name}: ${missing.join(', ')} not applied ${JSON.stringify(res.rejected)}`)
    const { patch, unquoted } = buildEvidencePatch(p.ev, { by: SOURCE })
    if (unquoted.length) throw new Error(`unquoted ${unquoted.join(',')}`)
    await recordFieldEvidence({ id: p.id, patch, db })
    console.log(`  applied: ${res.applied.join(', ')}; evidence: ${Object.keys(patch).join(', ')}`)
  }
  if (!APPLY) console.log('\nDRY RUN.')
}
main().catch(e => { console.error(e.message); process.exit(1) })
