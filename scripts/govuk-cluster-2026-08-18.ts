// The six gov.uk grants-finder rows in the Needs-reading / Nothing-truthful
// lot, each read against its own page. Approved by Paul, 2026-08-18.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/govuk-cluster-2026-08-18.ts [--dry]
//
// Writes reports/govuk-cluster-2026-08-18.json before touching anything.
// NOTHING HERE ACTIVATES A ROW.
//
// Three of the six are left alone on purpose, and the reasons are in KEPT below
// — two because they are real and relevant and want a brief rather than a
// verdict, one because it is a genuine judgement about who a land-based scheme
// is for. Recording them here so "not in this script" does not read as "not
// looked at".
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { writeFileSync } from 'node:fs'

const SOURCE = 'user_verified:needs-reading-2026-08-18'
const DRY = process.argv.includes('--dry')
const REPORT = 'reports/govuk-cluster-2026-08-18.json'

const WITHDRAW = [
  {
    id: 'b356c693-c1ac-4361-8d11-8969ef369bcb',
    title: 'Purchase mid-range equipment for biomedical research: MRC Equip',
    reason: 'applicant_not_social_sector',
    quote: 'To be eligible to apply for this UK Research and Innovation (UKRI) funding opportunity you must be a researcher or research technical professional employed by an eligible research organisation.',
  },
  {
    id: 'd29c32d9-92c6-497e-8aa7-ce04952002d7',
    title: 'Resilient economy and security through ecosystem transitions (NERC)',
    reason: 'applicant_not_social_sector',
    quote: 'This funding opportunity is open to research groups and individuals... welcome applications from individuals at any career stage, subject to NERC eligibility criteria.',
  },
]

const CORRECT = [
  {
    id: '4ffd8693-6a2e-4f41-9818-82328bde7e1e',
    title: 'Debt Advice Modernisation and Transformation Fund — closed cohort',
    quote: 'This funding opportunity is restricted to organisations that have previously received grant funding from MaPS. The lead applicant organisation must: have been a lead grant recipient of either: the Debt Advice Modernisation Fund (DAMF) 2024/25 or 2025/26, or the Debt Advice Transformation Fund (DATF) 2025/26',
    fields: { is_invite_only: true },
    note: 'Not invite-only in the letter-through-the-door sense, but functionally closed: only prior MaPS grantees may lead a bid. Closes 19 Aug, one day out. Amounts (£25k-£100k) already match the page and are left alone.',
  },
]

// Read, judged relevant, deliberately unchanged. No writes for these.
const KEPT = [
  {
    id: 'ca11a595-5a4b-4e00-a926-fadcf4b8c218',
    title: 'Child Focused Court IDVA — Cheshire & Merseyside',
    why: 'Real and relevant. The PCC is "seeking a delivery partner" for specialist domestic abuse support and says "Both individual and consortium bids will be considered" — specialist DA charities are exactly the intended applicant. Closes 4 Sep. Wants a brief and geography, not a verdict.',
    caution: 'amount_max is 609,957, which is the value of the whole commission. Left alone rather than guessed at.',
  },
  {
    id: 'b3d10128-b913-4815-8e7d-5d8118698c14',
    title: "DCMS 'Connections Through Gaming' Pilot Fund",
    why: 'Real and relevant. Youth organisations are the intended delivery partners, boys 11-16 experiencing loneliness. Closes 11 Sep. Wants a brief and sector tags.',
    caution: 'amount_max is 648,000, which the page calls "up to £648,000 in grant funding for programme delivery" across "one or more" delivery partners. That is a POT read as a per-applicant ceiling. Flagged, NOT rewritten: amounts are propose-only in this repo.',
  },
  {
    id: '5e627d36-0816-47cc-acf6-6ed0dd8fd5aa',
    title: 'Capital Grants 2026 (Defra)',
    why: 'A genuine judgement rather than a lookup. The page is addressed to "farmers and land managers" and applications go through the Rural Payments Service, which reads as outside the catalogue audience — but land-holding conservation charities and wildlife trusts do hold these agreements. Withdrawing it on the wording alone would be judging by appearance. Left for Paul.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const ids = [...WITHDRAW.map(r => r.id), ...CORRECT.map(r => r.id)]
  const { data: before } = await db
    .from('scraped_grants')
    .select('id, title, funder, is_active, pipeline_state, rejection_reason, is_invite_only, deadline, amount_min, amount_max')
    .in('id', ids)

  if (!DRY) {
    writeFileSync(REPORT, JSON.stringify({
      written_at_utc: new Date().toISOString(),
      approved_by: 'Paul, 2026-08-18',
      withdraw: WITHDRAW, correct: CORRECT, kept_unchanged: KEPT, before,
    }, null, 2))
    console.log(`report → ${REPORT}`)
  }

  for (const r of WITHDRAW) {
    console.log(`\n── WITHDRAW ${r.title}`)
    if (DRY) { console.log('   (dry)'); continue }
    const res = await mergeGrantUpdate({
      id: r.id,
      fields: { pipeline_state: 'rejected', rejection_reason: r.reason, is_active: false },
      source: SOURCE, db,
    })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }

  for (const r of CORRECT) {
    console.log(`\n── CORRECT ${r.title}`)
    if (DRY) { console.log(`   ${JSON.stringify(r.fields)} (dry)`); continue }
    const citations = Object.fromEntries(
      Object.keys(r.fields).map(k => [k, { snippet: r.quote.slice(0, 300), confidence: 'high' as const }]),
    )
    const res = await mergeGrantUpdate({ id: r.id, fields: r.fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(res.applied)}`)
    if (res.rejected?.length) console.log(`   REJECTED: ${JSON.stringify(res.rejected)}`)
  }

  console.log(`\nKept unchanged, read and judged relevant: ${KEPT.length}`)
  for (const k of KEPT) console.log(`  · ${k.title}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
