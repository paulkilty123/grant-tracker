import { describe, it, expect } from 'vitest'
import { preserveEligibilityFields } from './funder-brief'

// Regression cover for 2026-08-18: re-enriching 18 seed:legacy rows rewrote the
// brief blob wholesale and dropped `exclusions` on three of them. The worst was
// Chichester City Council, whose card stopped saying a grant stream was closed.
describe('preserveEligibilityFields', () => {
  it('keeps a previous exclusion the fresh read dropped (the Chichester case)', () => {
    const prev = { exclusions: 'For-profit organisations. Large/core funding grants are currently closed.' }
    const next = { exclusions: null, what_they_fund: 'Community projects in Chichester' }
    const { brief, preserved } = preserveEligibilityFields(next, prev)
    expect(brief.exclusions).toBe(prev.exclusions)
    expect(preserved).toEqual(['exclusions'])
    // the rest of the fresh read is untouched
    expect(brief.what_they_fund).toBe('Community projects in Chichester')
  })

  it('lets a substantive new value replace a substantive old one', () => {
    const prev = { exclusions: 'Individuals cannot apply.' }
    const next = { exclusions: 'Only paid frontline workers may apply.' }
    const { brief, preserved } = preserveEligibilityFields(next, prev)
    expect(brief.exclusions).toBe('Only paid frontline workers may apply.')
    expect(preserved).toEqual([])
  })

  it('treats blank and whitespace-only as absent, not as content', () => {
    const prev = { who_can_apply: 'Registered charities in Lambeth.' }
    for (const blank of [null, undefined, '', '   ', 42]) {
      const { brief } = preserveEligibilityFields({ who_can_apply: blank }, prev)
      expect(brief.who_can_apply).toBe('Registered charities in Lambeth.')
    }
  })

  it('does not invent content when the previous brief was empty too', () => {
    const { brief, preserved } = preserveEligibilityFields({ exclusions: null }, { exclusions: null })
    expect(brief.exclusions).toBeNull()
    expect(preserved).toEqual([])
  })

  it('allows a genuine gain when the previous brief had nothing', () => {
    const { brief, preserved } = preserveEligibilityFields(
      { exclusions: 'No exclusions stated.' }, { exclusions: null })
    expect(brief.exclusions).toBe('No exclusions stated.')
    expect(preserved).toEqual([])
  })

  it('handles a missing previous brief without throwing', () => {
    expect(() => preserveEligibilityFields({ exclusions: null }, null)).not.toThrow()
    expect(preserveEligibilityFields({ exclusions: null }, undefined).preserved).toEqual([])
  })

  it('guards who_can_apply as well as exclusions', () => {
    const prev = { exclusions: 'No individuals.', who_can_apply: 'Charities and CICs.' }
    const { preserved } = preserveEligibilityFields({ exclusions: '', who_can_apply: null }, prev)
    expect(preserved.sort()).toEqual(['exclusions', 'who_can_apply'])
  })
})
