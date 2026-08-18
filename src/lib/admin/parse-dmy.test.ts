import { describe, it, expect } from 'vitest'
import { parseDmy, splitIso } from './parse-dmy'

const iso = (d: string, m: string, y: string) => {
  const r = parseDmy(d, m, y)
  return r.ok ? r.iso : `REFUSED: ${r.error}`
}

describe('parseDmy', () => {
  it('reads the boxes as day, month, year and never the other way round', () => {
    // The whole reason this exists. Under a US reading this is 8 May.
    expect(iso('5', '8', '2026')).toBe('2026-08-05')
    expect(iso('11', '12', '2026')).toBe('2026-12-11')
  })

  it('pads single digits into the stored form', () => {
    expect(iso('1', '1', '2027')).toBe('2027-01-01')
    expect(iso('01', '01', '2027')).toBe('2027-01-01')
  })

  it('refuses a date that does not exist rather than rolling it forward', () => {
    // Date() turns 31 April into 1 May on its own, so without the round trip
    // this stores a real date the reviewer never typed.
    expect(parseDmy('31', '4', '2026').ok).toBe(false)
    expect(parseDmy('30', '2', '2026').ok).toBe(false)
    expect(parseDmy('32', '1', '2026').ok).toBe(false)
  })

  it('gets February right in both directions', () => {
    expect(iso('29', '2', '2028')).toBe('2028-02-29')   // leap year
    expect(parseDmy('29', '2', '2027').ok).toBe(false)  // not one
  })

  it('refuses a two digit year instead of guessing the century', () => {
    const r = parseDmy('11', '12', '26')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('four digits')
  })

  it('refuses a partly filled date', () => {
    expect(parseDmy('11', '', '2026').ok).toBe(false)
    expect(parseDmy('', '', '').ok).toBe(false)
  })

  it('refuses a month outside 1 to 12', () => {
    expect(parseDmy('1', '13', '2026').ok).toBe(false)
    expect(parseDmy('1', '0', '2026').ok).toBe(false)
  })

  it('refuses a year far outside the catalogue range', () => {
    expect(parseDmy('1', '1', '1999').ok).toBe(false)
    expect(parseDmy('1', '1', '2101').ok).toBe(false)
  })

  it('allows a past date, because a closed round is a real thing to record', () => {
    expect(iso('1', '3', '2024')).toBe('2024-03-01')
  })
})

describe('splitIso', () => {
  it('round trips with parseDmy', () => {
    const s = splitIso('2026-12-11')
    expect(s).toEqual({ day: '11', month: '12', year: '2026' })
    expect(iso(s.day, s.month, s.year)).toBe('2026-12-11')
  })

  it('seeds blank boxes for a row with no deadline', () => {
    expect(splitIso(null)).toEqual({ day: '', month: '', year: '' })
    expect(splitIso('rolling')).toEqual({ day: '', month: '', year: '' })
  })
})
