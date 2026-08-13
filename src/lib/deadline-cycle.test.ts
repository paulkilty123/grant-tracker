import { describe, it, expect } from 'vitest'
import { nextCycleDeadline, isOpeningEntry, type CycleEntry } from './deadline-cycle'

/**
 * This function writes a date onto a live row, unattended, at 02:00. A wrong
 * answer is not a crash — it is a plausible-looking deadline a fundraiser plans
 * against. So the tests are built around wrong-but-plausible, not around throws.
 */

// The row that exposed the bug: London LGBT+ Fund.
const LGBT_FUND: CycleEntry[] = [
  { day: 17, month: 6, label: 'Applications open' },
  { day: 12, month: 8, label: 'Applications close' },
]

describe('nextCycleDeadline — opening dates are not deadlines', () => {
  it('rolls to the CLOSING date, not the earlier opening one', () => {
    // From 13 Aug 2026 the naive "earliest future date" answer is 2027-06-17,
    // the day applications open. The deadline is 2027-08-12.
    expect(nextCycleDeadline(LGBT_FUND, '2026-08-13')).toBe('2027-08-12')
  })

  it('still picks this year when the closing date has not passed', () => {
    expect(nextCycleDeadline(LGBT_FUND, '2026-07-01')).toBe('2026-08-12')
  })

  it('returns null when a cycle carries only opening dates', () => {
    // "We do not know the deadline" is the honest answer. Advertising the
    // opening as a deadline is worse than admitting we cannot compute one, and
    // null routes the caller to its between-rounds handling.
    expect(nextCycleDeadline(
      [{ day: 17, month: 6, label: 'Registration opens' }],
      '2026-08-13',
    )).toBeNull()
  })

  it('recognises the ways a label says "opens"', () => {
    for (const label of [
      'Applications open', 'Opens', 'Opening date', 'Round reopens', 'Reopening',
      'Programme launches', 'Starts', 'Registration window', 'Register by',
    ]) {
      expect(isOpeningEntry({ day: 1, month: 1, label }), `"${label}" is an opening`).toBe(true)
    }
  })

  it('leaves neutral and closing labels as deadline candidates', () => {
    for (const label of [
      'Applications close', 'Closing date', 'Deadline', 'Spring round',
      'Summer round', 'Round 2', '',
    ]) {
      expect(isOpeningEntry({ day: 1, month: 1, label }), `"${label}" is not an opening`).toBe(false)
    }
  })

  it('treats an unlabelled entry as a deadline, preserving old behaviour', () => {
    // Most cycles in the catalogue are bare {day, month} pairs that already mean
    // "deadline". Those must be unaffected by this change.
    expect(nextCycleDeadline(
      [{ day: 1, month: 4 }, { day: 1, month: 10 }],
      '2026-08-13',
    )).toBe('2026-10-01')
  })
})

describe('nextCycleDeadline — the boring guards', () => {
  it('returns null for an absent or empty cycle', () => {
    expect(nextCycleDeadline(null, '2026-08-13')).toBeNull()
    expect(nextCycleDeadline(undefined, '2026-08-13')).toBeNull()
    expect(nextCycleDeadline([], '2026-08-13')).toBeNull()
  })

  it('skips impossible day/month values instead of inventing a date', () => {
    expect(nextCycleDeadline([{ day: 0, month: 4 }], '2026-08-13')).toBeNull()
    expect(nextCycleDeadline([{ day: 32, month: 4 }], '2026-08-13')).toBeNull()
    expect(nextCycleDeadline([{ day: 1, month: 13 }], '2026-08-13')).toBeNull()
  })

  it('does not silently roll 31 February into March', () => {
    // Date.UTC(2026, 1, 31) is 3 March. Honouring that would put a deadline on a
    // date the funder never named, and it would look entirely plausible.
    expect(nextCycleDeadline([{ day: 31, month: 2 }], '2026-01-01')).toBeNull()
  })

  it('rolls a date that is exactly today to next year', () => {
    // A deadline of "today" has effectively passed for planning purposes, and
    // the original used <= for this reason. Preserved deliberately.
    expect(nextCycleDeadline([{ day: 13, month: 8 }], '2026-08-13')).toBe('2027-08-13')
  })

  it('returns null rather than NaN for an unparseable today', () => {
    expect(nextCycleDeadline([{ day: 1, month: 4 }], 'not-a-date')).toBeNull()
  })

  it('picks the earliest closing date across several rounds', () => {
    // The Fore's real shape: three rounds a year.
    const fore: CycleEntry[] = [
      { day: 27, month: 4, label: 'Summer round deadline' },
      { day: 7,  month: 9, label: 'Autumn round deadline' },
      { day: 11, month: 1, label: 'Spring round deadline' },
    ]
    expect(nextCycleDeadline(fore, '2026-08-13')).toBe('2026-09-07')
    expect(nextCycleDeadline(fore, '2026-09-08')).toBe('2027-01-11')
  })
})
