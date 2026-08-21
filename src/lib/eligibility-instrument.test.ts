// Does the gate actually reach a verdict, or does it just exist?
//
// instrument-structure.test.ts proves the helper is right. This proves it is
// WIRED — that a real opportunity and a real organisation, run through the
// engine every surface calls, come out 'ineligible'. The two are separate
// suites on purpose: `feedback_guard_wired_to_one_sibling` is the standing
// lesson that a correct helper and a call site that skips it look identical
// from the helper's own tests.

import { describe, it, expect } from 'vitest'
import { runEligibilityChecks } from './eligibility'
import type { GrantOpportunity, Organisation } from '@/types'

function opportunity(over: Partial<GrantOpportunity> = {}): GrantOpportunity {
  return {
    id: 'test',
    title: 'Test fund',
    funder: 'Test funder',
    funderType: 'trust_foundation',
    fundingType: 'investment',
    description: '',
    amountMin: 0,
    amountMax: 0,
    deadline: null,
    isRolling: true,
    isLocal: false,
    sectors: [],
    eligibilityCriteria: [],
    applyUrl: null,
    isInviteOnly: false,
    source: 'scraped',
    ...over,
  } as GrantOpportunity
}

function org(over: Partial<Organisation> = {}): Organisation {
  return {
    id: 'org',
    name: 'Test org',
    legal_structure: 'cio',
    ...over,
  } as Organisation
}

describe('the equity gate, end to end through runEligibilityChecks', () => {
  it('marks a CIO ineligible for an equity investment', () => {
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtypes: ['equity'] }),
      org({ legal_structure: 'cio' }),
    )
    expect(verdict.status).toBe('ineligible')
    expect(verdict.issues.some(i => i.code === 'instrument_requires_share_capital')).toBe(true)
  })

  it('leads with the instrument, not the funder eligibility list', () => {
    // Both blockers fire on this row. The instrument message is the more useful
    // one, because "the funder did not list you" invites a phone call and "you
    // have no share capital" does not, so it must sort first.
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtypes: ['equity'], eligibleStructures: ['ltd_shares'] }),
      org({ legal_structure: 'registered_charity' }),
    )
    expect(verdict.issues[0]?.code).toBe('instrument_requires_share_capital')
    expect(verdict.reason).toMatch(/no share capital/)
  })

  it('fires even when the row is mistagged as a grant', () => {
    // The Community Shares Booster case: funding_type='grant' carrying an equity
    // subtype. Routing on kind would have missed it entirely.
    const verdict = runEligibilityChecks(
      opportunity({ fundingType: 'grant', fundingSubtypes: ['equity'] }),
      org({ legal_structure: 'cic_guarantee' }),
    )
    expect(verdict.status).toBe('ineligible')
  })

  it('reads the array, not the trigger-maintained singular', () => {
    // Trust for London: ['loan','equity','social_investment'] with
    // funding_subtype='loan'. Reading the singular sees only the loan and lets
    // it pass silently; reading the array sees the equity and says so without
    // burying a fund the charity can genuinely use.
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtype: 'loan', fundingSubtypes: ['loan', 'equity', 'social_investment'] }),
      org({ legal_structure: 'registered_charity' }),
    )
    expect(verdict.status).not.toBe('ineligible')
    expect(verdict.issues.some(i => i.code === 'instrument_partly_out_of_reach')).toBe(true)
  })

  it('falls back to si_instrument_type when nothing else carries an instrument', () => {
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtype: null, fundingSubtypes: [], siInstrumentType: 'equity' }),
      org({ legal_structure: 'cio' }),
    )
    expect(verdict.status).toBe('ineligible')
  })

  // ── The other half: it has to be able to NOT fire ──────────────────────────
  // A check that cannot come back clean is not a check. Each of these would go
  // red if the barred set, the instrument set or the null handling drifted.

  it('does not fire for a CIC limited by shares', () => {
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtypes: ['equity'] }),
      org({ legal_structure: 'cic_shares' }),
    )
    expect(verdict.issues.some(i => i.code === 'instrument_requires_share_capital')).toBe(false)
  })

  it('does not fire on a loan to a charity', () => {
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtypes: ['loan'] }),
      org({ legal_structure: 'registered_charity' }),
    )
    expect(verdict.issues.some(i => i.code === 'instrument_requires_share_capital')).toBe(false)
  })

  it('does not fire on an ordinary grant', () => {
    const verdict = runEligibilityChecks(
      opportunity({ fundingType: 'grant', fundingSubtypes: ['small_grant'] }),
      org({ legal_structure: 'cio' }),
    )
    expect(verdict.issues.some(i => i.code === 'instrument_requires_share_capital')).toBe(false)
  })

  it('does not fire when the org has no structure on its profile', () => {
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtypes: ['equity'] }),
      org({ legal_structure: null }),
    )
    expect(verdict.issues.some(i => i.code === 'instrument_requires_share_capital')).toBe(false)
  })

  it('downgrades to check_required, not ineligible, on community shares', () => {
    const verdict = runEligibilityChecks(
      opportunity({ fundingSubtypes: ['community_shares'] }),
      org({ legal_structure: 'registered_charity' }),
    )
    expect(verdict.status).toBe('check_required')
    expect(verdict.issues.some(i => i.code === 'instrument_requires_society')).toBe(true)
  })
})
