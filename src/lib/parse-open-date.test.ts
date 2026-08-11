import { describe, it, expect } from 'vitest'
import { parseOpenDate } from './parse-open-date'

/**
 * Rounding down is correct for a vague period and wrong for an exact date.
 *
 * Before 2026-08-11 there was no exact-date branch at all, so "2026-07-30" fell
 * through to the bare-year fallback and parsed to "2026-01-01" — seven months
 * early, with nothing to signal the loss. Real catalogue rows were carrying
 * exactly these strings.
 */
describe('parseOpenDate — exact dates keep their day', () => {
  it('parses ISO dates as themselves', () => {
    expect(parseOpenDate('2026-07-30')).toBe('2026-07-30')
    expect(parseOpenDate('2027-01-01')).toBe('2027-01-01')
    expect(parseOpenDate('2027-04-01')).toBe('2027-04-01')
  })

  it('parses "D Month YYYY", including with trailing round labels', () => {
    // Both of these are verbatim from live catalogue rows.
    expect(parseOpenDate('5 August 2026')).toBe('2026-08-05')
    expect(parseOpenDate('16 July 2026 (round 2)')).toBe('2026-07-16')
    expect(parseOpenDate('2 July 2026 (round 2)')).toBe('2026-07-02')
  })

  it('handles ordinals and abbreviated months', () => {
    expect(parseOpenDate('31st July 2026')).toBe('2026-07-31')
    expect(parseOpenDate('3rd Sep 2026')).toBe('2026-09-03')
  })

  it('handles month-first ordering', () => {
    expect(parseOpenDate('August 5, 2026')).toBe('2026-08-05')
    expect(parseOpenDate('July 16th 2026')).toBe('2026-07-16')
  })

  it('finds an exact date embedded in a longer sentence', () => {
    expect(
      parseOpenDate('Quarterly deadlines; next cut-off 31 July 2026 for the 8 September panel'),
    ).toBe('2026-07-31')
  })

  it('rejects impossible dates rather than inventing one', () => {
    // Must not roll 32 July into August, which Date would do unguarded.
    expect(parseOpenDate('2026-13-01')).toBe('2026-01-01')  // falls back to bare year
    expect(parseOpenDate('32 July 2026')).toBe('2026-07-01') // falls back to month
  })
})

describe('parseOpenDate — periods still round down', () => {
  it('keeps the existing period behaviour', () => {
    expect(parseOpenDate('July 2026')).toBe('2026-07-01')
    expect(parseOpenDate('Q3 2026')).toBe('2026-07-01')
    expect(parseOpenDate('Autumn 2026')).toBe('2026-09-01')
    expect(parseOpenDate('Early 2026')).toBe('2026-01-01')
    expect(parseOpenDate('2026')).toBe('2026-01-01')
  })

  it('returns null for text carrying no year', () => {
    expect(parseOpenDate('TBC — between rounds')).toBeNull()
    expect(parseOpenDate('Closed — next round TBC')).toBeNull()
    expect(parseOpenDate(null)).toBeNull()
    expect(parseOpenDate('')).toBeNull()
  })

  it('does not mistake a bare year inside prose for an exact date', () => {
    expect(parseOpenDate('TBC 2026')).toBe('2026-01-01')
  })
})
