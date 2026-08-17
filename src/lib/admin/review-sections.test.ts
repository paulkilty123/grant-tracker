import { describe, it, expect } from 'vitest'
import { sectionOf, evidenceRank, SECTIONS, arrivalOrigin, isNewArrival, rootCauseOf, explainedBy } from './review-sections'
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


describe('arrivalOrigin — the three origins that mean something', () => {
  it('reads the things we went looking for as discovery', () => {
    for (const s of ['discovery_queue', 'deep_search', 'research_batch', 'discovery:gemini'])
      expect(arrivalOrigin(s), s).toBe('discovery')
  })

  it('reads a person typing as manual', () => {
    for (const s of ['manual', 'manual_ingest_scotland_2026-05-18', 'catalogue-seed', 'seed:legacy'])
      expect(arrivalOrigin(s), s).toBe('manual')
  })

  it('reads every scraper name as crawl', () => {
    for (const s of ['gov_uk', 'tyne_wear_cf', 'arts_council_wales', 'homeless_link', 'foundation_scotland'])
      expect(arrivalOrigin(s), s).toBe('crawl')
  })

  it('defaults an unknown or absent source to crawl, not manual', () => {
    // A scraper added next month must read as machine intake without anyone
    // remembering this list; calling it manual would overstate how much of the
    // catalogue a person actually curated.
    expect(arrivalOrigin('some_new_scraper_2027')).toBe('crawl')
    expect(arrivalOrigin(null)).toBe('crawl')
    expect(arrivalOrigin('')).toBe('crawl')
  })
})

describe('isNewArrival', () => {
  const now = new Date('2026-08-17T12:00:00Z')

  it('counts a row first seen today', () => {
    expect(isNewArrival('2026-08-17T09:00:00Z', now)).toBe(true)
  })

  it('counts one at the edge of the window', () => {
    expect(isNewArrival('2026-08-10T12:00:00Z', now)).toBe(true)
  })

  it('excludes one just outside it', () => {
    expect(isNewArrival('2026-08-10T11:59:00Z', now)).toBe(false)
  })

  it('is false rather than throwing on missing or malformed dates', () => {
    expect(isNewArrival(null, now)).toBe(false)
    expect(isNewArrival('not a date', now)).toBe(false)
  })
})

describe('rootCauseOf / explainedBy — one cause, not six consequences', () => {
  // Charity Bank, verbatim: one fact and six things true only because of it.
  const charityBank = ['never_verified', 'no_brief', 'link_unverified', 'no_amount',
                       'no_deadline', 'eligibility_missing', 'sectors_missing']

  it('names the single cause behind seven chips', () => {
    expect(rootCauseOf(charityBank)).toBe('never_verified')
  })

  it('collapses the six consequences', () => {
    const hidden = explainedBy('never_verified', charityBank)
    expect(hidden).toHaveLength(6)
    expect(hidden).toContain('no_amount')
    expect(hidden).toContain('sectors_missing')
    expect(hidden).not.toContain('never_verified')
  })

  it('ranks a dead link above an unread page — re-reading a dead link cannot help', () => {
    expect(rootCauseOf(['never_verified', 'link_dead'])).toBe('link_dead')
    expect(rootCauseOf(['no_brief', 'page_describes_different_fund'])).toBe('page_describes_different_fund')
  })

  it('never hides a positive wrong value behind a root cause', () => {
    // A suspect amount or a passed deadline is a real finding about data we
    // hold, not a symptom of a missing read. Burying it would hide the defect.
    const hidden = explainedBy('never_verified',
      ['never_verified', 'amount_pot_suspected', 'deadline_passed', 'no_amount'])
    expect(hidden).toEqual(['no_amount'])
  })

  it('leaves a row with independent problems showing all of them', () => {
    expect(rootCauseOf(['amount_pot_suspected', 'deadline_implausible'])).toBeNull()
    expect(explainedBy(null, ['amount_pot_suspected', 'deadline_implausible'])).toEqual([])
  })
})
