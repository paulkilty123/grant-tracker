import { describe, it, expect } from 'vitest'
import { findMismatches, isEntitling, grantIsLive, type SubRow, type OrgRow } from './reconcile'

const OWNER = 'own-1'
const sub = (o: Partial<SubRow> = {}): SubRow =>
  ({ owner_id: OWNER, plan: 'apply', status: 'active', stripe_subscription_id: 'sub_1', org_id: null, ...o })
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

  it('is satisfied when the organisation it NAMES is entitled', () => {
    const m = findMismatches([sub({ org_id: 'b' })], [
      org({ id: 'a', apply_access: false }),
      org({ id: 'b', apply_access: true }),
    ], now)
    expect(m).toEqual([])
  })

  it('reports when the named organisation is the unentitled one', () => {
    // The version this replaces asked whether ANY organisation was entitled and
    // would have passed here, because 'b' is fine. The subscription paid for
    // 'a', which is not.
    const m = findMismatches([sub({ org_id: 'a' })], [
      org({ id: 'a', apply_access: false }),
      org({ id: 'b', apply_access: true }),
    ], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('paid_without_access')
    expect(m[0].org_id).toBe('a')
  })

  it('reports a subscription naming an organisation the owner does not hold', () => {
    const m = findMismatches([sub({ org_id: 'gone' })], [org({ id: 'a' })], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('paid_without_access')
  })

  it('reports a subscription that names none while the owner holds several', () => {
    // Caught live on an account with nine organisations, seven entitled by
    // permanent grants and a subscription naming none. Every organisation was
    // fine, the subscription had bought nothing, and the old check reported
    // zero because it found entitled organisations and stopped looking.
    const m = findMismatches([sub({ org_id: null })], [
      org({ id: 'a', granted_access_until: 'infinity' }),
      org({ id: 'b', granted_access_until: 'infinity' }),
    ], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('subscription_names_no_organisation')
  })

  it('stays quiet when it names none but the owner holds exactly one', () => {
    // Unambiguous, and the shape of every subscription created before 076.
    expect(findMismatches([sub({ org_id: null })], [org()], now)).toEqual([])
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

  it('accepts a permanent grant expressed as a far-future date', () => {
    const m = findMismatches([], [org({ granted_access_until: '9999-12-31T00:00:00Z' })], now)
    expect(m).toEqual([])
  })

  it("accepts Postgres 'infinity', which is how permanent grants are stored", () => {
    // The first production run reported all ELEVEN permanent grants as
    // mismatches. new Date('infinity') is an Invalid Date and every comparison
    // with one is false, so a permanent comp read as "no grant" — silently, no
    // NaN anywhere. Eleven false alarms a day is a job nobody reads.
    const m = findMismatches([], [org({ granted_access_until: 'infinity' })], now)
    expect(m).toEqual([])
  })

  it("treats '-infinity' as expired rather than permanent", () => {
    const m = findMismatches([], [org({ granted_access_until: '-infinity' })], now)
    expect(m).toHaveLength(1)
  })

  it('names an unreadable date instead of assuming there is no grant', () => {
    // Silently reading unparseable as "no grant" is the same bug wearing a
    // different hat, and it would be just as invisible.
    const m = findMismatches([], [org({ granted_access_until: 'not-a-date' })], now)
    expect(m).toHaveLength(1)
    expect(m[0].detail).toContain('unreadable')
    expect(m[0].detail).toContain('not-a-date')
  })

  it('does not report an org entitled by a Match subscription', () => {
    // Match does not grant, so an entitled org on a Match subscription has no
    // basis and SHOULD be reported.
    const m = findMismatches([sub({ plan: 'match' })], [org()], now)
    expect(m).toHaveLength(1)
    expect(m[0].kind).toBe('access_without_basis')
  })
})

describe('grantIsLive', () => {
  const now = new Date('2026-09-01T00:00:00Z')
  it('reads the values Postgres actually stores', () => {
    expect(grantIsLive(null, now)).toEqual({ live: false, unparseable: false })
    expect(grantIsLive('infinity', now)).toEqual({ live: true, unparseable: false })
    expect(grantIsLive('-infinity', now)).toEqual({ live: false, unparseable: false })
    expect(grantIsLive('2027-03-10T00:00:00Z', now)).toEqual({ live: true, unparseable: false })
    expect(grantIsLive('2026-08-01T00:00:00Z', now)).toEqual({ live: false, unparseable: false })
  })
  it('flags an unparseable value rather than calling it expired', () => {
    expect(grantIsLive('whenever', now)).toEqual({ live: false, unparseable: true })
  })
})
