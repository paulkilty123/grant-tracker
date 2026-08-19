import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PLANS, PLAN_ORDER, isPlanId, priceIdFor, planForPriceId, planAllows, sellablePlans,
} from './plans'

const PRICE_ENVS = PLAN_ORDER.flatMap(id => Object.values(PLANS[id].priceEnv))

function clearPrices() {
  for (const key of PRICE_ENVS) delete process.env[key]
}

let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = Object.fromEntries(PRICE_ENVS.map(k => [k, process.env[k]]))
  clearPrices()
})
afterEach(() => {
  clearPrices()
  for (const [k, v] of Object.entries(saved)) if (v !== undefined) process.env[k] = v
})

describe('the plan shapes Paul set on 2026-08-19', () => {
  it('Match has no pipeline and no application workspace', () => {
    expect(planAllows('match', 'pipeline')).toBe(false)
    expect(planAllows('match', 'applications')).toBe(false)
  })

  it('Apply adds pipeline and applications', () => {
    expect(planAllows('apply', 'pipeline')).toBe(true)
    expect(planAllows('apply', 'applications')).toBe(true)
  })

  it('Team differs from Apply only by the org limit', () => {
    // If this ever stops being true, Team needs another reason to exist.
    const { orgLimit: applyLimit, ...applyRest } = PLANS.apply.capabilities
    const { orgLimit: teamLimit,  ...teamRest  } = PLANS.team.capabilities
    expect(teamRest).toEqual(applyRest)
    expect(applyLimit).toBe(1)
    expect(teamLimit).toBe(3)
  })

  it('gives every plan search, bookmarks and alerts', () => {
    // Eligibility and the catalogue are never a paid differentiator, and new
    // opportunity alerts are a launch feature on every tier.
    for (const id of PLAN_ORDER) {
      expect(planAllows(id, 'search')).toBe(true)
      expect(planAllows(id, 'bookmarks')).toBe(true)
      expect(planAllows(id, 'alerts')).toBe(true)
    }
  })

  it('trials Apply and Team for seven days, and never Match', () => {
    expect(PLANS.match.trialDays).toBeNull()
    expect(PLANS.apply.trialDays).toBe(7)
    expect(PLANS.team.trialDays).toBe(7)
  })
})

describe('prices are configuration, not constants', () => {
  it('holds no amount anywhere in the plan definitions', () => {
    // The whole point: prices move, and a number written here would be a second
    // copy that drifts from Stripe. Catches a "just for now" hardcoded price.
    const serialised = JSON.stringify(PLANS)
    expect(serialised).not.toMatch(/\d{3,}/)
    expect(serialised).not.toContain('£')
  })

  it('names the missing variable when a price is not configured', () => {
    // A checkout session built with an undefined price fails inside Stripe with
    // an error that does not say which plan was missing.
    expect(() => priceIdFor('apply', 'monthly')).toThrow(/STRIPE_PRICE_APPLY_MONTHLY/)
    expect(() => priceIdFor('team', 'annual')).toThrow(/STRIPE_PRICE_TEAM_ANNUAL/)
  })

  it('treats a blank price variable as missing', () => {
    process.env.STRIPE_PRICE_APPLY_MONTHLY = '   '
    expect(() => priceIdFor('apply', 'monthly')).toThrow(/STRIPE_PRICE_APPLY_MONTHLY/)
  })

  it('returns the configured price when it is set', () => {
    process.env.STRIPE_PRICE_APPLY_ANNUAL = 'price_live_apply_annual'
    expect(priceIdFor('apply', 'annual')).toBe('price_live_apply_annual')
  })
})

describe('planForPriceId — what the webhook uses to decide what was bought', () => {
  it('resolves a configured price back to its plan and period', () => {
    process.env.STRIPE_PRICE_TEAM_MONTHLY = 'price_abc'
    expect(planForPriceId('price_abc')).toEqual({ plan: 'team', period: 'monthly' })
  })

  it('returns null for a price it does not recognise', () => {
    // An unknown price must not be guessed into a plan. Guessing here would
    // grant entitlement for something the customer did not buy.
    process.env.STRIPE_PRICE_MATCH_MONTHLY = 'price_known'
    expect(planForPriceId('price_something_else')).toBeNull()
  })

  it('does not match on an unset variable', () => {
    // Both sides undefined must not compare equal and resolve to a plan.
    expect(planForPriceId('')).toBeNull()
    expect(planForPriceId('undefined')).toBeNull()
  })
})

describe('sellablePlans — can we actually take money', () => {
  it('is empty when nothing is configured', () => {
    expect(sellablePlans()).toEqual([])
  })

  it('leaves out a plan with only one of its two periods set', () => {
    // Half-configured is worse than absent: the page would render a button for
    // a period that throws when clicked.
    process.env.STRIPE_PRICE_APPLY_MONTHLY = 'price_m'
    expect(sellablePlans()).toEqual([])
  })

  it('includes a plan once both periods are set, in cheapest-first order', () => {
    process.env.STRIPE_PRICE_APPLY_MONTHLY = 'price_am'
    process.env.STRIPE_PRICE_APPLY_ANNUAL  = 'price_aa'
    process.env.STRIPE_PRICE_MATCH_MONTHLY = 'price_mm'
    process.env.STRIPE_PRICE_MATCH_ANNUAL  = 'price_ma'
    expect(sellablePlans()).toEqual(['match', 'apply'])
  })
})

describe('isPlanId', () => {
  it('accepts the three plans and rejects anything else', () => {
    expect(PLAN_ORDER.every(isPlanId)).toBe(true)
    expect(isPlanId('companion')).toBe(false)
    expect(isPlanId('')).toBe(false)
    expect(isPlanId(undefined)).toBe(false)
  })
})
