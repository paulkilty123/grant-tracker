import { describe, it, expect } from 'vitest'
import {
  diffFingerprints, parseClassification, buildClassifierInput, MAX_DIFF_ITEMS,
} from './watchlist-diff'

const fp = (...items: string[]) => items.join(' || ')

describe('diffFingerprints', () => {
  it('reports what appeared and what disappeared', () => {
    const d = diffFingerprints(
      fp('small grants fund', 'about us', 'our 2025 annual report'),
      fp('small grants fund', 'about us', 'meet our new chief executive'),
    )
    expect(d.added).toEqual(['meet our new chief executive'])
    expect(d.removed).toEqual(['our 2025 annual report'])
  })

  it('is empty when nothing moved', () => {
    const same = fp('a fund', 'another fund')
    const d = diffFingerprints(same, same)
    expect(d.added).toEqual([])
    expect(d.removed).toEqual([])
    expect(d.truncated).toBe(false)
  })

  it('handles a first-ever snapshot and a page that emptied', () => {
    expect(diffFingerprints(null, fp('a', 'b')).added).toEqual(['a', 'b'])
    expect(diffFingerprints(fp('a', 'b'), null).removed).toEqual(['a', 'b'])
    expect(diffFingerprints(null, null).added).toEqual([])
  })

  it('caps a redesign but says that it capped it', () => {
    // A truncated input that does not say it was truncated reads as the whole
    // answer, which is the failure this codebase keeps rediscovering.
    const many = fp(...Array.from({ length: 80 }, (_, i) => `item ${i}`))
    const d = diffFingerprints('', many)
    expect(d.added).toHaveLength(MAX_DIFF_ITEMS)
    expect(d.addedTotal).toBe(80)
    expect(d.truncated).toBe(true)
    expect(buildClassifierInput('A Funder', d)).toContain('and 50 more, not shown')
  })

  it('ignores blank segments rather than diffing them', () => {
    const d = diffFingerprints(fp('a', '', '  '), fp('a'))
    expect(d.removed).toEqual([])
  })
})

describe('parseClassification', () => {
  it('reads a well-formed answer', () => {
    expect(parseClassification('{"classification":"funding_change","quote":"applications close 12 august"}'))
      .toEqual({ classification: 'funding_change', quote: 'applications close 12 august' })
  })

  it('finds the JSON inside surrounding prose', () => {
    const raw = 'Looking at the diff:\n\n{"classification": "cosmetic", "quote": "we are hiring a grants officer"}\n\nHope that helps.'
    expect(parseClassification(raw).classification).toBe('cosmetic')
  })

  // NO QUOTE, NO VERDICT — the same rule buildEvidencePatch applies to a field
  // proposal. A label nobody can check is not a finding, and this output exists
  // specifically to be hand-checked.
  it('refuses a label with nothing behind it', () => {
    expect(parseClassification('{"classification":"funding_change","quote":null}'))
      .toEqual({ classification: 'unclear', quote: null })
    expect(parseClassification('{"classification":"page_gone","quote":"   "}').classification)
      .toBe('unclear')
  })

  it('does not round an unrecognised label to the nearest good-looking one', () => {
    expect(parseClassification('{"classification":"funding-change","quote":"x"}').classification)
      .toBe('unclear')
    expect(parseClassification('{"classification":"maybe","quote":"x"}').classification)
      .toBe('unclear')
  })

  it('survives junk', () => {
    for (const raw of ['', 'no json here', '{broken', '{}', '[]', 'null', '{"quote":"x"}']) {
      expect(parseClassification(raw)).toEqual({ classification: 'unclear', quote: null })
    }
  })

  it('allows unclear without a quote, and only unclear', () => {
    expect(parseClassification('{"classification":"unclear","quote":null}'))
      .toEqual({ classification: 'unclear', quote: null })
  })
})

describe('buildClassifierInput', () => {
  it('shows only the difference, never the two full pages', () => {
    const d = diffFingerprints(fp('kept one', 'gone one'), fp('kept one', 'new one'))
    const input = buildClassifierInput('Test Trust', d)
    expect(input).toContain('new one')
    expect(input).toContain('gone one')
    expect(input).not.toContain('kept one')
  })

  it('says "(none)" rather than leaving a side blank', () => {
    const d = diffFingerprints(fp('a'), fp('a', 'b'))
    expect(buildClassifierInput('T', d)).toContain('(none)')
  })
})
