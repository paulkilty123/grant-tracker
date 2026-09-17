import { describe, it, expect } from 'vitest'
import {
  PLANS, PLAN_ORDER, PRICE_KINDS, BILLING_PERIODS, isPlanId, planAllows,
  lookupKeyFor, planForLookupKey, amountFor, definedPrices, formatAmount,
  sellablePlans, contactOnlyPlans, fromPriceLabel, FOUNDING_OFFER_CLOSES,
  LAUNCH_OFFER_CLOSES, LAUNCH_PRICE_MONTHS, hasPrices,
} from './plans'
import { TRIAL_DAYS, TRIAL_PLAN } from '@/lib/trial'

// The predecessor of this suite had a test asserting that no amount appeared
// anywhere in PLANS. It is deliberately gone, not accidentally lost: Paul's
// 29 August decision is that products and prices are created FROM this config
// and the Stripe dashboard stays empty, which cannot be true if the repo does
// not know the amounts. Restoring that test would re-open the question.

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
    // Five people or five organisation profiles, Paul, 5 September.
    expect(teamLimit).toBe(5)
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
})

describe('the trial, which must agree with src/lib/trial.ts', () => {
  // This file once said 7 while the app said 14. A trial length is a
  // commercial promise; two different ones in one codebase is the failure
  // this suite exists to prevent, so the assertion is against the other
  // module rather than against a literal.
  it('trials Apply for exactly the length trial.ts publishes', () => {
    expect(PLANS.apply.trialDays).toBe(TRIAL_DAYS)
  })

  it('trials the plan trial.ts names, and only that one', () => {
    const trialling = PLAN_ORDER.filter(id => PLANS[id].trialDays !== null)
    expect(trialling).toEqual(['apply'])
    expect(PLANS.apply.name).toBe(TRIAL_PLAN)
  })

  it('does not trial Match, which has nothing to trial into', () => {
    expect(PLANS.match.trialDays).toBeNull()
  })
})

describe('the prices Paul set on 2026-09-05', () => {
  // Written out longhand and checked one by one. These are the figures that
  // get charged; a clever derivation here would hide a typo behind a formula.
  const PRICED = ['match', 'apply'] as const

  it('carries the list prices, monthly and annual', () => {
    expect(amountFor('match', 'standard', 'monthly')).toBe(1900)
    expect(amountFor('apply', 'standard', 'monthly')).toBe(3500)
    expect(amountFor('match', 'standard', 'annual')).toBe(19000)
    expect(amountFor('apply', 'standard', 'annual')).toBe(35000)
  })

  it('carries the launch prices, monthly and annual', () => {
    // The figures the launch email of 10 September promised in writing.
    expect(amountFor('match', 'launch', 'monthly')).toBe(1500)
    expect(amountFor('apply', 'launch', 'monthly')).toBe(2500)
    expect(amountFor('match', 'launch', 'annual')).toBe(15000)
    expect(amountFor('apply', 'launch', 'annual')).toBe(25000)
  })

  it('keeps the founding prices as promised on 2026-08-29', () => {
    // Unchanged until Paul decides the cohort rate. Not self-serve any more.
    expect(amountFor('match', 'founding', 'monthly')).toBe(1200)
    expect(amountFor('apply', 'founding', 'monthly')).toBe(2000)
    expect(amountFor('match', 'founding', 'annual')).toBe(12000)
    expect(amountFor('apply', 'founding', 'annual')).toBe(20000)
  })

  it('gives Team no price at all', () => {
    // Paul, 5 September: no figure shown, every enquiry is a conversation.
    expect(hasPrices('team')).toBe(false)
    for (const kind of PRICE_KINDS) for (const period of BILLING_PERIODS) {
      expect(amountFor('team', kind, period)).toBeNull()
    }
  })

  it('prices a year at ten months in every priced plan and every kind', () => {
    // Two months free is the offer. A typo in one annual figure is otherwise invisible.
    for (const plan of PRICED) for (const kind of PRICE_KINDS) {
      expect(amountFor(plan, kind, 'annual')).toBe(amountFor(plan, kind, 'monthly')! * 10)
    }
  })

  it('never prices launch or founding above standard', () => {
    for (const plan of PRICED) for (const period of BILLING_PERIODS) {
      expect(amountFor(plan, 'launch', period)!).toBeLessThan(amountFor(plan, 'standard', period)!)
      expect(amountFor(plan, 'founding', period)!).toBeLessThan(amountFor(plan, 'standard', period)!)
    }
  })

  it('prices the priced plans in the order it presents them', () => {
    const monthly = PRICED.map(p => amountFor(p, 'standard', 'monthly')!)
    expect([...monthly].sort((a, b) => a - b)).toEqual(monthly)
  })

  it('closes both public offers at the end of October 2026, and holds launch for twelve months', () => {
    for (const closes of [FOUNDING_OFFER_CLOSES, LAUNCH_OFFER_CLOSES]) {
      expect(new Date(closes).getUTCMonth()).toBe(9)
      expect(new Date(closes).getUTCFullYear()).toBe(2026)
    }
    expect(LAUNCH_PRICE_MONTHS).toBe(12)
  })
})

describe('lookup keys — the repo owns the name, Stripe owns the id', () => {
  it('round-trips every price it defines', () => {
    for (const plan of PLAN_ORDER) {
      for (const kind of PRICE_KINDS) {
        for (const period of BILLING_PERIODS) {
          const key = lookupKeyFor(plan, kind, period)
          expect(planForLookupKey(key)).toEqual({ plan, kind, period })
        }
      }
    }
  })

  it('returns null for a key it does not recognise', () => {
    // An unknown price must not be guessed into a plan. Guessing grants
    // entitlement for something the customer did not buy.
    expect(planForLookupKey('shoots_match_standard_weekly')).toBeNull()
    expect(planForLookupKey('price_1234')).toBeNull()
    expect(planForLookupKey('')).toBeNull()
  })

  it('produces distinct keys for every price', () => {
    const keys = PLAN_ORDER.flatMap(p =>
      PRICE_KINDS.flatMap(k => BILLING_PERIODS.map(b => lookupKeyFor(p, k, b))))
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('definedPrices — what the sync script will create', () => {
  it('lists the twelve prices of the two priced plans, and nothing for Team', () => {
    // 2 plans x 3 kinds x 2 periods. Team has no price, so nothing is created
    // in Stripe for it.
    const prices = definedPrices()
    expect(prices).toHaveLength(12)
    expect(prices.filter(p => p.kind === 'launch')).toHaveLength(4)
    expect(prices.some(p => p.plan === 'team')).toBe(false)
  })

  it('gives every entry a positive amount and its lookup key', () => {
    for (const p of definedPrices()) {
      expect(p.amount).toBeGreaterThan(0)
      expect(p.lookupKey).toBe(lookupKeyFor(p.plan, p.kind, p.period))
    }
  })
})

describe('formatAmount', () => {
  it('drops the decimals on whole pounds', () => {
    expect(formatAmount(1500)).toBe('£15')
    expect(formatAmount(45000)).toBe('£450')
  })

  it('keeps them when there are pence, rather than rounding', () => {
    // Rounding down would understate what somebody is about to be charged.
    expect(formatAmount(1250)).toBe('£12.50')
    expect(formatAmount(999)).toBe('£9.99')
  })
})

describe('sellablePlans — can we actually take money', () => {
  const keys = (...k: string[]) => new Set(k)

  it('is empty when Stripe holds nothing', () => {
    expect(sellablePlans(keys())).toEqual([])
  })

  it('leaves out a plan with only one of its two periods', () => {
    // Half-configured is worse than absent: the page renders a button for a
    // period that fails when clicked.
    expect(sellablePlans(keys(lookupKeyFor('apply', 'standard', 'monthly')))).toEqual([])
  })

  it('includes a plan once both periods exist, in cheapest-first order', () => {
    expect(sellablePlans(keys(
      lookupKeyFor('apply', 'standard', 'monthly'),
      lookupKeyFor('apply', 'standard', 'annual'),
      lookupKeyFor('match', 'standard', 'monthly'),
      lookupKeyFor('match', 'standard', 'annual'),
    ))).toEqual(['match', 'apply'])
  })

  it('never offers Team, even with both its prices in Stripe', () => {
    // The assertion this section exists for. Team's whole value over Apply is
    // orgLimit, and nothing enforces orgLimit — so selling it would charge £45
    // for something Apply already gives away. Paul's call, 30 August.
    expect(sellablePlans(keys(
      lookupKeyFor('team', 'standard', 'monthly'),
      lookupKeyFor('team', 'standard', 'annual'),
    ))).toEqual([])
  })

  it('does not require the founding price to sell a plan', () => {
    // The founding rate is an offer, not the product, and it closes in October.
    expect(sellablePlans(keys(
      lookupKeyFor('apply', 'standard', 'monthly'),
      lookupKeyFor('apply', 'standard', 'annual'),
    ))).toEqual(['apply'])
  })

  it('sells on the launch keys while the launch price is what the page offers', () => {
    // The pricing page asks for the kind it is showing. Standard keys alone
    // do not make a plan sellable at the launch price.
    const launchKeys = keys(lookupKeyFor('apply', 'launch', 'monthly'), lookupKeyFor('apply', 'launch', 'annual'))
    expect(sellablePlans(launchKeys, 'launch')).toEqual(['apply'])
    expect(sellablePlans(launchKeys, 'standard')).toEqual([])
  })
})

describe('plans you have to ask about', () => {
  it('lists Team, and only Team', () => {
    expect(contactOnlyPlans()).toEqual(['team'])
  })

  it('never lists a plan that is also sellable', () => {
    // The two lists must not overlap, or the pricing page renders a buy button
    // and a "get in touch" for the same plan.
    const sellable = new Set(sellablePlans(new Set(
      PLAN_ORDER.flatMap(p => BILLING_PERIODS.map(b => lookupKeyFor(p, 'standard', b))),
    )))
    for (const plan of contactOnlyPlans()) expect(sellable.has(plan)).toBe(false)
  })

  it('shows no figure for Team', () => {
    expect(fromPriceLabel('team')).toBe('Get in touch')
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
