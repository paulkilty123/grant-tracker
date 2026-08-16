import { describe, it, expect } from 'vitest'
import { __parseDeadlineForTests as parseDeadline } from './crawl'

/**
 * The case that prompted these: gov.uk's "An Official Oral History of Women
 * Veterans in the UK" carried `grantApplicationCloseDate: "2026-09-23T00:00"`
 * while its own page read "Closing date: 22 September 2026, 11:59pm (Midnight)".
 * We stored the 23rd, so a fundraiser reading our card had a day that did not
 * exist. 65 rows were in that state.
 *
 * Dates below are deliberately far future: `parseDeadline` discards anything
 * before today, so a test written against 2026 would start returning null and
 * fail for the wrong reason once that date passed.
 */
describe('parseDeadline', () => {
  it('treats an exact midnight as the boundary and returns the day before', () => {
    expect(parseDeadline('2030-09-23T00:00')).toBe('2030-09-22')
  })

  it('leaves a real closing time on its own day', () => {
    expect(parseDeadline('2030-09-22T23:59')).toBe('2030-09-22')
    expect(parseDeadline('2030-09-22T09:00')).toBe('2030-09-22')
  })

  it('does not shift a bare date that carries no time at all', () => {
    // The four text-scraping callers pass dates in this shape. Shifting these
    // would invent the opposite error and take a day away.
    expect(parseDeadline('2030-09-22')).toBe('2030-09-22')
  })

  it('crosses a month boundary correctly', () => {
    expect(parseDeadline('2030-10-01T00:00')).toBe('2030-09-30')
  })

  it('crosses a year boundary correctly', () => {
    // 1 April and 1 January midnights are common in the gov.uk feed, where they
    // mark the end of a scheme's financial year rather than an applyable day.
    expect(parseDeadline('2031-01-01T00:00')).toBe('2030-12-31')
  })

  it('handles a leap-year boundary', () => {
    expect(parseDeadline('2032-03-01T00:00')).toBe('2032-02-29')
  })

  it('still reads the text dates the other scrapers pass', () => {
    expect(parseDeadline('May 14, 2030')).toBe('2030-05-14')
  })

  it('discards a deadline already in the past', () => {
    expect(parseDeadline('2020-01-15T00:00')).toBeNull()
    expect(parseDeadline('2020-01-15')).toBeNull()
  })

  it('returns null for nothing and for rubbish', () => {
    expect(parseDeadline(null)).toBeNull()
    expect(parseDeadline(undefined)).toBeNull()
    expect(parseDeadline('')).toBeNull()
    expect(parseDeadline('   ')).toBeNull()
    expect(parseDeadline('not a date')).toBeNull()
  })

  it('does not let a midnight shift push a just-passed deadline back into view', () => {
    // Guard on ordering: the shift happens BEFORE the past-date discard, so a
    // midnight on today's date resolves to yesterday and is dropped, rather
    // than surviving as a deadline that has in fact gone.
    const today = new Date().toISOString().split('T')[0]
    expect(parseDeadline(`${today}T00:00`)).toBeNull()
  })
})
