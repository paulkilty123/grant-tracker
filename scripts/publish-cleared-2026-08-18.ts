// Publishing the rows whose gate flag was a false positive — but only the ones
// that clear the real test, which is not the one I first applied.
//
// I called six rows false positives because each pointed at a page that describes
// it correctly. That is a sentence about the PAGE. The sentence about the USER is
// "could a fundraiser landing here apply", and on that test four of the six fail:
//
//   Ashoka          nomination-only: "Applicants are typically identified and
//                   nominated rather than applying"
//   Nationwide      "The source does not provide application instructions" and
//                   eligible organisation types are unknown
//   CAST            free learning resources and peer groups; no application route,
//                   no amount, no deadline
//   Baring (Arts)   no eligibility, no application steps, open_status unknown —
//                   and the row's inactive state is a deliberate prior decision
//                   (ledger C6, 11 Aug: Strengthening Civil Society live, the
//                   other two inactive)
//
//   npx tsx --env-file=.env.local scripts/publish-cleared-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/publish-cleared-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:publish-cleared-2026-08-18'

const CHANGES = [
  {
    id: 'd29103be-5800-4beb-920f-205b48a78e78',
    title: 'City Bridge Foundation — Grants for London → LIVE',
    snippet:
      'open_status open. Community-led organisations working with people in London affected by the issues they fund. Core five-year grants; the row carries £10,000 to £500,000. A real, open funder with a front door that names who may apply.',
    fields: { is_active: true, pipeline_state: 'published' },
  },
  {
    id: 'ddc93bb0-b74d-42e7-86a7-172f9a39913c',
    title: 'SSE Start Up Programme → LIVE',
    snippet:
      'open_status open. Individuals and organisations at startup or early stage developing social or environmental enterprises, selected via an application process. £1,000 to £10,000.',
    fields: { is_active: true, pipeline_state: 'published' },
  },
  {
    id: '324d3776-917a-4498-9537-27888f142f2d',
    title: 'Ashoka — recording that it is nomination-only',
    snippet:
      'Applicants are typically identified and nominated rather than applying. Nominate a social entrepreneur via the Fellowship Recommendation Form or nominate a Young Changemaker via the online nomination portal.',
    fields: { is_invite_only: true },
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
    if (r.rejected?.length) { console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
