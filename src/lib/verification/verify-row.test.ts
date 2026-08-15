import { describe, it, expect } from 'vitest'
import { isFrontDoorUrl } from './verify-row'

/**
 * The front-door guard decides whether the engine is allowed to certify that a
 * fund is open today. Getting it wrong in one direction costs coverage: a row
 * stays unverified and waits for multi-page sourcing or a human. Getting it
 * wrong in the other direction puts a citation under a false claim, which is
 * worse than no citation at all, because it survives a gate that asks for
 * evidence.
 *
 * So the cases below are the real URLs from §3.1 of the tranche 2 design — the
 * twelve rows the gate made newly visible on 12 August — rather than invented
 * ones. If the heuristic drifts, it drifts against the population it exists for.
 */

describe('isFrontDoorUrl — front doors', () => {
  it('treats a bare domain as a front door', () => {
    // The worked case. This page produced "Nominations open all year" and
    // certified a rolling flag for a fund that awards in six dated draws.
    expect(isFrontDoorUrl('https://movementforgood.com/')).toBe(true)
    expect(isFrontDoorUrl('https://www.movementforgood.com/')).toBe(true)
    expect(isFrontDoorUrl('https://asdafoundation.org/')).toBe(true)
    expect(isFrontDoorUrl('https://sibgroup.org.uk/')).toBe(true)
    expect(isFrontDoorUrl('https://example.org')).toBe(true)
  })

  it('treats a single generic index segment as a front door', () => {
    expect(isFrontDoorUrl('https://powertochange.org.uk/our-funds/')).toBe(true)
    expect(isFrontDoorUrl('https://lloydsbankfoundation.org.uk/our-funding/')).toBe(true)
    expect(isFrontDoorUrl('https://barrowcadbury.org.uk/what-we-fund/')).toBe(true)
    expect(isFrontDoorUrl('https://the-sse.org/programmes/')).toBe(true)
    // Two catalogue rows point at this one page and it names neither of them.
    // It is the shape §3.1 calls out by name.
    expect(isFrontDoorUrl('https://thebromleytrust.org.uk/apply-for-funding/')).toBe(true)
  })

  it('treats a locale segment as a front door', () => {
    expect(isFrontDoorUrl('https://www.ashoka.org/en-gb')).toBe(true)
  })

  it('ignores a file extension on the segment', () => {
    expect(isFrontDoorUrl('https://example.org/apply.html')).toBe(true)
    expect(isFrontDoorUrl('https://example.org/index.php')).toBe(true)
  })

  it('ignores query strings and fragments', () => {
    expect(isFrontDoorUrl('https://movementforgood.com/?utm_source=x')).toBe(true)
    expect(isFrontDoorUrl('https://example.org/funding#apply')).toBe(true)
  })
})

describe('isFrontDoorUrl — pages that name something', () => {
  it('is false when a segment names a fund', () => {
    expect(isFrontDoorUrl('https://coop.co.uk/local-community-fund')).toBe(false)
    expect(isFrontDoorUrl('https://lgbtfund.org.uk/live-funds/london-fund/')).toBe(false)
    expect(isFrontDoorUrl('https://access-socialinvestment.org.uk/our-work/growth-fund/')).toBe(false)
    expect(isFrontDoorUrl('https://westminsterfoundation.org.uk/community-grants')).toBe(false)
  })

  it('is false once the path is three segments deep', () => {
    // At that depth something is being named even if every word is generic.
    expect(isFrontDoorUrl('https://example.org/funding/grants/apply')).toBe(false)
  })

  it('is false for a two-segment path where the second segment names a fund', () => {
    // The first segment being generic does not matter; the second is doing the
    // naming, which is exactly the shape of a well-pointed catalogue row.
    expect(isFrontDoorUrl('https://example.org/grants/youth-music-fund')).toBe(false)
  })
})

describe('isFrontDoorUrl — bad input fails closed', () => {
  it('is false for nothing, rubbish, and non-URLs', () => {
    // False means "not proven to be a front door", so the guard does not fire
    // and behaviour is unchanged. An unparseable URL should not silently start
    // suppressing findings across the catalogue.
    expect(isFrontDoorUrl(null)).toBe(false)
    expect(isFrontDoorUrl(undefined)).toBe(false)
    expect(isFrontDoorUrl('')).toBe(false)
    expect(isFrontDoorUrl('not a url')).toBe(false)
    expect(isFrontDoorUrl('/our-funds/')).toBe(false)
  })
})
