import { describe, it, expect } from 'vitest'
import { pageHash, unchangedDecision } from './page-hash'

describe('pageHash', () => {
  it('ignores whitespace differences and nothing else', () => {
    const a = pageHash('Grants of up to £5,000.\n\n  Apply by 1 October.')
    const b = pageHash('Grants of up to £5,000. Apply by 1 October.')
    const c = pageHash('Grants of up to £5,000. Apply by 1 November.')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('unchangedDecision: the only direction it may fail is an extra read', () => {
  const base = { previousHash: 'h1', currentHash: 'h1', previousShape: 'silent', previousPassed: true, flagged: false }

  it('skips the model when the page is byte-identical on a passed, unflagged, undated row', () => {
    expect(unchangedDecision(base).skip).toBe(true)
  })
  it('reads when the page changed', () => {
    expect(unchangedDecision({ ...base, currentHash: 'h2' }).skip).toBe(false)
  })
  it('reads when there is no previous hash (first read after deploy)', () => {
    expect(unchangedDecision({ ...base, previousHash: null }).skip).toBe(false)
    expect(unchangedDecision({ ...base, previousHash: undefined }).skip).toBe(false)
  })
  it('reads a dated checkpoint whatever the hash says', () => {
    // A round that quietly stays open past its printed date shows no byte change.
    expect(unchangedDecision({ ...base, previousShape: 'dated' }).skip).toBe(false)
  })
  it('reads a flagged row', () => {
    expect(unchangedDecision({ ...base, flagged: true }).skip).toBe(false)
  })
  it('reads when the last read failed its gate: an unchanged wall is still a wall', () => {
    expect(unchangedDecision({ ...base, previousPassed: false }).skip).toBe(false)
  })
  it('always_open rows may skip: the 180-day cadence already trusts the quote', () => {
    expect(unchangedDecision({ ...base, previousShape: 'always_open' }).skip).toBe(true)
  })
})
