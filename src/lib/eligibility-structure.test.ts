import { describe, it, expect } from 'vitest'
import { runEligibilityChecks } from './eligibility'
import type { EligibilityIssue } from './eligibility'
import type { Organisation, GrantOpportunity } from '@/types'

const org = (legal_structure: string) => ({ legal_structure, name: 'Test' } as unknown as Organisation)
const opp = (eligibleStructures: string[]) => ({
  id: 'g', title: 'A fund', funder: 'F', fundingType: 'grant',
  eligibleStructures, eligibilityCriteria: [],
} as unknown as GrantOpportunity)

const blocked = (o: string, allowed: string[]) =>
  (runEligibilityChecks(opp(allowed), org(o)).issues ?? [])
    .some((i: EligibilityIssue) => i.code === 'structure_mismatch' && i.severity === 'blocker')

describe('a CIC limited by guarantee IS a company limited by guarantee', () => {
  it('is not blocked by a fund open to companies limited by guarantee', () => {
    // Companies House registers a CIC limited by guarantee as a private
    // company limited by guarantee; CIC status sits on top of that form.
    expect(blocked('cic_guarantee', ['ltd_guarantee'])).toBe(false)
    expect(blocked('cic_shares', ['ltd_shares'])).toBe(false)
  })

  it('is the real Network for Social Change case', () => {
    // Its own "who can apply" welcomes CICs; the structure list omitted them,
    // and that row was generating a near miss for a CIC the funder wants.
    expect(blocked('cic_guarantee', ['registered_charity', 'cio', 'ltd_guarantee', 'unincorporated'])).toBe(false)
  })
})

describe('containment runs one way only', () => {
  it('a plain company limited by guarantee is NOT a CIC', () => {
    // The direction that must never open: a fund restricted to CICs is not
    // satisfied by any company that has not taken CIC status.
    expect(blocked('ltd_guarantee', ['cic_guarantee'])).toBe(true)
    expect(blocked('ltd_shares', ['cic_shares'])).toBe(true)
  })

  it('still blocks genuinely unrelated forms', () => {
    expect(blocked('cic_guarantee', ['individual'])).toBe(true)
    expect(blocked('sole_trader', ['registered_charity'])).toBe(true)
  })
})
