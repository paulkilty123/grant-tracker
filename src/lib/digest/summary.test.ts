import { describe, it, expect } from 'vitest'
import { summaryLine, whyItFits } from './build'
import { emailTitle, nine } from './text'

/**
 * Brief of 21 Sept 2026. Predictions before the run: zero clauses are left
 * out, all-zero is the quiet line, words to nine and figures from 10; the
 * why-line needs a shared sector plus one more fact, else the funder's first
 * complete sentence, else nothing; an em dash becomes a colon in the email.
 */
describe('summaryLine', () => {
  it('leaves out zero clauses and joins the rest', () => {
    expect(summaryLine({ deadlines: 1, notStarted: 3, newMatches: 2 })).toBe('This week: one deadline in the next six weeks, three funds in your pipeline not yet started, and two new matches.')
    expect(summaryLine({ deadlines: 0, notStarted: 0, newMatches: 1 })).toBe('This week: one new match.')
    expect(summaryLine({ deadlines: 2, notStarted: 0, newMatches: 12 })).toBe('This week: two deadlines in the next six weeks, and 12 new matches.')
  })
  it('says the quiet line when every count is zero', () => {
    expect(summaryLine({ deadlines: 0, notStarted: 0, newMatches: 0 })).toBe('Nothing new this week. Here is what is still open to you.')
  })
  it('spells to nine and uses figures from ten', () => {
    expect(nine(9)).toBe('nine'); expect(nine(10)).toBe('10')
  })
})

describe('whyItFits', () => {
  const base = { orgSectors: ['mental_health', 'community'], structure: 'cic_guarantee', eligibleStructures: ['cic_guarantee'], whatTheyFund: 'Grants for community projects in Southwark that improve mental health. They do not fund individuals.' }
  it('says what the fund is, then the fit, and never the exclusion', () => {
    expect(whyItFits({ ...base, grantSectors: ['community', 'mental_health'], locationTag: 'Southwark', locationScore: 15 }))
      .toBe('Why it fits: Grants for community projects in Southwark that improve mental health. Fits your mental health work in Southwark.')
  })
  it('drops the place for a UK-wide fund and the legal form always', () => {
    const out = whyItFits({ ...base, grantSectors: ['mental_health'], locationTag: 'UK', locationScore: 12 })
    expect(out).toBe('Why it fits: Grants for community projects in Southwark that improve mental health. Fits your mental health work.')
    expect(out).not.toContain('can apply')
  })
  it('gives the funder sentence alone when nothing is shared, and the fit alone when the funder has no sentence', () => {
    expect(whyItFits({ ...base, grantSectors: ['sport'], locationTag: 'Leeds', locationScore: 2 }))
      .toBe('Why it fits: Grants for community projects in Southwark that improve mental health.')
    expect(whyItFits({ ...base, grantSectors: ['community'], locationTag: 'Southwark', locationScore: 15, whatTheyFund: null }))
      .toBe('Why it fits: Fits your community work in Southwark.')
  })
  it('returns null rather than a truncated line', () => {
    expect(whyItFits({ ...base, grantSectors: [], locationTag: null, locationScore: 12, whatTheyFund: 'A very long description with no full stop at all that just keeps going and going and going without ever ending in a way that could be shown whole' })).toBeNull()
  })
})

describe('emailTitle', () => {
  it('shows the em dash as a colon and leaves everything else alone', () => {
    expect(emailTitle('Sir Halley Stewart Trust — Innovative Project Funding')).toBe('Sir Halley Stewart Trust: Innovative Project Funding')
    expect(emailTitle('Cash4Clubs')).toBe('Cash4Clubs')
  })
})
