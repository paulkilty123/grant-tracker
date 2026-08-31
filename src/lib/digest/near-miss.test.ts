import { describe, it, expect } from 'vitest'
import { findNearMiss, nearMissMeta } from './near-miss'
import type { Organisation, GrantOpportunity } from '@/types'

const acc = {
  name: 'Asian Community Concern',
  legal_structure: 'cic_guarantee',
  annual_income_band: '£100,000–£250,000',
  min_grant_target: 5000,
  max_grant_target: 250000,
  primary_location: 'Ealing, London',
} as unknown as Organisation

const grant = (o: Partial<GrantOpportunity> & Record<string, unknown> = {}): GrantOpportunity => ({
  id: 'g', title: 'A fund', funder: 'A funder', funderType: 'trust_foundation',
  description: '', amountMin: 0, amountMax: 0, deadline: null, isRolling: false,
  isLocal: false, locationTag: null, sectors: [], eligibilityCriteria: [],
  applyUrl: null, isInviteOnly: false, nextOpenDate: null, fundingType: 'grant',
  source: 'scraped', ...o,
} as unknown as GrantOpportunity)

const run = (g: GrantOpportunity, otherwiseFits = true) =>
  findNearMiss({ grant: g, org: acc, readOn: '25 June', otherwiseFits })

describe('structure adjacency', () => {
  it('is near when the funder takes the same company form without CIC status', () => {
    // Network for Social Change, verified in production.
    const n = run(grant({ eligibleStructures: ['registered_charity', 'cio', 'ltd_guarantee', 'unincorporated'] }))
    expect(n?.dimension).toBe('structure')
    expect(n?.verdict).toBe('Ruled out on legal structure.')
    expect(n?.rule).toContain('companies limited by guarantee')
    expect(n?.rule).toContain('You are both')
    expect(n?.condition).toContain('have often not considered CICs')
  })

  it('never renders the two guarantee forms with the same words', () => {
    // The label bug: a CIC limited by guarantee reading "Limited by guarantee"
    // in the allowed list sees its own structure and the row self-contradicts.
    const n = run(grant({ eligibleStructures: ['ltd_guarantee'] }))
    expect(n!.rule).toBe(
      'They fund companies limited by guarantee, but not CICs. You are both — a CIC limited by guarantee.',
    )
  })

  it('is NOT near when no allowed structure is adjacent', () => {
    expect(run(grant({ eligibleStructures: ['llp', 'sole_trader'] }))).toBeNull()
  })

  it('is not a near miss at all when the org already qualifies', () => {
    expect(run(grant({ eligibleStructures: ['cic_guarantee', 'cio'] }))).toBeNull()
  })

  it('never treats an individual-only fund as adjacent to an organisation', () => {
    // An organisation cannot become a person. Nothing to check, nothing to
    // hand back.
    expect(run(grant({ eligibleStructures: ['individual'] }))).toBeNull()
    expect(run(grant({ eligibleStructures: ['sole_trader'] }))).toBeNull()
  })
})

describe('amount', () => {
  it('is near when the funder gives a bit less than the org needs', () => {
    // Trading for Good, verified in production: £1k–£4k against a £5k floor.
    const n = run(grant({
      eligibleStructures: ['cic_guarantee'], amountMin: 1000, amountMax: 4000,
    }))
    expect(n?.dimension).toBe('amount')
    expect(n?.rule).toBe('They give up to £4,000. You told us you are looking for £5,000 or more.')
    expect(n?.condition).toContain('Everything else fits')
  })

  it('is NOT near when the funder gives far less', () => {
    // £500 against a £5,000 floor is not a smaller grant, it is a different
    // kind of thing.
    expect(run(grant({ eligibleStructures: ['cic_guarantee'], amountMax: 500 }))).toBeNull()
  })

  it('drops the "everything else fits" claim when something else also blocks', () => {
    const n = run(grant({ eligibleStructures: ['cic_guarantee'], amountMax: 4000 }), false)
    expect(n?.condition).not.toContain('Everything else fits')
  })
})

describe('area is switched off, and stays off', () => {
  it('never produces a near miss for a fund in another nation', () => {
    // The row this whole rule exists to stop: a Scotland-only fund offered to
    // an organisation in Ealing. Correctly ruled out, and useless — no amount
    // of checking makes Ealing be in Scotland.
    for (const tag of ['Scotland', 'Northern Ireland', 'Wales', 'Hackney']) {
      const n = run(grant({ eligibleStructures: ['cic_guarantee'], locationTag: tag, isLocal: true }))
      expect(n?.dimension).not.toBe('area')
      if (n) expect(n.rule.toLowerCase()).not.toContain(tag.toLowerCase())
    }
  })
})

describe('meta line', () => {
  it('reads funder · range · place', () => {
    expect(nearMissMeta(grant({ funder: 'Trading for Good', amountMin: 1000, amountMax: 4000 }), 'England'))
      .toBe('Trading for Good · £1k – £4k · England')
  })
  it('drops "Global", which is a scope and not a place', () => {
    expect(nearMissMeta(grant({ funder: 'Network for Social Change', amountMin: 25000, amountMax: 100000 }), 'Global'))
      .toBe('Network for Social Change · £25k – £100k')
  })
})
