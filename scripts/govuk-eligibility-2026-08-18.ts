// eligible_structures for the three gov.uk rows kept earlier tonight. Their
// pages were already read for the withdrawal pass; this fills the one gap that
// was left. Approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/govuk-eligibility-2026-08-18.ts [--dry]
//
// WHY TAG AT ALL, when none of these pages enumerates a legal structure.
//
// `eligible_structures` empty is not neutral. deriveReviewReasons calls it
// critical — "no legal structures are tagged, so this cannot match anyone
// correctly" — and on a live row it renders as an unqualified eligible tick,
// which is ledger item A1. So leaving it null is itself an assertion, and a
// worse one than the alternative.
//
// What is being recorded here is the ABSENCE OF A RESTRICTION, not an invented
// list: each page invites organisations and none narrows by legal form. That is
// why individuals and sole traders are excluded throughout — every one of these
// is addressed to organisations, and two are commissions with consortium bids.
// Where a page DID narrow (Defra, addressed to farmers and land managers via
// the Rural Payments Service) the row is left untagged for Paul.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')

// Organisational forms, no individuals. Matches the shape used by comparable
// live rows elsewhere in the catalogue.
const ORGS = ['registered_charity', 'cio', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative']

const CHANGES = [
  {
    id: 'ca11a595-5a4b-4e00-a926-fadcf4b8c218',
    title: 'Child Focused Court IDVA — Cheshire & Merseyside',
    quote: 'the Commissioner, is seeking a delivery partner to support the provision of independent and specialist domestic abuse assessment and support... Both individual and consortium bids will be considered.',
    fields: { eligible_structures: ORGS },
    note: '"Individual bids" here means a single organisation bidding alone rather than in consortium, not a natural person. Specialist domestic abuse charities are the intended deliverer.',
  },
  {
    id: 'b3d10128-b913-4815-8e7d-5d8118698c14',
    title: "DCMS 'Connections Through Gaming' Pilot Fund",
    quote: 'DCMS is providing up to £773,000 in grant funding to test an innovative three-year Connections through Gaming pilot... The pilot is primarily an in-person programme, expected to take place in youth-focused environments with support from trusted adults.',
    fields: { eligible_structures: ORGS },
    note: 'Youth organisations are the intended delivery partners. Amount left alone: 648,000 is the pot across "one or more" partners, flagged in the earlier pass.',
  },
  {
    id: '4ffd8693-6a2e-4f41-9818-82328bde7e1e',
    title: 'Debt Advice Modernisation and Transformation Fund',
    quote: 'All applicants must reconfirm that they: operate within the debt advice sector or directly support the delivery of free-to-client debt advice in England, where delivering regulated debt advice, hold appropriate Financial Conduct Authority (FCA) authorisation.',
    fields: { eligible_structures: ORGS },
    note: 'Already flagged is_invite_only earlier tonight: only prior MaPS grantees may lead a bid. Closes 19 Aug, so this tagging is bookkeeping rather than a route to an application.',
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
    const citations = { eligible_structures: { snippet: c.quote.slice(0, 300), confidence: 'high' as const } }
    const r = await mergeGrantUpdate({ id: c.id, fields: c.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    if (r.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(r.rejected)}`)
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
