// The four live equity-tagged rows, corrected. Paul approved 2026-08-21.
//
//   npx tsx --env-file=/Users/paulkilty/dev/grant-tracker/.env.local \
//     scripts/fix-equity-structures-2026-08-21.ts [--dry]
//
// Found while answering the programmes/investment spec. Three of the four rows
// offered equity to a legal structure that cannot hold share capital. The gate
// that now catches this lives in src/lib/instrument-structure.ts; this script
// fixes the rows the gate found, which is a separate job. One is a genuinely
// wrong structures list, one is two wrong entries, and two are mistagged
// instruments where the row's own description contradicts its subtype.
//
// WHY PINNED ADMIN WRITES ON THE STRUCTURES.
//
// The narrowing guard in classify.ts deliberately refuses to DROP an
// eligible_structures value, because a model that goes quiet must never wipe a
// row's eligibility. That protection runs the wrong way here: it would restore
// exactly the impossible structures being removed. An admin write pins the
// field, which is the only thing that survives it, and pinning is honest in
// this case because the rule is not a reading of a funder's page. A company
// limited by guarantee has no share capital in law, and no re-crawl will
// change that.
//
// The subtype corrections are untracked, so they pass through the merger
// without provenance. That is correct: funding_subtype is not a claim about
// the funder, it is our own classification of the product.
import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { barredStructuresFor } from '../src/lib/instrument-structure'
import { writeFileSync } from 'node:fs'

const SOURCE = 'admin:equity-structure-gate-2026-08-21'
const DRY = process.argv.includes('--dry')

type Fix = {
  id: string
  title: string
  /** What the row claims, and why that is impossible or wrong. */
  finding: string
  /** Verbatim from the row's own description or the funder's page. */
  evidence: string
  fields: Record<string, unknown>
  tracked: boolean
}

const FIXES: Fix[] = [
  {
    id: '55d3592a-1a6b-4495-9f55-e772f1857d60',
    title: 'Black Seed VC',
    finding:
      'Equity VC listing cic_guarantee and ltd_guarantee as eligible. Neither form has share capital, so neither can accept the investment. Removed; ltd_shares, cic_shares and cooperative retained.',
    evidence:
      "Row description: \"Early-stage investors with initial funding commitment typically within the £100,000 to £400,000 range, requiring at least one member of the co-founding team to identify as Black\".",
    fields: { eligible_structures: ['ltd_shares', 'cic_shares', 'cooperative'] },
    tracked: true,
  },
  {
    id: '0ce8470d-9557-40a3-a8d2-ef01daba3f09',
    title: 'Tech for Good Programme (Bethnal Green Ventures)',
    finding:
      'Equity programme listing ltd_guarantee as eligible. Removed; ltd_shares and cooperative retained.',
    evidence:
      'Row description: "An early-stage venture capital investment programme ... BGV invests from pre-seed to Series A/B stage, providing capital, mentorship, and platform support".',
    fields: { eligible_structures: ['ltd_shares', 'cooperative'] },
    tracked: true,
  },
  {
    id: 'b81f41be-db1a-4b9e-9e7f-da7cacff19b1',
    title: 'Social Investment Fund for London (City Bridge Foundation)',
    finding:
      "Mistagged as equity. The row's own description says loans and equity-TYPE arrangements, which is quasi-equity, not equity. The structures list (charities, CIOs, CICs) is correct for a repayable-finance fund and is left alone; only the instrument changes.",
    evidence:
      'Row description: "A £22 million social investment fund providing accessible, flexible and long-term repayable finance (loans and equity-type arrangements) for established social purpose organisations".',
    fields: { funding_subtype: 'social_investment' },
    tracked: false,
  },
  {
    id: '283f4277-aca4-4cc1-ae9e-2d2aebcf54f3',
    title: 'Community Shares — Booster Fund',
    finding:
      "Mistagged as equity, and as an equity subtype under funding_type='grant', which is not a valid combination. It is a grant that pays for the costs of running a share offer, not the share offer itself. This is the row that proved the gate belongs in sharedChecks rather than investmentChecks.",
    evidence:
      'Row description: "Grants to help community organisations run community share offers ... Covers costs of the share offer process and provides match funding to boost campaigns."',
    fields: { funding_subtype: 'restricted' },
    tracked: false,
  },
]

const SELECT = 'id, title, funder, funding_type, funding_subtype, eligible_structures, is_active, pipeline_state'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: before, error } = await db
    .from('scraped_grants')
    .select(SELECT)
    .in('id', FIXES.map(f => f.id))
  if (error) throw error

  console.log(`\n── ${FIXES.length} rows, ${DRY ? 'DRY RUN' : 'WRITING'}\n`)

  const results: unknown[] = []
  for (const fix of FIXES) {
    const row = before?.find(r => r.id === fix.id)
    if (!row) {
      console.log(`  MISSING  ${fix.title} (${fix.id}) — not found, skipped`)
      results.push({ id: fix.id, title: fix.title, outcome: 'not_found' })
      continue
    }

    console.log(`  ${fix.title}`)
    console.log(`    was: subtype=${row.funding_subtype} structures=[${(row.eligible_structures ?? []).join(', ')}]`)
    console.log(`    now: ${JSON.stringify(fix.fields)}`)

    if (DRY) {
      results.push({ id: fix.id, title: fix.title, outcome: 'dry_run', before: row, fields: fix.fields })
      console.log('')
      continue
    }

    const merged = await mergeGrantUpdate({
      id: fix.id,
      fields: fix.fields,
      source: SOURCE,
      pinned: fix.tracked,
      db,
    })
    if (merged.rejected.length > 0) {
      // The trust ladder refusing a write is the failure this script most needs
      // to be loud about. A silent rejection here looks exactly like a success.
      console.log(`    REJECTED by the merger: ${merged.rejected.map(r => r.field).join(', ')}`)
    }
    console.log(`    applied: ${merged.applied.join(', ') || 'nothing'}\n`)
    results.push({
      id: fix.id, title: fix.title, outcome: 'written',
      before: row, fields: fix.fields,
      applied: merged.applied, rejected: merged.rejected,
    })
  }

  // Prove it landed, and prove the gate now finds nothing. A re-read is the
  // only thing that distinguishes "the merger accepted it" from "the row
  // changed" — the trust ladder can accept a call and still write nothing.
  const { data: after } = await db.from('scraped_grants').select(SELECT).in('id', FIXES.map(f => f.id))
  const stillBarred = (after ?? [])
    .map(r => ({ title: r.title, barred: barredStructuresFor(r.funding_subtype, r.eligible_structures) }))
    .filter(r => r.barred.length > 0)

  console.log(`── after: ${stillBarred.length} rows still offering equity to a structure that cannot hold it`)
  for (const r of stillBarred) console.log(`    ${r.title}: ${r.barred.join(', ')}`)

  if (!DRY) {
    const path = 'reports/fix-equity-structures-2026-08-21.json'
    writeFileSync(path, JSON.stringify({
      written_at_utc: new Date().toISOString(),
      approved_by: 'Paul, 2026-08-21',
      source: SOURCE,
      reason: 'equity offered to structures with no share capital; two rows mistagged as equity',
      findings: FIXES.map(f => ({ id: f.id, title: f.title, finding: f.finding, evidence: f.evidence })),
      before,
      results,
      after,
      still_barred_after: stillBarred,
    }, null, 2))
    console.log(`\nreport → ${path}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
