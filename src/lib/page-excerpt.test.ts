import { describe, it, expect } from 'vitest'
import { excerptWithMeta, excerpt, excerptNotice, PAGE_CAP } from './page-excerpt'

/**
 * The AF3 shape, which is what sent a brief about the wrong thing to a live
 * review queue: a long WordPress page whose first 12,000 characters are inline
 * CSS, with the fund's actual terms past 15,000 and a table of past grants
 * after that. A prefix cap reads the stylesheet and the awards table; it never
 * reaches the offer.
 */
const CSS_HEAD = '.has-electric-grass-gradient-background{background:var(--wp--preset--gradient--electric-grass) !important;}'
const filler = (n: number) => CSS_HEAD.repeat(Math.ceil(n / CSS_HEAD.length)).slice(0, n)
const TERMS = 'AF3: Supporting Partners programme. Grants of £10,000 to £150,000. '
  + 'Closing date: 23 Sep 2026. Who can apply: registered charities and CICs with '
  + 'substantial recent experience of supporting armed forces communities. '

describe('excerptWithMeta', () => {
  it('leaves a page shorter than the cap exactly as it is', () => {
    const page = 'Grants of £5,000 to £150,000. Closing date 30 September 2026.'
    expect(excerptWithMeta(page)).toEqual({ text: page, capped: false, originalLength: page.length })
  })

  it('reaches terms that a prefix cap would never see', () => {
    const page = filler(15_000) + TERMS + filler(50_000)
    const prefix = page.slice(0, PAGE_CAP)
    expect(prefix).not.toContain('£10,000')          // the bug, stated as a test

    const out = excerptWithMeta(page)
    expect(out.capped).toBe(true)
    expect(out.originalLength).toBe(page.length)
    expect(out.text).toContain('£10,000 to £150,000')
    expect(out.text).toContain('Closing date')
    expect(out.text).toContain('Who can apply')
  })

  it('marks where text was dropped, so a quote is never stitched across a gap', () => {
    const out = excerptWithMeta(filler(15_000) + TERMS + filler(50_000))
    expect(out.text).toContain('[…]')
  })

  it('never returns more than the cap', () => {
    const out = excerptWithMeta(filler(15_000) + TERMS + filler(90_000))
    expect(out.text.length).toBeLessThanOrEqual(PAGE_CAP)
  })

  it('falls back to a prefix when nothing on the page scores, and still says it cut', () => {
    const page = filler(40_000)
    const out = excerptWithMeta(page)
    expect(out.text).toBe(page.slice(0, PAGE_CAP))
    expect(out.capped).toBe(true)
  })

  it('excerpt() is the text of the same thing', () => {
    const page = filler(15_000) + TERMS + filler(20_000)
    expect(excerpt(page)).toBe(excerptWithMeta(page).text)
  })
})

describe('excerptNotice', () => {
  it('says nothing when the whole page was sent', () => {
    expect(excerptNotice({ text: 'x', capped: false, originalLength: 1 })).toBe('')
  })

  it('tells the model not to report absence as the funder being silent', () => {
    // AF3 came back with four fields at "no_source_found" for details the page
    // does state, outside the slice. This notice is the only thing standing
    // between a truncated read and a false claim about a funder.
    const n = excerptNotice({ text: 'x', capped: true, originalLength: 72_220 })
    expect(n).toContain('72,220')
    expect(n).toContain('EXCERPT')
    expect(n).toMatch(/do not state that the funder does not publish it/)
  })
})
