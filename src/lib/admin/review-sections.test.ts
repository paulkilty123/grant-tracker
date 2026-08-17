import { describe, it, expect } from 'vitest'
import { sectionOf, evidenceRank, planLine, SECTIONS } from './review-sections'
import { BLOCKING_CODES } from './publish-gate'
import type { EvidenceSummary } from './evidence-summary'

/** Blocking codes arrive from the server as plain strings. */
const r = (code: string) => code

describe('sectionOf', () => {
  it('a row with nothing blocking is ready', () => {
    expect(sectionOf([])).toBe('ready')
  })

  it('puts a dead link and a wrong-fund page in the link section', () => {
    expect(sectionOf([r('link_dead')])).toBe('link')
    expect(sectionOf([r('page_describes_different_fund')])).toBe('link')
  })

  it('does NOT treat an unchecked link as a link problem', () => {
    // link_unverified means "we have not looked", not "it is broken", and does
    // not block at the gate either. A homepage link is not a defect.
    expect(BLOCKING_CODES).not.toContain('link_unverified')
    expect(sectionOf([r('link_unverified')])).toBe('judgement')
  })

  it('sends an unreadable page to reading, not to links', () => {
    // Usually a bot wall the reader proxy clears. Calling it a dead link is the
    // false-dead problem.
    expect(sectionOf([r('page_unreadable')])).toBe('reading')
  })

  it('sends a quarantined row to reading', () => {
    expect(sectionOf([r('quarantined')])).toBe('reading')
  })

  it('sends a passed deadline to judgement, not to untruthful', () => {
    expect(sectionOf([r('deadline_passed')])).toBe('judgement')
  })

  it('a row with no funder has nothing truthful to show', () => {
    expect(sectionOf([r('no_funder')])).toBe('untruthful')
    expect(sectionOf([r('page_says_delisted')])).toBe('untruthful')
  })

  it('resolves a row carrying several codes by most-blocking-first', () => {
    // Fixing the amount cannot help while the link goes nowhere.
    expect(sectionOf([r('amount_ungrounded'), r('link_dead')])).toBe('link')
    // And nothing truthful outranks even a dead link.
    expect(sectionOf([r('link_dead'), r('no_funder')])).toBe('untruthful')
  })

  it('never drops a row with an unmapped blocking code', () => {
    // A code nobody mapped must surface somewhere rather than vanish.
    expect(sectionOf([r('sectors_missing')])).toBe('judgement')
  })

  it('every blocking code lands in a section', () => {
    for (const code of BLOCKING_CODES) {
      const s = sectionOf([r(code)])
      expect(SECTIONS.map(x => x.id), code).toContain(s)
      expect(s, code).not.toBe('ready')
    }
  })
})

describe('evidenceRank — safest first', () => {
  const ev = (over: Partial<EvidenceSummary>): EvidenceSummary => ({
    checkedAt: '2026-08-17', readUrl: null, outcome: 'verified', lines: [],
    counts: { confirmed: 0, silent: 0, contradicted: 0 }, unbacked: 0, ...over,
  })

  it('ranks a confirming page safest', () => {
    expect(evidenceRank(ev({ counts: { confirmed: 3, silent: 0, contradicted: 0 } }))).toBe(0)
  })

  it('ranks a silent page next', () => {
    expect(evidenceRank(ev({ counts: { confirmed: 0, silent: 5, contradicted: 0 } }))).toBe(1)
  })

  it('ranks a contradicting page below silent', () => {
    expect(evidenceRank(ev({ counts: { confirmed: 0, silent: 0, contradicted: 1 } }))).toBe(2)
  })

  it('ranks a different-fund page last', () => {
    expect(evidenceRank(ev({ outcome: 'fixable_link: wrong_fund' }))).toBe(3)
  })

  it('lets a contradiction outrank confirmations on the same row', () => {
    // The point of the order is to let someone stop when they get uneasy, so a
    // row with a contradiction must sit BELOW that point, not above it.
    expect(evidenceRank(ev({ counts: { confirmed: 4, silent: 0, contradicted: 1 } }))).toBe(2)
  })

  it('treats a never-read row as silent rather than safe', () => {
    expect(evidenceRank(null)).toBe(1)
  })
})

describe('planLine', () => {
  const empty = { ready: 0, link: 0, reading: 0, judgement: 0, untruthful: 0 }

  it('names the biggest blocker and what clearing it would buy', () => {
    const s = planLine({ ready: 27, bySection: { ...empty, link: 44, reading: 13 }, liveAndWrong: 32 })
    expect(s).toContain('27 rows are ready to publish')
    expect(s).toContain('the link issues')
    expect(s).toContain('44 more publishable')
  })

  it('carries the live-and-wrong count, so it reads as a plan for the whole screen', () => {
    const s = planLine({ ready: 5, bySection: { ...empty, reading: 2 }, liveAndWrong: 32 })
    expect(s).toContain('32 rows are live to users and wrong')
  })

  it('says nothing about live-and-wrong when there are none', () => {
    const s = planLine({ ready: 5, bySection: { ...empty, reading: 2 }, liveAndWrong: 0 })
    expect(s).not.toContain('live to users and wrong')
  })

  it('handles an empty queue without inventing a blocker', () => {
    const s = planLine({ ready: 0, bySection: { ...empty }, liveAndWrong: 0 })
    expect(s).toBe('Nothing is ready to publish.')
  })

  it('uses singular English for one row', () => {
    const s = planLine({ ready: 1, bySection: { ...empty }, liveAndWrong: 1 })
    expect(s).toContain('1 row is ready')
    expect(s).toContain('1 row is live to users and wrong')
  })
})
