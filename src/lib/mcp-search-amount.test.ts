import { describe, it, expect } from 'vitest'
import { computeMatchQuality } from './mcp-search'

// A row with only the fields the amount path reads. The rest of the shape is
// irrelevant here and deliberately absent, so a change to another signal cannot
// quietly alter what these cases prove.
const row = (amount_min: number | null, amount_max: number | null) =>
  ({ id: 'r', title: 't', funder: 'f', amount_min, amount_max } as never)

describe('an amount the funder does not publish', () => {
  // Production, 2026-08-30: amount-only search returned 45 for a row with no
  // amount against 90 for a row carrying a figure, so the honest rows sorted
  // below result 200. 142 published rows had no amount at the time and the
  // catalogue was about to null more.
  it('does not cost the row half its score', () => {
    // The old behaviour: 45 against 90, which sorted below result 200.
    const known   = computeMatchQuality(row(10_000, 50_000), { amount_min: 10_000 })
    const unknown = computeMatchQuality(row(null, null),     { amount_min: 10_000 })
    expect(unknown.score).toBeGreaterThan(known.score * 0.6)
    expect(unknown.score).toBeLessThan(known.score)
  })

  it('ranks above a partial overlap and below a range that contains the request', () => {
    const p = { amount_min: 10_000, amount_max: 50_000 }
    const unknown  = computeMatchQuality(row(null, null),        p).score
    const partial  = computeMatchQuality(row(40_000, 900_000),   p).score
    const envelops = computeMatchQuality(row(1_000, 900_000),    p).score
    expect(unknown).toBeGreaterThan(partial)
    expect(unknown).toBeLessThan(envelops)
  })

  it('is not left ungraded when the amount is the only filter', () => {
    // Dropping it from the average entirely sent this to 0 via the
    // thin-query branch — worse than the bug being fixed.
    expect(computeMatchQuality(row(null, null), { amount_min: 10_000 }).score)
      .toBeGreaterThan(50)
  })

  it('is not counted as a signal that was checked', () => {
    const q = computeMatchQuality(row(null, null), { amount_min: 10_000 })
    expect(q.signals).not.toContain('amount_in_range')
  })

  it('still lets a row that genuinely misses the range score below one that fits', () => {
    const fits   = computeMatchQuality(row(10_000, 50_000), { amount_min: 10_000, amount_max: 50_000 })
    const misses = computeMatchQuality(row(100, 500),       { amount_min: 10_000, amount_max: 50_000 })
    expect(misses.score).toBeLessThan(fits.score)
  })
})

describe('an amount the funder does publish', () => {
  it('claims the signal only when a comparison happened', () => {
    expect(computeMatchQuality(row(10_000, 50_000), { amount_min: 10_000 }).signals)
      .toContain('amount_in_range')
  })

  it('treats a zero ceiling as a real answer, not a missing one', () => {
    // In-kind rows carry amount_max 0 deliberately — 13 live rows on
    // 2026-08-30. Zero is "no money", which genuinely fails a £100k filter, and
    // must not be mistaken for "we do not know".
    const q = computeMatchQuality(row(0, 0), { amount_min: 100_000 })
    expect(q.signals).not.toContain('amount_in_range')
    const unknown = computeMatchQuality(row(null, null), { amount_min: 100_000 })
    expect(q.score).toBeLessThan(unknown.score)
  })
})
