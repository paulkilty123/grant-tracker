import { describe, it, expect } from 'vitest'
import { isUnchanged, changedFields } from './changed-fields'

/**
 * These guard the fix for the single largest source of pinning debt: Grant
 * Manager's modal sending all seventeen form fields on every save, each stamped
 * admin/trust-100/pinned. A field that slips back into the payload untouched
 * gets frozen forever and nothing reports it, so the rule is pinned here.
 */
describe('isUnchanged', () => {
  it('treats an empty form input and a NULL column as the same', () => {
    // The exact shape behind 53 rows with `deadline` pinned to NULL.
    expect(isUnchanged('', null)).toBe(true)
    expect(isUnchanged(null, '')).toBe(true)
    expect(isUnchanged(undefined, null)).toBe(true)
    expect(isUnchanged('   ', null)).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(isUnchanged('  Baring Foundation  ', 'Baring Foundation')).toBe(true)
  })

  it('sees a real edit', () => {
    expect(isUnchanged('2026-09-07', '2026-09-01')).toBe(false)
    expect(isUnchanged('Baring Foundation', 'Baring Trust')).toBe(false)
    expect(isUnchanged('', '2026-09-07')).toBe(false)   // clearing a value IS a change
    expect(isUnchanged('2026-09-07', '')).toBe(false)   // setting one is too
  })

  it('handles booleans, including false vs unset', () => {
    expect(isUnchanged(false, false)).toBe(true)
    expect(isUnchanged(true, false)).toBe(false)
    // false is a real value, not an absence — it must not collapse to null.
    expect(isUnchanged(false, null)).toBe(false)
  })

  it('compares amounts as the strings the form holds', () => {
    expect(isUnchanged('50000', '50000')).toBe(true)
    expect(isUnchanged('50000', '60000')).toBe(false)
  })
})

describe('changedFields', () => {
  it('writes only what moved, and maps to the database shape', () => {
    const out = changedFields([
      { key: 'title',      formValue: 'Same Title',  storedValue: 'Same Title',  dbValue: 'Same Title' },
      { key: 'deadline',   formValue: '2026-09-07',  storedValue: '',            dbValue: '2026-09-07' },
      { key: 'amount_min', formValue: '50000',       storedValue: '50000',       dbValue: 50000 },
      { key: 'amount_max', formValue: '90000',       storedValue: '60000',       dbValue: 90000 },
    ])
    expect(Object.keys(out).sort()).toEqual(['amount_max', 'deadline'])
    expect(out.amount_max).toBe(90000)      // the number, not the form string
    expect(out.deadline).toBe('2026-09-07')
  })

  // The whole point: a save that changes nothing must write nothing, because
  // every field written here is pinned at trust 100 for good.
  it('returns an empty object when the admin changed nothing', () => {
    const out = changedFields([
      { key: 'title',    formValue: 'Grants',  storedValue: 'Grants',  dbValue: 'Grants' },
      { key: 'deadline', formValue: '',        storedValue: null,      dbValue: null },
      { key: 'is_local', formValue: false,     storedValue: false,     dbValue: false },
    ])
    expect(out).toEqual({})
  })

  it('does not drop a field the admin deliberately cleared', () => {
    const out = changedFields([
      { key: 'deadline', formValue: '', storedValue: '2026-09-07', dbValue: null },
    ])
    expect(out).toEqual({ deadline: null })
  })
})
