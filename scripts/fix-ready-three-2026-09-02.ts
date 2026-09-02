// Fix the one line the page contradicts on three Ready rows, from the stored
// read, then publish them. No model call, no page fetch.
//
// Paul, 2026-09-02: "Yes to all three quotes. Fix and publish STEM North East,
// ScottishPower and Tesco."
//
//   STEM North East    is_rolling -> false (page: quarterly deadlines; the four
//                      quarter-end dates are already on the row). Who-can-apply
//                      and amount already match the page; recorded as confirmed.
//   ScottishPower      min_org_income -> 100,000 (page: "greater than £100,000
//                      but does not exceed £5,000,000"). The cap was already
//                      corrected on 20 Aug; the stamp predates the fix.
//   Tesco              eligible_structures += not_registered (page: "voluntary
//                      or community organisations (including registered
//                      charities/companies)").
//
// Sources are user_verified (70): above the ai_ sources these values came from,
// below admin, so a later read can still improve them. Evidence is stamped with
// the page quote so the card carries the line it was missing.
//
//   npx tsx --env-file=.env.local scripts/fix-ready-three-2026-09-02.ts          dry run
//   APPLY=1 npx tsx --env-file=.env.local scripts/fix-ready-three-2026-09-02.ts  write and publish

import { createClient } from '@supabase/supabase-js'
import { mergeGrantUpdate } from '../src/lib/grant-merge'
import { buildEvidencePatch, recordFieldEvidence } from '../src/lib/field-evidence'

const APPLY  = process.env.APPLY === '1'
const SOURCE = 'user_verified:ready-fixes-2026-09-02'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const STEM  = '58982bd3-de15-4000-9c4b-a4f7a767a64d'
const SP    = '18d9e659-bfdc-4d37-9625-6e740f7b46e8'
const TESCO = 'd6f2fc61-1403-4f13-9d06-e3b47e6c4f4c'

const Q = {
  stemRounds:  'Applications are sent to the donors for consideration on a quarterly basis; the application deadlines are therefore the final day of September, December, March, and June.',
  stemWho:     'Applications are invited from charitable organisations to apply for a grant of between £1,000 and £10,000.',
  spIncome:    'Your income in the last set of published accounts was greater than £100,000 but does not exceed £5,000,000.',
  tescoWho:    'Grants will be awarded to voluntary or community organisations (including registered charities/companies), schools, health bodies (e.g. Clinical Commissioning Groups (CCGs), NHS Hospital Trust, Foundation Trust), Parish/Town Councils, local authorities and social housing providers.',
}
const U = {
  stem:  'https://www.communityfoundation.org.uk/grants/funding-for-stem-activities-in-the-north-east/',
  sp:    'https://www.scottishpower.com/pages/annual_grants_programme.aspx',
  tesco: 'https://tescobagsofhelp.org.uk/tesco-community-grants/',
}

type Plan = { id: string; name: string; fields: Record<string, unknown>; evidence: Parameters<typeof buildEvidencePatch>[0] }

async function main() {
  const { data: rows, error } = await db.from('scraped_grants')
    .select('id, title, is_active, pipeline_state, is_rolling, min_org_income, max_org_income, eligible_structures')
    .in('id', [STEM, SP, TESCO])
  if (error || !rows || rows.length !== 3) throw new Error(`expected 3 rows, got ${rows?.length ?? 0} ${error?.message ?? ''}`)
  const by = Object.fromEntries(rows.map(r => [r.id, r]))

  // Preconditions: the state the corrections were decided against.
  if (by[STEM].is_rolling !== true) throw new Error('STEM: is_rolling is no longer true, re-read before applying')
  if (by[SP].max_org_income !== 5000000 || by[SP].min_org_income !== null) throw new Error('ScottishPower: income fields moved, re-read before applying')
  const tescoStructs: string[] = by[TESCO].eligible_structures ?? []
  if (tescoStructs.includes('not_registered')) throw new Error('Tesco: not_registered already present')
  for (const r of rows) if (r.is_active) throw new Error(`${r.title} is already live`)

  const plans: Plan[] = [
    { id: STEM, name: by[STEM].title, fields: { is_rolling: false }, evidence: [
      { field: 'is_rolling',          quote: Q.stemRounds, source_url: U.stem, agrees: true },
      { field: 'deadline_cycle',      quote: Q.stemRounds, source_url: U.stem, agrees: true },
      { field: 'eligible_structures', quote: Q.stemWho,    source_url: U.stem, agrees: true, note: 'charities and CIOs are both charitable organisations; kept as held' },
      { field: 'amount_min',          quote: Q.stemWho,    source_url: U.stem, agrees: true },
      { field: 'amount_max',          quote: Q.stemWho,    source_url: U.stem, agrees: true },
    ] },
    { id: SP, name: by[SP].title, fields: { min_org_income: 100000 }, evidence: [
      { field: 'min_org_income', quote: Q.spIncome, source_url: U.sp, agrees: true },
      { field: 'max_org_income', quote: Q.spIncome, source_url: U.sp, agrees: true, note: 'cap corrected 2026-08-20; the older stamp predated the fix' },
    ] },
    { id: TESCO, name: by[TESCO].title, fields: { eligible_structures: [...tescoStructs, 'not_registered'] }, evidence: [
      { field: 'eligible_structures', quote: Q.tescoWho, source_url: U.tesco, agrees: true, note: 'page is wider than we held; unregistered community groups added' },
    ] },
  ]

  for (const p of plans) {
    console.log(`\n${p.name}`)
    console.log(`  fields: ${JSON.stringify(p.fields)}`)
    console.log(`  evidence: ${p.evidence.map(e => e.field).join(', ')}`)
    if (!APPLY) continue
    const res = await mergeGrantUpdate({ id: p.id, fields: p.fields, source: SOURCE, db })
    const wanted = Object.keys(p.fields)
    const missing = wanted.filter(f => !res.applied.includes(f))
    if (missing.length) throw new Error(`${p.name}: ${missing.join(', ')} not applied (${JSON.stringify(res.rejected)})`)
    console.log(`  applied: ${res.applied.join(', ')}`)
    const { patch, unquoted } = buildEvidencePatch(p.evidence, { by: SOURCE })
    if (unquoted.length) throw new Error(`${p.name}: unquoted ${unquoted.join(', ')}`)
    const ev = await recordFieldEvidence({ id: p.id, patch, db })
    console.log(`  stamped: ${ev.stamped.join(', ')}`)
    // Publish the same way the Inbox button does: both fields, both asserted.
    const pub = await mergeGrantUpdate({ id: p.id, fields: { is_active: true, pipeline_state: 'published' }, source: SOURCE, db })
    if (!pub.applied.includes('is_active') || !pub.applied.includes('pipeline_state')) {
      throw new Error(`${p.name}: publish did not land (${pub.applied.join(', ')} / ${JSON.stringify(pub.rejected)})`)
    }
    console.log(`  published`)
  }
  if (!APPLY) console.log('\nDRY RUN, nothing written. APPLY=1 to write.')
}
main().catch(e => { console.error(e.message); process.exit(1) })
