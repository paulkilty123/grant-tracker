// Two of the six repayable-finance rows, settled from their own pages.
// Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/loan-funds-2026-08-18.ts [--dry]
//
// Both were blocked `no_brief`. Only one of them actually wants a brief.
// KSELF says on its own page that it is paused, so it needs a state — the
// same shape as the two City Bridge programmes earlier tonight, and more
// evidence that `no_brief` means the brief is null rather than that a brief
// is the missing thing.
//
// Foundation Scotland still needs enrichment for a real brief, so it stays
// blocked. The fields written here are the ones a brief would not supply
// anyway — amounts, rolling, structures — so the row is closer to publishable
// when enrichment does run, and every value carries the page's own words.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')

const CHANGES = [
  {
    id: '23771e83-0c3c-4fd0-90a1-7ecc5c96ee6c',
    title: 'Foundation Scotland — Social Investment Fund (open, rolling)',
    quote: 'Applications: Enquire any time using the contact details provided below. Our fund can make investments of between £10,000 and £250,000 per organisation with up to 25% of this in the form of a grant... investment to social enterprises, community organisations and charities across Scotland.',
    fields: {
      is_rolling: true,
      amount_min: 10000,
      amount_max: 250000,
      eligible_structures: ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'unincorporated'],
    },
    note: 'Rolling is evidenced by "Enquire any time", not inferred from a missing deadline.',
  },
  {
    id: 'e1073daf-2f51-497d-a700-54ef00c2c5fd',
    title: 'Kent Social Enterprise Loan Fund (KSELF) — paused',
    quote: 'The Kent Social Enterprise Loan Fund is currently paused for applications.',
    fields: {
      pipeline_state: 'between_rounds_scheduled',
      is_active: false,
      next_open_date: 'Paused for applications, per the funder\'s own page. No restart date given.',
    },
    note: 'between_rounds_scheduled rather than archived so migration 057 enrols Kent Community Foundation on the watchlist; the page gives no restart date, so the watchlist is the return path.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    console.log(`   ${c.note}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields)
        .filter(k => !['pipeline_state', 'is_active'].includes(k))
        .map(k => [k, { snippet: c.quote.slice(0, 300), confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
