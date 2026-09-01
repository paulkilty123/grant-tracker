// A page we deliberately removed should say so, not merely fail to be found.

import { describe, it, expect } from 'vitest'
import { grantKeyFromPath, GONE_STATES } from './gone-grants'

describe('grantKeyFromPath', () => {
  it('matches a grant page, with or without a trailing slash', () => {
    expect(grantKeyFromPath('/grants/abc-123')).toBe('abc-123')
    expect(grantKeyFromPath('/grants/abc-123/')).toBe('abc-123')
  })

  it('does not match the listing, a sub-path, or anything else', () => {
    // A false match here would 410 a page that exists, which is far worse than
    // the 404 this replaces.
    expect(grantKeyFromPath('/grants')).toBeNull()
    expect(grantKeyFromPath('/grants/')).toBeNull()
    expect(grantKeyFromPath('/grants/abc/opengraph-image')).toBeNull()
    expect(grantKeyFromPath('/dashboard/grants/abc')).toBeNull()
    expect(grantKeyFromPath('/')).toBeNull()
  })

  it('handles an external_id with punctuation, which many rows have', () => {
    expect(grantKeyFromPath('/grants/gov-uk_some-fund_2026')).toBe('gov-uk_some-fund_2026')
  })
})

describe('the 410 set is exactly the terminal states', () => {
  it('is rejected and archived, and nothing else', () => {
    // The distinction is the whole point: a withheld row might come back and a
    // between-rounds row certainly will, so those keep their 404.
    expect([...GONE_STATES].sort()).toEqual(['archived', 'rejected'])
  })

  it('does not include the states that can return', () => {
    for (const s of ['published', 'between_rounds_scheduled', 'tagged_awaiting_review', 'captured']) {
      expect(GONE_STATES as readonly string[]).not.toContain(s)
    }
  })
})
