import { describe, it, expect } from 'vitest'
import {
  instrumentRequiresShareCapital,
  structureCanHoldShareCapital,
  barredStructuresFor,
  checkInstrumentAgainstStructure,
} from './instrument-structure'

// The four live equity-tagged rows as they stood on 2026-08-21, before the fix.
// They are fixtures rather than illustrations: three of them were published,
// active and being matched to organisations that legally could not take the
// instrument, and this suite is what stops that returning.
const LIVE_2026_08_21 = [
  {
    title: 'Black Seed VC',
    subtype: 'equity',
    structures: ['ltd_shares', 'cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative'],
    barred: ['cic_guarantee', 'ltd_guarantee'],
  },
  {
    title: 'Tech for Good Programme',
    subtype: 'equity',
    structures: ['ltd_guarantee', 'ltd_shares', 'cooperative'],
    barred: ['ltd_guarantee'],
  },
  {
    title: 'Community Shares — Booster Fund',
    subtype: 'equity',
    structures: ['cooperative'],
    barred: [],
  },
  {
    title: 'Social Investment Fund for London',
    subtype: 'equity',
    structures: ['cic_guarantee', 'cic_shares', 'ltd_guarantee', 'cooperative', 'registered_charity', 'cio', 'sole_trader'],
    barred: ['cic_guarantee', 'ltd_guarantee', 'registered_charity', 'cio', 'sole_trader'],
  },
]

describe('the live rows that prompted this gate', () => {
  for (const row of LIVE_2026_08_21) {
    it(`${row.title}: names exactly the structures that cannot hold equity`, () => {
      expect(barredStructuresFor(row.subtype, row.structures)).toEqual(row.barred)
    })
  }

  it('caught three of the four rows, which is the finding', () => {
    const failing = LIVE_2026_08_21.filter(r => barredStructuresFor(r.subtype, r.structures).length > 0)
    expect(failing.map(r => r.title)).toEqual([
      'Black Seed VC',
      'Tech for Good Programme',
      'Social Investment Fund for London',
    ])
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
    const issue = checkInstrumentAgainstStructure('equity', 'cio')
    expect(issue?.code).toBe('instrument_requires_share_capital')
    expect(issue?.severity).toBe('blocker')
    expect(issue?.message).toMatch(/no share capital/)
  })

  it('blocks equity for a CIC limited by guarantee but not one limited by shares', () => {
    // The distinction the whole gate turns on, and the one the catalogue got
    // wrong on Black Seed VC.
    expect(checkInstrumentAgainstStructure('equity', 'cic_guarantee')?.severity).toBe('blocker')
    expect(checkInstrumentAgainstStructure('equity', 'cic_shares')).toBeNull()
  })

  it('lets a charity through on quasi-equity and on a loan', () => {
    expect(checkInstrumentAgainstStructure('quasi_equity', 'registered_charity')).toBeNull()
    expect(checkInstrumentAgainstStructure('loan', 'registered_charity')).toBeNull()
  })

  it('warns rather than blocks on community shares outside a society', () => {
    // Real rule, unreliable data. Our live community-shares rows are platforms
    // and support funds rather than single offers, so a blocker would be
    // confidently wrong more often than it would be right.
    const issue = checkInstrumentAgainstStructure('community_shares', 'registered_charity')
    expect(issue?.code).toBe('instrument_requires_society')
    expect(issue?.severity).toBe('warning')
    expect(checkInstrumentAgainstStructure('community_shares', 'cooperative')).toBeNull()
  })

  it('says nothing when the org has not set a structure', () => {
    expect(checkInstrumentAgainstStructure('equity', null)).toBeNull()
  })

  it('says nothing about an instrument it does not gate', () => {
    expect(checkInstrumentAgainstStructure('small_grant', 'cio')).toBeNull()
    expect(checkInstrumentAgainstStructure(null, 'cio')).toBeNull()
  })
})

describe('barredStructuresFor', () => {
  it('returns empty for an instrument it does not gate, so callers need one check not two', () => {
    expect(barredStructuresFor('loan', ['cio', 'registered_charity'])).toEqual([])
    expect(barredStructuresFor('quasi_equity', ['cio'])).toEqual([])
  })

  it('handles a missing or empty structures list', () => {
    expect(barredStructuresFor('equity', null)).toEqual([])
    expect(barredStructuresFor('equity', [])).toEqual([])
  })
})
