// Regression tests for the pinning rules in mergeFieldUpdate().
//
//   npx tsx scripts/test-merge-pinning.ts
//
// Case 1 is the one that mattered: an admin save that does not change a value
// must not pin it. Grant Manager sends its entire form state, so without this
// rule every field on screen was recorded as a human decision and frozen at
// trust 100 — 54% of active rows carry such a pin, and 53 have `deadline`
// pinned to NULL, unfixable by anything automated.
//
// Cases 3-5 exist so that fix cannot quietly weaken the protections that DO
// matter: a genuine admin correction must still pin, and a pinned value must
// still repel automated writes.

import { mergeFieldUpdate, type ProvenanceEntry } from '../src/lib/grant-merge'

const prov = (source: string, pinned = false): ProvenanceEntry => ({ source, set_at: '2026-07-26T00:00:00Z', pinned })
let pass = 0, fail = 0
const t = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`)
}

// 1. THE FIX — an admin form save that changes nothing must not pin.
t('unchanged value from an admin save does not pin',
  mergeFieldUpdate('2026-10-07', prov('ai_enrich:v2'), '2026-10-07', prov('admin:paul', true)).write,
  false)

// 2. Same for null: an empty form box must not freeze the field empty.
t('null over null does not pin the field empty',
  mergeFieldUpdate(null, prov('scraper:x'), null, prov('admin:paul', true)).write,
  false)

// 3. A REAL admin correction must still write and still pin.
t('a genuine admin change still writes and pins',
  (() => { const r = mergeFieldUpdate('2026-10-07', prov('ai_enrich:v2'), '2026-11-01', prov('admin:paul', true))
           return r.write ? { write: true, value: r.value } : { write: false } })(),
  { write: true, value: '2026-11-01' })

// 4. A pinned value still repels automated writes.
t('pinned value still blocks an automated write',
  mergeFieldUpdate('2026-10-07', prov('admin:paul', true), '2026-12-01', prov('ai_enrich:v2')),
  { write: false, reason: 'pinned' })

// 5. The trust ladder is untouched.
t('lower trust still refused',
  mergeFieldUpdate('x', prov('ai_enrich:v2'), 'y', prov('scraper:z')),
  { write: false, reason: 'lower_trust' })

// 6. Arrays compare by value, not identity — eligible_structures is an array and
//    a re-save of the same list must not pin it.
t('identical array does not pin',
  mergeFieldUpdate(['cio', 'registered_charity'], prov('ai_classifier:v3'), ['cio', 'registered_charity'], prov('admin:paul', true)).write,
  false)

// 7. ...but a genuinely different array still writes.
t('changed array still writes',
  mergeFieldUpdate(['cio'], prov('ai_classifier:v3'), ['cio', 'scio'], prov('admin:paul', true)).write,
  true)

// 8. First write to a field is unaffected.
t('first write still lands',
  mergeFieldUpdate(null, undefined, '2026-10-07', prov('system:x')).write,
  true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
