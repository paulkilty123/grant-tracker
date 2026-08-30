import { describe, it, expect } from 'vitest'
import { mapSubscription, type StripeSubscriptionLike } from './webhook-map'
import { lookupKeyFor } from '@/config/plans'

const sub = (over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike => ({
  id: 'sub_1', status: 'active', customer: 'cus_1',
  cancel_at_period_end: false,
  current_period_end: 1793318400,           // 2026-10-30T00:00:00Z
  trial_end: null,
  metadata: { owner_id: '11111111-1111-1111-1111-111111111111' },
  items: { data: [{ price: { id: 'price_1', lookup_key: lookupKeyFor('apply', 'standard', 'monthly') } }] },
  ...over,
})

describe('a subscription we recognise', () => {
  it('maps to the row the database expects', () => {
    const r = mapSubscription(sub())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.row).toEqual({
      owner_id: '11111111-1111-1111-1111-111111111111',
      plan: 'apply',
      status: 'active',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      stripe_price_id: 'price_1',
      current_period_end: '2026-10-30T00:00:00.000Z',
      cancel_at_period_end: false,
      trial_end: null,
    })
    expect(r.period).toBe('monthly')
    expect(r.kind).toBe('standard')
  })

  it('carries the status through verbatim rather than simplifying it', () => {
    for (const status of ['trialing', 'past_due', 'canceled', 'unpaid', 'paused']) {
      const r = mapSubscription(sub({ status }))
      expect(r.ok && r.row.status).toBe(status)
    }
  })

  it('recognises a founding annual price as founding and annual', () => {
    const r = mapSubscription(sub({
      items: { data: [{ price: { id: 'p', lookup_key: lookupKeyFor('team', 'founding', 'annual') } }] },
    }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.row.plan).toBe('team')
      expect(r.kind).toBe('founding')
      expect(r.period).toBe('annual')
    }
  })

  it('converts Stripe seconds to ISO, including the trial end', () => {
    const r = mapSubscription(sub({ trial_end: 1788998400 }))  // 2026-09-10, verified with python rather than guessed
    expect(r.ok && r.row.trial_end).toBe('2026-09-10T00:00:00.000Z')
  })

  it('keeps a pending cancellation as a flag, not as a status change', () => {
    // Stripe leaves the status 'active' until the period ends, and entitlement
    // depends on that. Rewriting it here would cut access off early.
    const r = mapSubscription(sub({ cancel_at_period_end: true }))
    expect(r.ok && r.row.status).toBe('active')
    expect(r.ok && r.row.cancel_at_period_end).toBe(true)
  })
})

describe('what it refuses, rather than guesses', () => {
  it('refuses a price it does not recognise', () => {
    // The expensive failure: falling back to a default here grants a paid tier
    // for something nobody bought, and it looks exactly like it worked.
    const r = mapSubscription(sub({
      items: { data: [{ price: { id: 'p', lookup_key: 'someone_elses_price' } }] },
    }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('unknown_price')
  })

  it('refuses a price with no lookup key at all', () => {
    // What a price created by hand in the dashboard looks like.
    const r = mapSubscription(sub({ items: { data: [{ price: { id: 'p', lookup_key: null } }] } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_lookup_key')
  })

  it('refuses a subscription with no owner_id metadata', () => {
    // Writing this against a guessed owner grants a stranger's organisation the
    // paid tier.
    const cases: (Record<string, string> | null)[] = [null, {}, { owner_id: '   ' }]
    for (const metadata of cases) {
      const r = mapSubscription(sub({ metadata }))
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toBe('no_owner_metadata')
    }
  })

  it('refuses a multi-item subscription instead of taking the first', () => {
    const r = mapSubscription(sub({
      items: { data: [
        { price: { id: 'a', lookup_key: lookupKeyFor('match', 'standard', 'monthly') } },
        { price: { id: 'b', lookup_key: lookupKeyFor('team', 'standard', 'annual') } },
      ] },
    }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('multiple_items')
  })

  it('refuses an empty item list', () => {
    const r = mapSubscription(sub({ items: { data: [] } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_items')
  })

  it('names the offending value in every refusal, for the log', () => {
    const r = mapSubscription(sub({ items: { data: [{ price: { id: 'p', lookup_key: 'nope' } }] } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toContain('nope')
  })
})

describe('replay and out-of-order safety', () => {
  it('is a pure function of the subscription, so a replay maps identically', () => {
    // The route re-fetches from Stripe rather than mapping event.data.object,
    // so every event for one subscription converges on the same row whatever
    // order they arrive in. This asserts the mapper contributes no state.
    const s = sub()
    expect(mapSubscription(s)).toEqual(mapSubscription(s))
  })
})
