// Clearing the last two `amount_ungrounded` rows in Live and wrong.
//
// The flag is about OUR text, not the funder's: enrich-grant compares the
// write-up against the citation and stores the figures it could not ground. So
// the fix is to stop claiming what the page does not say, and only then to drop
// the stored list — never the other way round, or the row simply stops reporting
// a claim it is still making.
//
// Beinneun's £5,000 was in fact grounded — "grants under £5,000" is on the page —
// so the checker was half right. £164,439 is not, and neither is any per-applicant
// ceiling. The rewrite also names the £500,000 as the FUND's annual size rather
// than an award, which is the error that ran through this whole evening: a pot
// read as a grant.
//
// Sainsbury publishes no range at all. Its figures come from a past-awards list,
// which is not the same claim, and the fund takes no unsolicited applications.
//
//   npx tsx --env-file=.env.local scripts/fix-ungrounded-prose-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-ungrounded-prose-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:amount-grounding-2026-08-18'

const EDITS = [
  {
    id: 'd83e1ad9-b8d5-4367-8a26-0fed8b5698f4',
    label: 'Beinneun — drop the £164,439, keep what the page states',
    typical_award:
      'No per-applicant ceiling is stated. Governance costs are supported under the Single Year strand at under £5,000. '
      + 'The fund receives approximately £500,000 a year from Beinneun Wind Farm Ltd for the operational life of the wind farm, '
      + 'which is the size of the fund rather than the size of an award.',
    snippet:
      'An annual payment of approximately £500,000 is available for the operational life of the wind farm. An application can be made to the fund through the Single Year strand (grants under £5,000).',
  },
  {
    id: '05d6dbdf-d370-4d34-9a5b-80540e3b06fa',
    label: 'Sainsbury — say that no range is published',
    typical_award:
      'The funder publishes no award range. The figures visible on its site are past awards, which ran from about £5,000 to £50,000, '
      + 'most commonly £10,000 to £30,000. It states that it does not accept unsolicited applications.',
    snippet:
      'WE DO NOT ACCEPT UNSOLICITED APPLICATIONS. The site lists past awards rather than a published range: smallest £5,000, largest £50,000, most commonly £10,000 to £30,000.',
  },
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  let applied = 0
  let refused = 0

  for (const e of EDITS) {
    const { data } = await db.from('scraped_grants').select('funder_brief').eq('id', e.id).single()
    const brief = { ...((data?.funder_brief ?? {}) as Record<string, unknown>) }
    brief.typical_award = e.typical_award
    delete brief._ungrounded_amounts

    console.log(`\n── ${e.label}`)
    if (DRY) { console.log(`   typical_award → ${e.typical_award.slice(0, 90)}… (dry)`); continue }
    const r = await mergeGrantUpdate({
      id: e.id,
      fields: { funder_brief: brief },
      source: SOURCE,
      db,
      citations: { funder_brief: { snippet: e.snippet, confidence: 'high' } },
    })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) { console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`); refused += r.rejected.length }
  }
  if (!DRY) console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
