import { describe, it, expect } from 'vitest'
import { findMismatches, isEntitling, type SubRow, type OrgRow } from './reconcile'

const OWNER = 'own-1'
const sub = (o: Partial<SubRow> = {}): SubRow =>
  ({ owner_id: OWNER, plan: 'apply', status: 'active', stripe_subscription_id: 'sub_1', ...o })
const org = (o: Partial<OrgRow> = {}): OrgRow =>
  ({ id: 'org-1', owner_id: OWNER, name: 'Test Org', apply_access: true, granted_access_until: null, ...o })

const now = new Date('2026-09-01T00:00:00Z')

describe('isEntitling mirrors migration 069', () => {
  it('grants on apply and team, for trialing, active and past_due', () => {
    for (const p of ['apply', 'team']) {
      for (const s of ['trialing', 'active', 'past_due']) expect(isEntitling(p, s)).toBe(true)
    }
  })
  it('never grants on match', () => {
    for (const s of ['trialing', 'active', 'past_due']) expect(isEntitling('match', s)).toBe(false)
  })
  it('never grants on a dead status', () => {
    for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']) {
      expect(isEntitling('apply', s)).toBe(false)
    }
  })
})

describe('a healthy system reports nothing', () => {
  it('is quiet when a paying owner has entitled access', () => {
    expect(findMismatches([sub()], [org()], now)).toEqual([])
  })
  it('is quiet for a granted org with no subscription at all', () => {
    // The whole cohort looks like this. If it were noisy here it would be
    // useless: 21 false alarms every day.
    expect(findMismatches([], [org({ granted_access_until: '2027-03-10T00:00:00Z' })], now)).toEqual([])
  })
  it('is quiet for an unentitled org with no subscription', () => {
    expect(findMismatches([], [org({ apply_access: false })], now)).toEqual([])
  })
  it('is quiet for a cancelled subscription whose access has gone', () => {
    expect(findMismatches([sub({ status: 'canceled' })], [org({ apply_access: false })], now)).toEqual([])
  })
})

describe('paid and locked out — the expensive case', () => {
  it('reports a paying owner whose organisation is not entitled', () => {
    const m = findMismatches([sub()], [org({ apply_access: false })], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('paid_without_access')
  })

  it('reports a subscriber who holds no organisation at all', () => {
    const m = findMismatches([sub()], [], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('subscriber_without_organisation')
    expect(m[0].org_id).toBeNull()
  })

  it('is satisfied when ANY of several organisations is entitled', () => {
    const m = findMismatches([sub()], [
      org({ id: 'a', apply_access: false }),
      org({ id: 'b', apply_access: true }),
    ], now)
    expect(m).toEqual([])
  })
})

describe('access with nothing behind it', () => {
  it('reports an entitled org with no grant and no subscription', () => {
    const m = findMismatches([], [org()], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('access_without_basis')
  })

  it('reports one whose granted period has expired', () => {
    // What the sweeper exists to clear. If the sweeper is not running, this is
    // where it shows up.
    const m = findMismatches([], [org({ granted_access_until: '2026-08-01T00:00:00Z' })], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('access_without_basis')
  })

  it('accepts a permanent grant', () => {
    const m = findMismatches([], [org({ granted_access_until: '9999-12-31T00:00:00Z' })], now)
    expect(m).toEqual([])
  })

  it('does not report an org entitled by a Match subscription', () => {
    // Match does not grant, so an entitled org on a Match subscription has no
    // basis and SHOULD be reported.
    const m = findMismatches([sub({ plan: 'match' })], [org()], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('access_without_basis')
  })
})
