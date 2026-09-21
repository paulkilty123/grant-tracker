import { describe, it, expect } from 'vitest'
import { pickOrgAndTier } from './mcp-entitlement'

/**
 * Paul, 21 Sept 2026: an account with no organisation must not get the free
 * tier on the MCP. Predictions before the run: no orgs -> null; an org whose
 * trial has ended (apply_access false) -> null; a live trial -> apply; an
 * adviser org beats an apply org whatever the order.
 */
describe('pickOrgAndTier', () => {
  it('gives nothing to an account with no organisation (the bare signup)', () => {
    expect(pickOrgAndTier([])).toBeNull()
  })
  it('gives nothing once the trial has ended', () => {
    expect(pickOrgAndTier([{ id: 'a', name: 'Ended', apply_access: false, companion_access: false }])).toBeNull()
  })
  it('gives the apply tier to a live trial or subscription', () => {
    expect(pickOrgAndTier([{ id: 'a', name: 'Live', apply_access: true, companion_access: false }])).toEqual({ orgId: 'a', orgName: 'Live', tier: 'apply' })
  })
  it('prefers an adviser organisation over an apply one, whatever the order', () => {
    const r = pickOrgAndTier([
      { id: 'a', name: 'Apply', apply_access: true, companion_access: false },
      { id: 'c', name: 'Adviser', apply_access: true, companion_access: true },
    ])
    expect(r?.tier).toBe('companion'); expect(r?.orgId).toBe('c')
  })
  it('an ended org beside a live one still resolves to the live one', () => {
    const r = pickOrgAndTier([
      { id: 'x', name: 'Ended', apply_access: false, companion_access: false },
      { id: 'y', name: 'Live', apply_access: true, companion_access: false },
    ])
    expect(r?.orgId).toBe('y')
  })
})
