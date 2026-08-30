import { describe, it, expect } from 'vitest'
import { decideCheckout, type ExistingSubscription } from './checkout'
import { lookupKeyFor, PLAN_ORDER, BILLING_PERIODS, PRICE_KINDS } from '@/config/plans'
import { TRIAL_DAYS } from '@/lib/trial'

const allKeys = new Set(
  PLAN_ORDER.flatMap(p => PRICE_KINDS.flatMap(k => BILLING_PERIODS.map(b => lookupKeyFor(p, k, b)))),
)
const beforeClose = new Date('2026-10-01T00:00:00Z')
const afterClose  = new Date('2026-11-01T00:00:00Z')

const req = (over: Partial<Parameters<typeof decideCheckout>[0]> = {}) => ({
  plan: 'apply' as const, period: 'monthly' as const,
  kind: 'standard' as const, channel: 'self_serve' as const, ...over,
})

describe('what may be bought', () => {
  it('allows Apply monthly and carries the trial', () => {
    const d = decideCheckout(req(), { availableLookupKeys: allKeys, existing: null })
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.lookupKey).toBe('shoots_apply_standard_monthly')
    expect(d.amount).toBe(2500)
    expect(d.trialDays).toBe(TRIAL_DAYS)
  })

  it('refuses Team to a self-serve buyer, as not-for-sale rather than broken', () => {
    const d = decideCheckout(req({ plan: 'team' }), { availableLookupKeys: allKeys, existing: null })
    expect(d.ok).toBe(false)
    if (d.ok) return
    // The distinction matters: 'price_not_in_stripe' would send someone to fix
    // Stripe for a plan that is working exactly as intended.
    expect(d.code).toBe('plan_not_self_serve')
    expect(d.message).toContain('arranged with us')
  })

  it('allows Team through a granted checkout', () => {
    const d = decideCheckout(req({ plan: 'team', channel: 'granted' }), {
      availableLookupKeys: allKeys, existing: null,
    })
    expect(d.ok).toBe(true)
  })

  it('gives Match no trial', () => {
    const d = decideCheckout(req({ plan: 'match' }), { availableLookupKeys: allKeys, existing: null })
    expect(d.ok && d.trialDays).toBeNull()
  })
})

describe('the founding window', () => {
  it('sells the founding rate while the offer is open', () => {
    const d = decideCheckout(req({ kind: 'founding' }), {
      availableLookupKeys: allKeys, existing: null, now: beforeClose,
    })
    expect(d.ok).toBe(true)
  })

  it('refuses it self-serve once the offer has closed', () => {
    const d = decideCheckout(req({ kind: 'founding' }), {
      availableLookupKeys: allKeys, existing: null, now: afterClose,
    })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.code).toBe('founding_offer_closed')
  })

  it('still grants it after the close, which is the cohort promise', () => {
    const d = decideCheckout(req({ kind: 'founding', channel: 'granted' }), {
      availableLookupKeys: allKeys, existing: null, now: new Date('2027-03-10T09:00:00Z'),
    })
    expect(d.ok).toBe(true)
  })
})

describe('somebody who already pays', () => {
  const sub = (status: string): ExistingSubscription => ({ plan: 'apply', status })

  for (const status of ['trialing', 'active', 'past_due', 'paused', 'incomplete']) {
    it(`refuses a second checkout while ${status}`, () => {
      // Stripe will create a second subscription without complaining, and the
      // customer is then billed twice for one product with no error anywhere.
      const d = decideCheckout(req(), { availableLookupKeys: allKeys, existing: sub(status) })
      expect(d.ok).toBe(false)
      if (!d.ok) expect(d.code).toBe('already_subscribed')
    })
  }

  for (const status of ['canceled', 'incomplete_expired', 'unpaid']) {
    it(`lets somebody buy again after ${status}`, () => {
      const d = decideCheckout(req(), { availableLookupKeys: allKeys, existing: sub(status) })
      expect(d.ok).toBe(true)
    })
  }

  it('offers no second trial to somebody who has subscribed before', () => {
    const d = decideCheckout(req(), { availableLookupKeys: allKeys, existing: sub('canceled') })
    expect(d.ok && d.trialDays).toBeNull()
  })
})

describe('a price Stripe does not have', () => {
  it('refuses, and says it is our fault', () => {
    const d = decideCheckout(req(), { availableLookupKeys: new Set(), existing: null })
    expect(d.ok).toBe(false)
    if (!d.ok) {
      expect(d.code).toBe('price_not_in_stripe')
      expect(d.message).toContain('fault on our side')
    }
  })

  it('reports Team as not-for-sale even when its price is also absent', () => {
    // Order matters. Both conditions hold; the honest one is the decision.
    const d = decideCheckout(req({ plan: 'team' }), { availableLookupKeys: new Set(), existing: null })
    expect(d.ok).toBe(false)
    if (!d.ok) expect(d.code).toBe('plan_not_self_serve')
  })
})
