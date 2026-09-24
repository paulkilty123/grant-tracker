import { describe, it, expect } from 'vitest'
import { billingCard } from './account-card'

const now = new Date('2026-09-24T12:00:00Z')
const sub = (over: Partial<Parameters<typeof billingCard>[0]['subscription'] & object> = {}) => ({
  plan: 'apply', status: 'active', current_period_end: '2026-10-24T12:00:00Z',
  cancel_at_period_end: false, stripe_customer_id: 'cus_1', ...over,
})

describe('billingCard', () => {
  it('a live subscription is paying, and wins over trial and cohort', () => {
    const c = billingCard({ subscription: sub(), isCohort: true, grantedAccessUntil: '2026-10-01T00:00:00Z', now })
    expect(c).toEqual({ state: 'paying', planName: 'Apply', renewsOn: '24 October 2026', endsOn: null, pastDue: false, canManage: true })
  })

  it('a cancelled-at-period-end subscription says when it ends, not when it renews', () => {
    const c = billingCard({ subscription: sub({ cancel_at_period_end: true }), isCohort: false, grantedAccessUntil: null, now })
    expect(c.state === 'paying' && c.endsOn).toBe('24 October 2026')
    expect(c.state === 'paying' && c.renewsOn).toBeNull()
  })

  it('past_due is still paying, flagged', () => {
    const c = billingCard({ subscription: sub({ status: 'past_due' }), isCohort: false, grantedAccessUntil: null, now })
    expect(c.state === 'paying' && c.pastDue).toBe(true)
  })

  it('a canceled subscription is not paying; the trial or ended state shows instead', () => {
    expect(billingCard({ subscription: sub({ status: 'canceled' }), isCohort: false, grantedAccessUntil: '2026-10-01T00:00:00Z', now }))
      .toEqual({ state: 'trial', endsOn: '1 October 2026' })
    expect(billingCard({ subscription: sub({ status: 'canceled' }), isCohort: false, grantedAccessUntil: '2026-09-01T00:00:00Z', now }))
      .toEqual({ state: 'ended' })
  })

  it('cohort beats trial; infinity is not a trial date', () => {
    expect(billingCard({ subscription: null, isCohort: true, grantedAccessUntil: 'infinity', now })).toEqual({ state: 'cohort' })
    expect(billingCard({ subscription: null, isCohort: false, grantedAccessUntil: 'infinity', now })).toEqual({ state: 'ended' })
  })

  it('no customer id means no Manage billing button', () => {
    const c = billingCard({ subscription: sub({ stripe_customer_id: null }), isCohort: false, grantedAccessUntil: null, now })
    expect(c.state === 'paying' && c.canManage).toBe(false)
  })
})
