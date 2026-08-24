import { describe, it, expect } from 'vitest'
import { formatCurrency, formatRange } from './utils'

// Written from the live catalogue on 2026-08-24, where 37 figures rendered
// inaccurately and 21 of them OVERSTATED what the funder offers.
describe('formatCurrency', () => {
  it('never rounds a figure up', () => {
    // The case that started it: nine live funds capped at £2,500 said "£3k".
    expect(formatCurrency(2500)).toBe('£2.5k')
    expect(formatCurrency(1500)).toBe('£1.5k')
    expect(formatCurrency(12500)).toBe('£12.5k')
  })

  it('keeps sub-thousand precision', () => {
    // Buttle UK — Chances for Children. Stored 2400, card said "Up to £2k".
    expect(formatCurrency(2400)).toBe('£2.4k')
    expect(formatCurrency(1200)).toBe('£1.2k')
  })

  it('still shortens round numbers', () => {
    expect(formatCurrency(2000)).toBe('£2k')
    expect(formatCurrency(10000)).toBe('£10k')
    expect(formatCurrency(250000)).toBe('£250k')
    expect(formatCurrency(1_500_000)).toBe('£1.5m')
  })

  it('uses two decimals when that is what makes it exact', () => {
    expect(formatCurrency(1_250_000)).toBe('£1.25m')
  })

  it('falls back to the full figure rather than lie', () => {
    // No short form round-trips, so print it in full. Longer and true.
    expect(formatCurrency(33333)).toBe('£33,333')
    expect(formatCurrency(1234)).toBe('£1,234')
  })

  it('handles billions, which the old code rendered as "£11700.0m"', () => {
    expect(formatCurrency(11_700_000_000)).toBe('£11.7bn')
  })

  it('leaves amounts under a thousand alone', () => {
    expect(formatCurrency(750)).toBe('£750')
  })

  it('round-trips: whatever is printed means what it says', () => {
    for (const n of [500, 1200, 1500, 2400, 2500, 5000, 12500, 33333, 250000, 1_250_000, 1_500_000]) {
      const s = formatCurrency(n).replace(/[£,]/g, '')
      const m = s.match(/^([\d.]+)(bn|m|k)?$/)!
      const mult = m[2] === 'bn' ? 1e9 : m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1
      expect(Math.round(parseFloat(m[1]) * mult)).toBe(n)
    }
  })
})

describe('formatRange', () => {
  it('carries the fix through to the card label', () => {
    expect(formatRange(null, 2400)).toBe('Up to £2.4k')
    expect(formatRange(1500, 2500)).toBe('£1.5k – £2.5k')
  })
})
