// Regression tests for the eligible_structures narrowing guard.
//
//   npx tsx scripts/test-structures-narrowing-guard.ts
//
// WHY THESE EXIST
// A re-classification used to replace eligible_structures wholesale. The model
// does not return [] when a page is silent on legal form — it returns a shorter
// non-empty list — so with the prompt's "DEFAULT BIAS: TIGHT" every pass tended
// to come back narrower than the last. Measured over the review queue on
// 2026-07-25: mean structures per row 4.05 -> 3.61 in ONE pass, 152 values
// removed against 117 added, concentrated on cooperative, unincorporated and the
// ltd forms — the legal forms of the CICs and social enterprises this catalogue
// serves.
//
// Eight removals were checked against the funders' own pages: six plainly wrong,
// one partly wrong, one right by luck. Five of the eight pages said nothing at
// all about legal structure, so the tag was dropped on silence.
//
// Case 4 is the one that stops this fix breaking the previous one: the
// jurisdiction cleanup MUST still be able to drop scio from an England fund.
// Case 5b records that the existing negativeCue gate suppresses all additions
// when any exclusion phrase appears, so the guard has to carry that case alone.

import { buildClassifyPatch } from '../src/lib/classify'
const mk = (structures: string[]) => ({
  impact_sectors: ['community'], funding_type: 'grant' as const,
  eligible_structures: structures, target_beneficiaries: ['general_public'],
  niche_tags: [], _citations: {},
}) as any
let pass = 0, fail = 0
const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify([...(got as string[] ?? [])].sort()) === JSON.stringify([...(want as string[])].sort())
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

// 1. The measured bug: page silent on structure, model returns a shorter list.
let p = buildClassifyPatch({
  result: mk(['registered_charity','cio']),
  description: 'Grants for community projects in the region.',
  funderBrief: { who_can_apply: 'Organisations with a clear social mission.' },
  locationTag: 'England',
  existingStructures: ['registered_charity','cio','cooperative','ltd_guarantee','unincorporated'],
})
t('silence must not drop cooperative/ltd_guarantee/unincorporated',
  p.patch.eligible_structures, ['registered_charity','cio','cooperative','ltd_guarantee','unincorporated'])

// 2. A genuine charity-only restriction MAY narrow.
p = buildClassifyPatch({
  result: mk(['registered_charity','cio']),
  description: 'Registered charities only. Charity number required.',
  funderBrief: { who_can_apply: 'Registered charities only.' },
  locationTag: 'England',
  existingStructures: ['registered_charity','cio','ltd_shares','sole_trader'],
})
t('charities-only restriction still narrows', p.patch.eligible_structures, ['registered_charity','cio'])

// 3. Additions must still land.
p = buildClassifyPatch({
  result: mk(['registered_charity','cio','cic_guarantee','cic_shares']),
  description: 'Open to charities and CICs.',
  funderBrief: { who_can_apply: 'Registered charities and Community Interest Companies.' },
  locationTag: 'England',
  existingStructures: ['registered_charity'],
})
t('additions still land', p.patch.eligible_structures, ['registered_charity','cio','cic_guarantee','cic_shares'])

// 4. Jurisdiction drop of scio must survive the guard.
p = buildClassifyPatch({
  result: mk(['registered_charity','cio']),
  description: 'Grants for Oxfordshire charities.',
  funderBrief: { who_can_apply: 'Charities working in Oxfordshire.' },
  locationTag: 'Oxfordshire',
  existingStructures: ['registered_charity','cio','scio'],
})
t('scio still droppable on an England fund', p.patch.eligible_structures, ['registered_charity','cio'])

// 5a. Constituted groups named eligible, no exclusion phrase present.
p = buildClassifyPatch({
  result: mk(['registered_charity','cio','ltd_guarantee']),
  description: 'Grants for local groups.',
  funderBrief: { who_can_apply: 'Registered UK Charities, Companies Limited by Guarantee, and Constituted Community Groups.' },
  locationTag: 'England',
  existingStructures: [],
})
t('constituted community group -> unincorporated',
  p.patch.eligible_structures, ['registered_charity','cio','ltd_guarantee','unincorporated'])

// 5b. Groundwork's real wording. "Unconstituted organisations cannot apply"
// trips the existing negativeCue gate, which suppresses ALL additions by design
// (it protects the over-tagging direction). The narrowing guard must therefore
// carry this case on its own: whatever is already stored has to survive.
p = buildClassifyPatch({
  result: mk(['registered_charity','cio']),
  description: 'Unconstituted organisations are not eligible.',
  funderBrief: { who_can_apply: 'Registered UK Charities, Companies Limited by Guarantee, Constituted Community Groups. Unconstituted organisations cannot apply.' },
  locationTag: 'UK',
  existingStructures: ['registered_charity','cio','ltd_guarantee','unincorporated'],
})
t('Groundwork: stored unincorporated survives even when the backstop is suppressed',
  p.patch.eligible_structures, ['registered_charity','cio','ltd_guarantee','unincorporated'])

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
