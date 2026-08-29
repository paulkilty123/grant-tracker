import { describe, it, expect } from 'vitest'
import { verdictFor, stripeInterval, type DesiredPrice, type ExistingPrice } from './price-sync'

const want: DesiredPrice = {
  lookupKey: 'shoots_match_standard_monthly',
  amount: 1500, currency: 'gbp', interval: 'month',
}
const found = (over: Partial<ExistingPrice> = {}): ExistingPrice => ({
  id: 'price_1', unit_amount: 1500, currency: 'gbp',
  recurring: { interval: 'month' }, active: true, ...over,
})

describe('verdictFor', () => {
  it('creates when Stripe has nothing', () => {
    expect(verdictFor(want, null)).toEqual({ action: 'create' })
  })

  it('does nothing when it is already right', () => {
    expect(verdictFor(want, found())).toEqual({ action: 'ok', priceId: 'price_1' })
  })

  it('creates when the only match is archived', () => {
    // Stripe keeps a deactivated price for ever and frees its lookup key.
    // Counting one as present leaves the plan unsellable while the sync says
    // everything is in order.
    expect(verdictFor(want, found({ active: false }))).toEqual({ action: 'create' })
  })

  it('refuses rather than creating a second price when the amount differs', () => {
    // The dangerous outcome is two live prices for one plan, where what a
    // customer pays depends on which the checkout resolved.
    const v = verdictFor(want, found({ unit_amount: 1200 }))
    expect(v.action).toBe('mismatch')
    if (v.action !== 'mismatch') throw new Error('unreachable')
    expect(v.priceId).toBe('price_1')
    expect(v.differences.join(' ')).toMatch(/1200.*1500/)
  })

  it('catches a currency change', () => {
    const v = verdictFor(want, found({ currency: 'usd' }))
    expect(v.action).toBe('mismatch')
  })

  it('catches an interval change', () => {
    const v = verdictFor(want, found({ recurring: { interval: 'year' } }))
    expect(v.action).toBe('mismatch')
  })

  it('catches a one-off price sitting on a subscription key', () => {
    const v = verdictFor(want, found({ recurring: null }))
    expect(v.action).toBe('mismatch')
    if (v.action !== 'mismatch') throw new Error('unreachable')
    expect(v.differences.join(' ')).toContain('one-off')
  })

  it('reports every difference at once, not just the first', () => {
    const v = verdictFor(want, found({ unit_amount: 999, currency: 'eur' }))
    if (v.action !== 'mismatch') throw new Error('expected a mismatch')
    expect(v.differences).toHaveLength(2)
  })

  it('treats a null amount as a difference rather than a match', () => {
    const v = verdictFor(want, found({ unit_amount: null }))
    expect(v.action).toBe('mismatch')
  })
})

describe('stripeInterval', () => {
  it('translates our words into Stripe\'s', () => {
    expect(stripeInterval('monthly')).toBe('month')
    expect(stripeInterval('annual')).toBe('year')
  })
})
