import { describe, it, expect } from 'vitest'
import {
  instrumentsOf,
  instrumentRequiresShareCapital,
  structureCanHoldShareCapital,
  barredStructuresFor,
  checkInstrumentAgainstStructure,
} from './instrument-structure'

// Every live row carrying equity on 2026-08-21, as it stood before the fix.
// Fixtures rather than illustrations: all but one were published and active and
// being matched to organisations, and this suite is what stops that returning.
//
// The last two are the ones that matter most. Both offer equity ALONGSIDE a
// loan, and both correctly list charities as eligible, so a gate that blocked on
// "contains equity" would have hidden two good loan funds from every charity in
// the catalogue. `barred` is empty for them on purpose.
const LIVE_2026_08_21 = [
  {
    title: 'Black Seed VC',
    subtypes: ['equity'],
    structures: ['ltd_shares', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    barred: ['cic_guarantee', 'ltd_guarantee'],
  },
  {
    title: 'Tech for Good Programme',
    subtypes: ['equity'],
    structures: ['ltd_guarantee', 'ltd_shares', 'cooperative'],
    barred: ['ltd_guarantee'],
  },
  {
    title: 'Community Shares — Booster Fund',
    subtypes: ['equity'],
    structures: ['cooperative'],
    barred: [],
  },
  {
    title: 'Social Investment Fund for London',
    subtypes: ['equity'],
    structures: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'registered_charity', 'cio', 'sole_trader'],
    barred: ['cic_guarantee', 'ltd_guarantee', 'registered_charity', 'cio', 'sole_trader'],
  },
  {
    title: 'Trust for London — Social Investment Programme',
    subtypes: ['loan', 'equity', 'social_investment'],
    structures: ['cic_guarantee', 'cic_shares', 'registered_charity', 'cio', 'ltd_guarantee', 'ltd_shares', 'cooperative'],
    barred: [],
  },
  {
    title: 'Growth Impact Fund',
    subtypes: ['loan', 'equity', 'revenue_share', 'social_investment'],
    structures: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'registered_charity', 'scio', 'cio', 'ltd_shares'],
    barred: [],
  },
]

describe('the live rows that prompted this gate', () => {
  for (const row of LIVE_2026_08_21) {
    it(`${row.title}: names exactly the structures its own offer rules out`, () => {
      expect(barredStructuresFor(row.subtypes, row.structures)).toEqual(row.barred)
    })
  }

  it('flags the three equity-only rows and leaves the two mixed funds alone', () => {
    const failing = LIVE_2026_08_21.filter(r => barredStructuresFor(r.subtypes, r.structures).length > 0)
    expect(failing.map(r => r.title)).toEqual([
      'Black Seed VC',
      'Tech for Good Programme',
      'Social Investment Fund for London',
    ])
  })

  it('a charity is blocked from Black Seed and merely informed about Trust for London', () => {
    // The single most important distinction in this file. Getting it wrong in
    // either direction is a real harm: block both and we hide a loan fund,
    // block neither and we offer equity to a body that cannot issue it.
    expect(checkInstrumentAgainstStructure(['equity'], 'registered_charity')?.severity).toBe('blocker')
    const mixed = checkInstrumentAgainstStructure(['loan', 'equity', 'social_investment'], 'registered_charity')
    expect(mixed?.code).toBe('instrument_partly_out_of_reach')
    expect(mixed?.severity).toBe('info')
    expect(mixed?.message).toMatch(/loan and social investment/)
  })
})

describe('instrumentsOf', () => {
  it('prefers the array, which is the source of truth since migration 065', () => {
    expect(instrumentsOf(['loan', 'equity'], 'loan')).toEqual(['loan', 'equity'])
  })

  it('falls back to the singular for the rows with no array yet', () => {
    expect(instrumentsOf(null, 'equity')).toEqual(['equity'])
    expect(instrumentsOf([], 'equity')).toEqual(['equity'])
  })

  it('lowercases, trims, drops blanks and dedupes', () => {
    expect(instrumentsOf([' Equity ', 'equity', '', 'LOAN'])).toEqual(['equity', 'loan'])
  })

  it('returns empty when there is nothing to read', () => {
    expect(instrumentsOf(null, null)).toEqual([])
    expect(instrumentsOf(undefined)).toEqual([])
  })
})

describe('structureCanHoldShareCapital', () => {
  it('bars every form with no share capital', () => {
    for (const s of [
      'ltd_guarantee', 'cic_guarantee', 'registered_charity', 'cio', 'scio',
      'unincorporated', 'sole_trader', 'not_registered', 'individual',
    ]) {
      expect(structureCanHoldShareCapital(s)).toBe(false)
    }
  })

  it('permits the forms that do have share capital', () => {
    for (const s of ['ltd_shares', 'cic_shares', 'cooperative', 'llp']) {
      expect(structureCanHoldShareCapital(s)).toBe(true)
    }
  })

  it('treats an unset structure as no finding rather than as barred', () => {
    // The floor rule: an org that has not told us its structure is a gap, not a
    // verdict. Blocking here would bury every investment row for anyone who
    // skipped that field on the profile.
    expect(structureCanHoldShareCapital(null)).toBe(true)
    expect(structureCanHoldShareCapital(undefined)).toBe(true)
    expect(structureCanHoldShareCapital('')).toBe(true)
  })

  it('is not fooled by case or padding, which is how the DB stores some of these', () => {
    expect(structureCanHoldShareCapital(' CIC_Guarantee ')).toBe(false)
  })
})

describe('instrumentRequiresShareCapital', () => {
  it('gates equity and convertible', () => {
    expect(instrumentRequiresShareCapital('equity')).toBe(true)
    expect(instrumentRequiresShareCapital('convertible')).toBe(true)
  })

  it('does NOT gate quasi-equity', () => {
    // Revenue participation agreements exist so that asset-locked organisations
    // can take risk capital without issuing shares. Blocking this would remove
    // the one repayable instrument designed for our core audience, which is a
    // bigger harm than the one the gate is for.
    expect(instrumentRequiresShareCapital('quasi_equity')).toBe(false)
  })

  it('does not gate the ordinary repayable instruments', () => {
    for (const i of ['loan', 'blended', 'social_investment', 'revenue_share', 'community_shares']) {
      expect(instrumentRequiresShareCapital(i)).toBe(false)
    }
  })

  it('says nothing about grant and programme subtypes', () => {
    for (const i of ['unrestricted', 'small_grant', 'accelerator', 'fellowship', null, undefined, '']) {
      expect(instrumentRequiresShareCapital(i)).toBe(false)
    }
  })
})

describe('checkInstrumentAgainstStructure', () => {
  it('blocks equity for a CIO', () => {
    const issue = checkInstrumentAgainstStructure(['equity'], 'cio')
    expect(issue?.code).toBe('instrument_requires_share_capital')
    expect(issue?.severity).toBe('blocker')
    expect(issue?.message).toMatch(/no share capital/)
  })

  it('blocks equity for a CIC limited by guarantee but not one limited by shares', () => {
    // The distinction the whole gate turns on, and the one the catalogue got
    // wrong on Black Seed VC.
    expect(checkInstrumentAgainstStructure(['equity'], 'cic_guarantee')?.severity).toBe('blocker')
    expect(checkInstrumentAgainstStructure(['equity'], 'cic_shares')).toBeNull()
  })

  it('blocks a row whose every instrument needs shares', () => {
    expect(checkInstrumentAgainstStructure(['equity', 'convertible'], 'cio')?.severity).toBe('blocker')
  })

  it('reads the singular only when the array is empty', () => {
    expect(checkInstrumentAgainstStructure(null, 'cio', 'equity')?.severity).toBe('blocker')
    // Array wins: a row whose array says loan+equity is NOT blocked, even though
    // the trigger-maintained singular happens to read "equity".
    expect(checkInstrumentAgainstStructure(['loan', 'equity'], 'cio', 'equity')?.severity).toBe('info')
  })

  it('lets a charity through on quasi-equity and on a loan', () => {
    expect(checkInstrumentAgainstStructure(['quasi_equity'], 'registered_charity')).toBeNull()
    expect(checkInstrumentAgainstStructure(['loan'], 'registered_charity')).toBeNull()
  })

  it('warns on community shares only when they are the whole offer', () => {
    // Real rule, unreliable data. Our live community-shares rows are platforms
    // and support funds rather than single offers, so a blocker would be
    // confidently wrong more often than it would be right.
    const issue = checkInstrumentAgainstStructure(['community_shares'], 'registered_charity')
    expect(issue?.code).toBe('instrument_requires_society')
    expect(issue?.severity).toBe('warning')
    expect(checkInstrumentAgainstStructure(['community_shares'], 'cooperative')).toBeNull()
    // Ethex offers more than one thing, so it is not a society-only row.
    expect(checkInstrumentAgainstStructure(['community_shares', 'loan'], 'registered_charity')).toBeNull()
  })

  it('says nothing when the org has not set a structure', () => {
    expect(checkInstrumentAgainstStructure(['equity'], null)).toBeNull()
  })

  it('says nothing about an instrument it does not gate', () => {
    expect(checkInstrumentAgainstStructure(['small_grant'], 'cio')).toBeNull()
    expect(checkInstrumentAgainstStructure(null, 'cio')).toBeNull()
  })
})

describe('barredStructuresFor', () => {
  it('returns empty for an instrument it does not gate, so callers need one check not two', () => {
    expect(barredStructuresFor(['loan'], ['cio', 'registered_charity'])).toEqual([])
    expect(barredStructuresFor(['quasi_equity'], ['cio'])).toEqual([])
  })

  it('returns empty for a mixed offer, because such a row is not wrong', () => {
    expect(barredStructuresFor(['loan', 'equity'], ['cio', 'registered_charity'])).toEqual([])
  })

  it('handles a missing or empty structures list', () => {
    expect(barredStructuresFor(['equity'], null)).toEqual([])
    expect(barredStructuresFor(['equity'], [])).toEqual([])
  })
})
