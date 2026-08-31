import { describe, it, expect } from 'vitest'
import { plainRule, shortDate } from './build'

describe('near-miss rule, in the funder’s terms', () => {
  it('rewrites the engine’s structure message funder-first', () => {
    const raw = 'CIC (limited by guarantee) is not in the eligible structures list ' +
      '(Registered charity, Charitable Incorporated Organisation, Limited by guarantee, Unincorporated)'
    expect(plainRule(raw)).toBe(
      'They fund Registered charity, Charitable Incorporated Organisation, Limited by guarantee ' +
      'and Unincorporated. Our record has you as CIC (limited by guarantee).',
    )
  })

  it('never leaks our vocabulary into the email', () => {
    const raw = 'CIC is not in the eligible structures list (Registered charity, CIO)'
    // "eligible structures list" is a database phrase; nobody says it aloud.
    expect(plainRule(raw)).not.toMatch(/eligible structures list/i)
  })

  it('handles a single allowed structure without a stray "and"', () => {
    expect(plainRule('CIC is not in the eligible structures list (Registered charity)'))
      .toBe('They fund Registered charity. Our record has you as CIC.')
  })

  it('passes anything it does not recognise through untouched', () => {
    // Mangling a rule we do not understand is worse than repeating it.
    const other = 'Restricted to Scotland — your org is in England.'
    expect(plainRule(other)).toBe(other)
  })
})

describe('short dates', () => {
  it('abbreviates every month to exactly three letters', () => {
    // en-GB toLocaleString renders September as "Sept", four characters where
    // every other month is three, and the ragged column shows in the meta line.
    for (let m = 0; m < 12; m++) {
      const iso = `2026-${String(m + 1).padStart(2, '0')}-10`
      const out = shortDate(iso)
      expect(out.split(' ')[1]).toHaveLength(3)
    }
    expect(shortDate('2026-09-10')).toBe('10 Sep')
    expect(shortDate('2026-11-19')).toBe('19 Nov')
  })
})
