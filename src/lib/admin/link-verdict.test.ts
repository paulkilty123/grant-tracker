import { describe, it, expect } from 'vitest'
import { classifyLinkFlag, countLinkFlags, describeLinkFlags } from './link-verdict'

describe('an index page is not a fault', () => {
  // The whole point. On 2026-08-30 these three notes were totalled as 174 live
  // defects and set as the pre-launch priority. Reading all 174 found zero
  // broken links.
  it.each([
    ['multiple_funds'],
    ['fixable_link: no_funding_detail'],
  ])('%s is a quality flag', (note) => {
    expect(classifyLinkFlag(note)?.kind).toBe('quality')
  })

  it('wrong_fund is the one that is a fault', () => {
    expect(classifyLinkFlag('fixable_link: wrong_fund')?.kind).toBe('fault')
  })

  it('an unreadable page says nothing about the link', () => {
    expect(classifyLinkFlag('fixable_link: no_content')?.kind).toBe('unknown')
    expect(classifyLinkFlag('fixable_link: fetch_failed')?.kind).toBe('unknown')
  })
})

describe('counting keeps the kinds apart', () => {
  // The live population on 2026-08-30.
  const live = [
    ...Array(74).fill('fixable_link: wrong_fund'),
    ...Array(59).fill('multiple_funds'),
    ...Array(41).fill('fixable_link: no_funding_detail'),
    ...Array(4).fill('fixable_link: no_content'),
    ...Array(1).fill('fixable_link: fetch_failed'),
  ]

  it('does not produce the 174', () => {
    const c = countLinkFlags(live)
    expect(c.fault).toBe(74)
    expect(c.quality).toBe(100)
    expect(c.unknown).toBe(5)
    // There is no total, and that is deliberate.
    expect(Object.keys(c).sort()).toEqual(['fault', 'quality', 'unknown'])
  })

  it('describes them as separate things a human can act on', () => {
    expect(describeLinkFlags(countLinkFlags(live)))
      .toBe('74 to fix, 100 could point deeper, 5 unread')
  })

  it('says so plainly when nothing is flagged', () => {
    expect(describeLinkFlags(countLinkFlags([]))).toBe('nothing flagged')
  })
})

describe('a new verifier outcome cannot inflate the fault count', () => {
  it('an unrecognised note is unknown, not a fault', () => {
    const f = classifyLinkFlag('fixable_link: something_invented_next_week')
    expect(f?.kind).toBe('unknown')
    expect(countLinkFlags(['fixable_link: something_invented_next_week']).fault).toBe(0)
  })

  it('ignores rows that were never read', () => {
    expect(classifyLinkFlag(null)).toBeNull()
    expect(countLinkFlags([null, undefined])).toEqual({ fault: 0, quality: 0, unknown: 0 })
  })
})
