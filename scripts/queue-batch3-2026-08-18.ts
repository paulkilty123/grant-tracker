// Three Needs-reading rows settled from their own pages. Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/queue-batch3-2026-08-18.ts [--dry]
//
// Nothing here activates a row.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')

const CHANGES = [
  {
    id: '809e464b-0cdb-46cb-b844-8eca7d4644a9',
    title: "The Grocers' Charity — registered charities only, £500k income cap",
    quote: 'We do NOT fund the following organisations: Charities with a turnover of over £500,000 (except for Medical Charities, where the limit is £15m). Non-UK registered charities (e.g. Community Interest Companies). Charities whose beneficiaries are overseas. Individuals. Places of worship.',
    fields: {
      eligible_structures: ['registered_charity', 'cio'],
      max_org_income: 500000,
    },
    note: 'CICs are excluded by name, which is unusual and worth having tagged — this is a row that would otherwise match organisations the funder will not fund. The £500k cap is ledger item A10: an income limit stated in prose with no structured value.',
  },
  {
    id: 'd347a083-1c7b-45e6-8e48-537f53c9ce12',
    title: 'The Curtin PARP Fund — rolling, and the applicant is an organisation',
    quote: 'Rolling grant fund. Max Grant Size: £7000. The Curtin PARP Fund supports individuals in Tyne and Wear and Northumberland to realise their potential. Applications for individuals must be made by voluntary or community organisations, on behalf of the individual. The applying organisation is wholly responsible for the grant.',
    fields: {
      is_rolling: true,
      eligible_structures: ['registered_charity', 'cio', 'unincorporated', 'cic_guarantee', 'ltd_guarantee', 'cooperative'],
    },
    note: 'Two things worth naming. The page SAYS "Rolling grant fund", so is_rolling here is evidenced rather than inferred from a missing deadline — the opposite of the A6 pattern. And "supports individuals" nearly cost this row a withdrawal: the beneficiary is an individual but the APPLICANT must be a voluntary or community organisation, which is squarely the catalogue audience.',
  },
  {
    id: '6c091760-ee77-4a23-b1dd-36a780751eb7',
    title: 'Nadara Sisters and North Steads Wind Farm Community Benefit Fund — missing deadline',
    quote: 'Nadara Sisters and North Steads Wind Farm Community Benefit Fund. Max Grant Size: £20000. Closing Date: 21/09/2026. Location(s): Northumberland.',
    fields: { deadline: '2026-09-21', is_rolling: false },
    note: 'The row carried no deadline at all while the funder states one 34 days out.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.quote.slice(0, 300), confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
