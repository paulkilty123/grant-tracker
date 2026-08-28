/* eslint-disable @typescript-eslint/no-explicit-any */
// Leeds Digital Inclusion Fund — the £10,000 income cap applies to one structure,
// not to every applicant.
//
// The row carries max_org_income 10000, which the eligibility check reads as "no
// organisation above £10,000 income may apply". Nearly every charity is above it,
// so a fund closing 1 Sep is being hidden from almost all of its own audience.
//
// What the funder's page actually says. Two tiers, and the threshold belongs to
// one line of one tier:
//   Grants over £5,000  — incorporated not-for-profits; registered charities.
//                         No income limit stated.
//   Grants of £5,000 or less — the same, PLUS "Small unincorporated and
//                         unregistered organisations - if annual income is less
//                         than £10,000".
//
// So £10,000 is a floor-level allowance that LETS a tiny unincorporated group in,
// not a ceiling that keeps everyone else out. Read as a gate it inverts the
// funder's intent.
//
// Cleared to null rather than corrected to a number, per the conditional-gate
// rule: a threshold that only binds under a condition we cannot express should
// leave the field null so the surface says "check required", instead of encoding
// a cap that is wrong for most applicants.
//
//   npx tsx --env-file=.env.local scripts/leeds-digital-income-gate-2026-08-28.ts --dry
//   npx tsx --env-file=.env.local scripts/leeds-digital-income-gate-2026-08-28.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const ID     = 'cd0828b8-86de-4690-87f1-a866bafcb3bd'
const SOURCE = 'user_verified:leeds-digital-income-gate-2026-08-28'
const DRY    = process.argv.includes('--dry')

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: before } = await db.from('scraped_grants')
    .select('title, is_active, deadline, amount_min, amount_max, min_org_income, max_org_income, field_provenance')
    .eq('id', ID).maybeSingle()
  const b = before as any
  console.log(`── ${b.title}  live=${b.is_active}  deadline=${b.deadline}`)
  console.log(`   before : amount ${b.amount_min}–${b.amount_max}, income gate ${b.min_org_income}–${b.max_org_income}`)
  console.log(`   held by: ${JSON.stringify(b.field_provenance?.max_org_income)}`)
  if (b.max_org_income === null) { console.log('   already cleared'); return }
  if (DRY) { console.log('   DRY — would clear max_org_income to null'); return }

  const r = await mergeGrantUpdate({
    id: ID,
    fields: { max_org_income: null },
    source: SOURCE,
    pinned: false,
    db,
    citations: {
      max_org_income: {
        snippet: 'Grants of £5,000 or less: ... Small unincorporated and unregistered organisations - if annual income is less than £10,000. Grants over £5,000: Incorporated not-for-profit organisations (e.g. CIO, CIC limited by guarantee, charitable companies). Registered charities that aren\'t an incorporated structure.',
        confidence: 'high',
        reason: 'Read from https://www.leedscf.org.uk/the-leeds-digital-inclusion-fund on 2026-08-28. The £10,000 qualifies unincorporated applicants for the small tier; it is not a ceiling on incorporated or registered applicants, who have no stated income limit.',
      },
    },
  })
  console.log(`   applied : ${JSON.stringify(r.applied)}`)
  if (r.rejected.length) console.log(`   rejected: ${JSON.stringify(r.rejected)}`)
  const { data: after } = await db.from('scraped_grants').select('max_org_income').eq('id', ID).maybeSingle()
  console.log(`   after  : max_org_income=${(after as any).max_org_income}`)
}
main().catch(e => { console.error(e.message); process.exit(1) })
