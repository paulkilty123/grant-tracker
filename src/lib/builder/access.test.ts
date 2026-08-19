import { describe, it, expect } from 'vitest'
import { decideOrgAccess, type OrgEntitlementRow } from './access'

// Oldest first, which is the order resolveBuilderAccess selects in.
const ENTITLED:     OrgEntitlementRow = { id: 'a', name: 'Bikeworks CIC',        apply_access: true  }
const NOT_ENTITLED: OrgEntitlementRow = { id: 'b', name: 'Asian Community Concern', apply_access: false }

describe('decideOrgAccess — the multi-org bug this replaced', () => {
  // The real shape, from production on 2026-08-19: one owner, five orgs, one
  // entitled. The old check asked "does this USER own any entitled org", said
  // yes, and showed Pipeline on all five. RLS then returned nothing for the
  // other four, which reads as "you have saved nothing" rather than "this org
  // cannot have a pipeline".
  const FIVE = [ENTITLED, NOT_ENTITLED, { id: 'c', apply_access: false }, { id: 'd', apply_access: false }, { id: 'e', apply_access: false }]

  it('refuses when the org in view is not entitled, even though another one is', () => {
    const d = decideOrgAccess(FIVE, 'b')
    expect(d.ok).toBe(false)
    expect(d.ok === false && d.reason).toBe('org_not_entitled')
  })

  it('allows when the org in view is the entitled one', () => {
    const d = decideOrgAccess(FIVE, 'a')
    expect(d.ok).toBe(true)
    expect(d.ok === true && d.org.id).toBe('a')
  })

  it('names the refused org, so the screen can say which profile it means', () => {
    const d = decideOrgAccess(FIVE, 'b')
    expect(d.org?.name).toBe('Asian Community Concern')
  })
})

describe('decideOrgAccess — falling back to the oldest org', () => {
  it('uses the oldest org when nothing is requested', () => {
    expect(decideOrgAccess([ENTITLED, NOT_ENTITLED], null).ok).toBe(true)
  })

  it('refuses when the oldest org is the unentitled one', () => {
    // Order matters: the fallback is positional, not "the best one available".
    // Picking the entitled org here would put the nav out of step with the
    // dashboard, which also falls back to the oldest.
    const d = decideOrgAccess([NOT_ENTITLED, ENTITLED], null)
    expect(d.ok).toBe(false)
    expect(d.ok === false && d.reason).toBe('org_not_entitled')
  })

  it('falls back to the oldest when a cookie names an org the user does not own', () => {
    // A stale or hand-crafted cookie is a browser artefact, so it degrades to
    // the default rather than erroring. It must never resolve to the named org.
    const d = decideOrgAccess([ENTITLED, NOT_ENTITLED], 'someone-elses-org')
    expect(d.ok).toBe(true)
    expect(d.ok === true && d.org.id).toBe('a')
  })
})

describe('decideOrgAccess — an explicitly named org', () => {
  it('refuses an org the caller does not own rather than silently using another', () => {
    // A route acting on a named org must not have that name quietly swapped
    // for the caller's oldest org underneath it.
    const d = decideOrgAccess([ENTITLED], 'someone-elses-org', true)
    expect(d.ok).toBe(false)
    expect(d.ok === false && d.reason).toBe('org_not_entitled')
  })

  it('allows an owned, entitled org that was named explicitly', () => {
    expect(decideOrgAccess([ENTITLED, NOT_ENTITLED], 'a', true).ok).toBe(true)
  })
})

describe('decideOrgAccess — no organisation', () => {
  it('separates "no org yet" from "org not entitled"', () => {
    // These want different copy: one is "finish setting up", the other is
    // "this profile is not on the plan".
    const d = decideOrgAccess([], null)
    expect(d.ok).toBe(false)
    expect(d.ok === false && d.reason).toBe('no_organisation')
  })
})

describe('decideOrgAccess — a null apply_access is not access', () => {
  it('treats a missing entitlement column as not entitled', () => {
    expect(decideOrgAccess([{ id: 'x' }], null).ok).toBe(false)
    expect(decideOrgAccess([{ id: 'x', apply_access: null }], null).ok).toBe(false)
  })
})
