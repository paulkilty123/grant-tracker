import { describe, it, expect } from 'vitest'
import { matchTier, MATCH_TIER_GOOD, MATCH_TIER_STRONG, MATCH_FLOOR } from './matching'

// Paul moved Good from 70 to 65 on 2026-08-25, after a 68% card read
// "Partial match". These pin the decision and the shape around it.
describe('match tier boundaries', () => {
  it('Good starts at 65', () => {
    expect(MATCH_TIER_GOOD).toBe(65)
    expect(matchTier(65).label).toBe('Good')
    expect(matchTier(64).label).toBe('Partial')
  })

  it('the card that started it now reads Good', () => {
    expect(matchTier(68).label).toBe('Good')
  })

  it('Strong is unchanged at 80', () => {
    expect(MATCH_TIER_STRONG).toBe(80)
    expect(matchTier(80).label).toBe('Strong')
    expect(matchTier(79).label).toBe('Good')
  })

  it('every score that can reach a screen has a tier', () => {
    // Nothing below MATCH_FLOOR is displayed, so the tiers only need to cover
    // the floor upward — but they must cover ALL of it, with no gap.
    for (let s = MATCH_FLOOR; s <= 100; s++) {
      expect(['Strong', 'Good', 'Partial']).toContain(matchTier(s).label)
    }
  })

  it('the boundaries are ordered', () => {
    expect(MATCH_TIER_GOOD).toBeGreaterThan(MATCH_FLOOR)
    expect(MATCH_TIER_STRONG).toBeGreaterThan(MATCH_TIER_GOOD)
  })
})
