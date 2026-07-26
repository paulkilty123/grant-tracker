// Tag funds whose applicant is a PERSON with the `individual` structure.
//
// WHY
// Until 2026-07-26 the taxonomy had no way to say "this fund is for a person".
// The nearest value was sole_trader, and the admin UI offered a single chip
// labelled "Sole Trader / Individual", conflating a business with a human being.
// So a research fund whose own text says "clinicians, midwives, nurses,
// academics" was either untagged (and therefore shown to everyone, because
// matching.ts only applies the hard structure gate to a NON-empty array) or
// tagged with charity forms by a classifier that had no better option.
//
// `individual` alone caps the row at INDIVIDUAL_ONLY_SCORE_CAP for any
// organisation, which puts it below every ranked surface while leaving it
// browsable. A fund open to BOTH individuals and organisations must keep its
// organisational forms — the cap only fires when the eligibility list is
// entirely individual, so mixed funds are unaffected.
//
//   npx tsx scripts/tag-individual-applicant-funds.ts          # dry run
//   npx tsx scripts/tag-individual-applicant-funds.ts --apply
//
// Writes as ai_classifier:individual_applicant:v1 — trust 60, equal to the
// classifier sources it supersedes, which mergeGrantUpdate accepts (it rejects
// only on STRICTLY lower trust). Not admin:, which would pin at 100.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeGrantUpdate } from '../src/lib/grant-merge'

const HERE = dirname(fileURLToPath(import.meta.url))
for (const line of readFileSync(resolve(HERE, '..', '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '')
}

const SOURCE = 'ai_classifier:individual_applicant:v1'

/**
 * Reviewed by hand, one line of evidence each. Deliberately an explicit list
 * rather than a heuristic: "is the applicant a person" is a judgement about the
 * fund's own words, and a regex over "individual" would catch every fund that
 * merely mentions individuals as beneficiaries.
 */
const FUNDS: { id: string; label: string; evidence: string }[] = [
  {
    id: '1a5b26f7-4ceb-4a08-8f6c-7ea50c450b51',
    label: 'Wellbeing of Women — Research Grants',
    evidence: 'who_can_apply: "Individual researchers and medical professionals including clinicians, midwives, nurses…"',
  },
]

async function main() {
  const apply = process.argv.includes('--apply')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await db
    .from('scraped_grants')
    .select('id, funder, title, eligible_structures, is_active')
    .in('id', FUNDS.map(f => f.id))
  if (error) { console.error('query failed:', error.message); process.exit(1) }

  const rows = (data ?? []) as { id: string; funder: string; title: string; eligible_structures: string[] | null; is_active: boolean }[]
  const missing = FUNDS.filter(f => !rows.some(r => r.id === f.id))
  if (missing.length) for (const m of missing) console.warn(`  NOT FOUND: ${m.label} (${m.id})`)

  console.log(`\n${rows.length} fund(s) to retag as individual-applicant:\n`)
  for (const r of rows) {
    const f = FUNDS.find(x => x.id === r.id)!
    console.log(`  ${r.funder} — ${r.title}`)
    console.log(`    now:      [${(r.eligible_structures ?? []).join(', ') || '—'}]`)
    console.log(`    becomes:  [individual]`)
    console.log(`    evidence: ${f.evidence}\n`)
  }

  if (!apply) { console.log('DRY RUN — nothing written. Re-run with --apply.\n'); return }

  let applied = 0, rejected = 0
  for (const r of rows) {
    const res = await mergeGrantUpdate({
      id: r.id, fields: { eligible_structures: ['individual'] }, source: SOURCE, pinned: false, db,
    })
    if (res.applied.includes('eligible_structures')) applied++
    else { rejected++; console.warn(`  rejected: ${r.title} — ${res.rejected.map(x => x.reason).join(', ')}`) }
  }
  console.log(`applied ${applied}, rejected ${rejected}\n`)
}

main()
