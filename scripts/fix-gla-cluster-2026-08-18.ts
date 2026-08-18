// The GLA cluster in "the page does not describe this fund", worked 2026-08-18.
//
// Seven rows point at london.gov.uk. The domain reads fine, unlike Arts Council
// England's thirteen rows, which sit behind a bot-protection CAPTCHA that defeats
// both our fetcher and the reader proxy.
//
// What the pages actually said, none of which was a link problem:
//
//   - one fund is OPEN with a deadline five weeks out, and was sitting hidden
//   - one carried the programme's total budget as its award ceiling
//   - one is for research and business clusters, not charities, and is closed
//   - one is a single £650,000 contract whose window closed in July 2025
//   - one closed in May 2026 and may run again, so it is watched rather than shut
//   - one closed in 2024 and its successor is invitation-only
//
//   npx tsx --env-file=.env.local scripts/fix-gla-cluster-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-gla-cluster-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:link-fix-2026-08-18'

type Change = { id: string; title: string; snippet: string; fields: Record<string, unknown> }

const CHANGES: Change[] = [
  {
    id: '0d4a2ffd-1aeb-43ca-b1e9-469c2066b968',
    title: 'London Community Energy Fund — OPEN, and we were hiding it',
    snippet:
      'Deadline 30 September 2026 at 11.59pm for stream one (feasibility) and stream two (delivery). Stream one up to £10,000 per project; stream two up to £60,000. Open to small organisations with charitable aims operating in London. Expression of interest by 25 September 2026.',
    fields: { deadline: '2026-09-30', is_rolling: false },
  },
  {
    id: 'f2791500-e1cb-4cd3-ae9d-5caa399df3ca',
    title: 'Community Housing Fund — £38m is the programme, not an award',
    snippet:
      'The Fund makes £38 million available, a combination of revenue and capital funding to support building new homes. Individual award amounts are listed as negotiable. Bid closing date: ongoing.',
    fields: { amount_max: null, amount_min: null },
  },
  {
    id: '7d125541-3211-4d8c-9e76-3fd7a1d66157',
    title: 'Local Innovation Partnerships Fund — not for charities, and closed',
    snippet:
      'Supports clusters that bring together researchers, businesses and civic partners to turn near to market innovation into commercial products and services. The registration of interest stage is now closed. Minimum £2 million per bid, subject to matched-funding requirements.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'out_of_scope: a research-and-business cluster fund with a £2 million minimum bid and matched-funding requirements, not funding a UK charity, CIC or social enterprise would apply for. The registration stage is also closed. Withdrawn 2026-08-18.',
    },
  },
  {
    id: 'fdacf5af-e7bf-47c9-8837-7986c3cce7f4',
    title: 'Mental Health in Schools — one contract, window closed July 2025',
    snippet:
      'The GLA will fund one grant of £650,000, with delivery expected to take place from July 2025 to March 2027. Applications are open from 5 June 2025 to 3 July 2025.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'historical_deadline: a single £650,000 grant whose application window ran 5 June to 3 July 2025 and whose delivery period ends March 2027. One contract, already let, not a recurring fund. Withdrawn 2026-08-18.',
    },
  },
  {
    id: '65dfe2c9-4ec9-4bbc-9828-b35f292d4f5d',
    title: 'Skills for Londoners Community Outreach — closed May 2026, may return',
    snippet:
      'Applications are now closed. The deadline was Friday 22 May 2026, 12pm. Grants of £70,000 to £120,000 for 2-years delivery, to up to 28 organisations, for London-based community organisations and consortia with an annual income under £500,000. Outcomes announced August 2026.',
    fields: {
      is_active: false,
      pipeline_state: 'between_rounds_scheduled',
      amount_min: 70000,
      amount_max: 120000,
      next_open_date: 'Closed 22 May 2026 for the 2026-29 round; no date announced for the next',
    },
  },
  {
    id: '18cf82fd-32a1-4479-a42b-86f2faa08b4c',
    title: 'Hong Kong Empowerment Fund — closed 2024, successor is invitation-only',
    snippet:
      'Year 3: applications are open from Tuesday 27 February 2024 and close on Wednesday 27 March 2024 at 9am. Year 4 and 5 activities describe the Hong Kong Fund, an invitation-only fund.',
    fields: {
      is_active: false,
      pipeline_state: 'rejected',
      rejection_reason:
        'historical_deadline: the Empowerment Fund closed to applications on 27 March 2024 and the successor named on the same page, the Hong Kong Fund, is invitation-only. Nothing here a fundraiser can apply for. Withdrawn 2026-08-18.',
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
  for (const c of CHANGES) {
    console.log(`\n── ${c.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(c.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(c.fields).map(k => [k, { snippet: c.snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) {
      console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
      refused += r.rejected.length
    }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
