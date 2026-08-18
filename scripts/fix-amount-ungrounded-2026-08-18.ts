// The three `amount_ungrounded` rows in Live and wrong.
//
// The code reads `funder_brief._ungrounded_amounts`, which enrich-grant computes
// by comparing OUR write-up against the citation. It is stored, not recomputed,
// so correcting an amount never clears it — the same permanent-mark shape the
// module already documents for `knowledge_fallback`.
//
// National Churches Trust is the instructive one. Its brief said "Large Grants:
// average £21,000 (£80,000+)" and the row was flagged for the £80,000. The page
// says "up to £50,000", average "in the region of £21,000" — and £80,000 is the
// PROJECT COST threshold: "major urgent and structural repair projects costing
// over £80,000". A cost threshold read as a grant ceiling, which is the same
// mistake as a programme total read as an award, arriving from a third direction.
//
// Beinneun is the opposite: the flag was right and the row is worse than flagged.
// The full page, read via the proxy, is 5,693 characters and contains no deadline
// and no £150,000. The only figures are £500,000 a year into the fund and "grants
// under £5,000" for the governance strand. The row is LIVE carrying a deadline six
// days out that nothing on the page supports and which a cron derived rather than
// read. An earlier one-line summary of this page did claim "up to £150,000"; the
// full text does not, and the full text wins.
//
//   npx tsx --env-file=.env.local scripts/fix-amount-ungrounded-2026-08-18.ts --dry
//   npx tsx --env-file=.env.local scripts/fix-amount-ungrounded-2026-08-18.ts
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const DRY = process.argv.includes('--dry')
const SOURCE = 'user_verified:amount-grounding-2026-08-18'

const NCT = '21268e1b-f517-41a4-ab43-64389f2f193d'
const BEINNEUN = 'd83e1ad9-b8d5-4367-8a26-0fed8b5698f4'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let applied = 0
  let refused = 0
  const run = async (id: string, label: string, fields: Record<string, unknown>, snippet: string) => {
    console.log(`\n── ${label}`)
    if (DRY) { console.log(`   ${JSON.stringify(fields).slice(0, 200)} (dry)`); return }
    const citations = Object.fromEntries(
      Object.keys(fields).map(k => [k, { snippet, confidence: 'high' as const }]),
    )
    const r = await mergeGrantUpdate({ id, fields, source: SOURCE, db, citations })
    console.log(`   applied:  ${JSON.stringify(r.applied)}`)
    applied += r.applied.length
    if (r.rejected?.length) {
      console.log(`   REFUSED:  ${JSON.stringify(r.rejected)}`)
      refused += r.rejected.length
    }
  }

  // ── National Churches Trust: amounts were right, the brief was not ──────────
  const { data: nct } = await db.from('scraped_grants').select('funder_brief').eq('id', NCT).single()
  const nctBrief = { ...((nct?.funder_brief ?? {}) as Record<string, unknown>) }
  nctBrief.typical_award =
    'Large Grants are up to £50,000, with the average currently in the region of £21,000. '
    + 'The £80,000 figure on this page is a project-cost threshold, not a grant: Large Grants are for '
    + 'major urgent and structural repair projects costing over £80,000, or kitchen and accessible '
    + 'toilet projects costing over £30,000. Applicants must raise 50% matching funds.'
  delete nctBrief._ungrounded_amounts

  await run(
    NCT,
    'National Churches Trust — open, deadline 3 November, and the £80,000 was a project cost',
    { deadline: '2026-11-03', is_rolling: false, funder_brief: nctBrief },
    'Open for new stage one applications. Next Deadline: Tuesday 3 November 2026. Grants of up to £50,000, average currently in the region of £21,000, for major urgent and structural repair projects costing over £80,000.',
  )

  // ── Beinneun: the page supports neither the deadline nor the ceiling ────────
  // amount_max is pinned at admin trust (admin:amount-prose-extract-2026-06-03).
  // The write is attempted deliberately: if the ladder refuses it, that is D5
  // happening to a live row with a wrong figure, and worth showing rather than
  // routing around.
  await run(
    BEINNEUN,
    'Beinneun — remove a deadline no page states',
    { deadline: null },
    'The funder page in full, 5,693 characters, states no deadline and no per-applicant ceiling. Its only figures are an annual payment of approximately £500,000 into the fund and grants under £5,000 for the Single Year governance strand. The stored deadline of 24 August 2026 was written by system:cycle_derive:v1, not read from the page.',
  )

  await run(
    BEINNEUN,
    'Beinneun — attempt to remove the unsupported £150,000 ceiling',
    { amount_max: null },
    'No £150,000 figure appears anywhere in the funder page. The annual payment into the fund is approximately £500,000 and the only stated grant figure is under £5,000 for the governance strand.',
  )

  console.log(`\nfields applied: ${applied}   fields refused: ${refused}`)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
