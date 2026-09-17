import { describe, it, expect } from 'vitest'
import { reenrichUnchanged, BRIEF_HASH_KEY } from './reenrich-unchanged'

describe('reenrichUnchanged: a brief is rewritten unless the page is byte-identical to the one it came from', () => {
  const ev = { _page_read: { page_hash: 'abc', checked_at: '2026-09-11T01:00:00Z' } }

  it('skips when the fingerprints match', () => {
    expect(reenrichUnchanged({ [BRIEF_HASH_KEY]: 'abc', last_enriched: '2026-06-01' }, ev).skip).toBe(true)
  })
  it('refreshes when the page changed', () => {
    expect(reenrichUnchanged({ [BRIEF_HASH_KEY]: 'abc' }, { _page_read: { page_hash: 'xyz' } }).skip).toBe(false)
  })
  it('refreshes a brief that predates fingerprinting (the whole catalogue on day one)', () => {
    expect(reenrichUnchanged({ last_enriched: '2026-06-01' }, ev).skip).toBe(false)
  })
  it('refreshes when the verifier has not fingerprinted the page yet', () => {
    expect(reenrichUnchanged({ [BRIEF_HASH_KEY]: 'abc' }, { _page_read: { note: 'verified' } }).skip).toBe(false)
    expect(reenrichUnchanged({ [BRIEF_HASH_KEY]: 'abc' }, null).skip).toBe(false)
  })
  it('a null brief never skips', () => {
    expect(reenrichUnchanged(null, ev).skip).toBe(false)
  })
})
