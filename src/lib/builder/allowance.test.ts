import { describe, it, expect } from 'vitest'
import {
  allowanceRemaining, allowanceExhausted, allowanceStatusLine, allowanceRefusalMessage,
  type ApplicationAllowance,
} from './allowance'

const base = (o: Partial<ApplicationAllowance>): ApplicationAllowance => ({
  basis: 'apply', limit_count: 5, used: 0,
  period_start: '2026-09-01T00:00:00Z', resets_at: '2026-10-01T00:00:00Z', ...o,
})

describe('application allowance copy', () => {
  it('counts down and names the reset day', () => {
    expect(allowanceStatusLine(base({ used: 2 }))).toBe('Three of your five applications left this month, resets on 1 October.')
    expect(allowanceRemaining(base({ used: 2 }))).toBe(3)
  })

  it('is exhausted at the limit, not before', () => {
    expect(allowanceExhausted(base({ used: 4 }))).toBe(false)
    expect(allowanceExhausted(base({ used: 5 }))).toBe(true)
    // A count above the limit (a deleted-and-recreated month, a race) is still
    // exhausted rather than negative.
    expect(allowanceRemaining(base({ used: 7 }))).toBe(0)
  })

  it('treats null as unlimited and says nothing', () => {
    const team = base({ basis: 'team', limit_count: null, used: 40 })
    expect(allowanceRemaining(team)).toBeNull()
    expect(allowanceExhausted(team)).toBe(false)
    expect(allowanceStatusLine(team)).toBeNull()
  })

  it('speaks about the trial in trial terms, with no reset', () => {
    const t = base({ basis: 'trial', limit_count: 2, used: 1, resets_at: null })
    expect(allowanceStatusLine(t)).toBe('One of your two trial applications left.')
    expect(allowanceRefusalMessage({ ...t, used: 2 })).toMatch(/^Your trial includes two applications/)
  })

  it('refusal on Apply names the limit and the reset day', () => {
    expect(allowanceRefusalMessage(base({ used: 5 }))).toBe(
      'You have started five applications this month, which is the limit on your plan. It resets on 1 October. If you need more before then, reply to any Shoots email and say so.',
    )
  })

  it('house style: no dashes in anything user-facing', () => {
    const all = [
      allowanceStatusLine(base({ used: 1 })), allowanceRefusalMessage(base({ used: 5 })),
      allowanceStatusLine(base({ basis: 'trial', limit_count: 2, used: 0, resets_at: null })),
      allowanceRefusalMessage(base({ basis: 'trial', limit_count: 2, used: 2, resets_at: null })),
    ].join(' ')
    expect(all).not.toMatch(/[–—]|--/)
  })
})
