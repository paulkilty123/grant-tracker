import { describe, it, expect } from 'vitest'
import { formsNamedIn, namedPositively } from './structure-naming'

describe('structure-naming', () => {
  it('finds the forms a funder actually lists', () => {
    const q = 'Who can apply? Charity, Faith organisation, Social Enterprise/CIC, and Voluntary/Community Group'
    expect(formsNamedIn(q, ['registered_charity', 'cic_guarantee', 'unincorporated', 'not_registered']))
      .toEqual(['registered_charity', 'cic_guarantee', 'unincorporated'])
  })

  // Red Hill Trust. This one sentence was about to add six legal forms.
  it('names nothing when the sentence names no form', () => {
    const q = 'Grants are only awarded to organisations, not individuals.'
    expect(formsNamedIn(q, ['cic_guarantee', 'cic_shares', 'cio', 'ltd_guarantee', 'registered_charity', 'unincorporated']))
      .toEqual([])
  })

  // The Percy Bilton Charity, and Hackney's crisis fund the same day.
  it('does not read "on behalf of individuals" as individuals applying', () => {
    const q = 'Social Workers, Community Psychiatric Nurses and Occupational Therapists within Local Authorities '
      + 'or NHS Trusts may apply on behalf of individuals in financial need'
    expect(namedPositively(q, 'individual')).toBe(false)
  })

  it('does read a genuine invitation to individuals', () => {
    expect(namedPositively('Applications are also accepted from individuals', 'individual')).toBe(true)
    expect(namedPositively('SEAD provides small grants for individuals or groups.', 'individual')).toBe(true)
  })

  it('respects a negation before the form', () => {
    expect(namedPositively('We cannot fund individuals.', 'individual')).toBe(false)
  })

  // English puts the negative on either side. A backward-only guard read this
  // as an invitation, which is how the forward guard came to exist.
  it('respects a negation after the form', () => {
    expect(namedPositively('Unregistered groups are not eligible.', 'not_registered')).toBe(false)
    expect(namedPositively('Individuals cannot apply.', 'individual')).toBe(false)
    expect(namedPositively('Community groups are excluded from this round.', 'unincorporated')).toBe(false)
  })

  // The one the extractor invented 50 times. "Community group" is unincorporated.
  it('does not read "community groups" as not_registered', () => {
    const q = 'The fund is available to voluntary organisations, community groups and small charities'
    expect(namedPositively(q, 'not_registered')).toBe(false)
    expect(namedPositively(q, 'unincorporated')).toBe(true)
  })

  it('does read an explicit invitation to unconstituted groups', () => {
    expect(namedPositively("You don't need to be a registered charity to apply.", 'not_registered')).toBe(true)
  })

  it('returns nothing for an empty quote', () => {
    expect(formsNamedIn('', ['registered_charity'])).toEqual([])
    expect(formsNamedIn('   ', ['registered_charity'])).toEqual([])
  })
})
