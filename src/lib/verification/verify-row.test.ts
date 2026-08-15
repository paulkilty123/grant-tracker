import { describe, it, expect } from 'vitest'
import { isFrontDoorUrl, timingAnswered, foldEvidence, candidateLinks, statesDatedWindows } from './verify-row'

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

// ── Multi-page sourcing ──────────────────────────────────────────────────────

const ev = (field: string, agrees: boolean | null, quote: string | null = null, url = 'https://x/') =>
  ({ field, agrees, quote, source_url: url })

describe('timingAnswered — what makes a second page worth fetching', () => {
  it('is satisfied by either a deadline or a rolling flag, not both', () => {
    expect(timingAnswered({ evidence: [ev('deadline', true, 'Closes 1 Dec.')] })).toBe(true)
    expect(timingAnswered({ evidence: [ev('is_rolling', false, 'Two rounds a year.')] })).toBe(true)
  })

  it('is NOT satisfied by a page that stayed silent on both', () => {
    // Movement for Good after the front-door guard: the page passed the gate,
    // described the awards, and said nothing usable about when. That is the
    // condition the old single hop could never see, because the gate had passed.
    expect(timingAnswered({ evidence: [ev('is_rolling', null), ev('deadline', null)] })).toBe(false)
  })

  it('is not satisfied by an amount, however well evidenced', () => {
    // An absent amount renders as absent and misleads nobody, so it does not
    // earn a fetch. Keeping the trigger tied to what the surface ASSERTS is what
    // stops this becoming a general appetite for more pages.
    expect(timingAnswered({ evidence: [ev('max_org_income', true, 'Income under £1m.')] })).toBe(false)
  })
})

describe('foldEvidence — a later definite answer wins', () => {
  it('lets a hop settle a field the first page was silent on', () => {
    const first = [ev('is_rolling', null), ev('deadline', null)]
    const hop   = [ev('deadline', false, 'Draw 2 closes 11 September.', 'https://x/draw-dates')]
    const out   = foldEvidence(first, hop)
    expect(out.find(e => e.field === 'deadline')).toEqual(hop[0])
    // A field the hop did not address keeps what it had.
    expect(out.find(e => e.field === 'is_rolling')?.agrees).toBe(null)
  })

  it('does not let a silent hop erase a definite first answer', () => {
    // The hop happened because something was missing, not because the first page
    // was wrong. A blank second page must not undo a good first one.
    const first = [ev('is_rolling', true, 'Applications any time.')]
    const out   = foldEvidence(first, [ev('is_rolling', null)])
    expect(out[0].agrees).toBe(true)
    expect(out[0].quote).toBe('Applications any time.')
  })

  it('prefers the hop when both pages answer, because the hop is the specific one', () => {
    const out = foldEvidence(
      [ev('deadline', true, 'Applications welcome.', 'https://x/')],
      [ev('deadline', false, 'Closes 12 August 2026.', 'https://x/key-dates')],
    )
    expect(out[0].agrees).toBe(false)
    expect(out[0].source_url).toBe('https://x/key-dates')
  })
})

describe('candidateLinks — the timing bias', () => {
  const page = `
    <a href="/about-us">About us</a>
    <a href="/our-funds/">Our funds</a>
    <a href="/draw-dates">Draw dates</a>
    <a href="/news/latest">News</a>`

  it('picks the dates page when timing is what is missing', () => {
    // /draw-dates scores near zero on the funding vocabulary, which is exactly
    // why Movement for Good was never resolved.
    const got = candidateLinks(page, 'https://movementforgood.com/', false, 'timing')
    expect(got[0]).toBe('https://movementforgood.com/draw-dates')
  })

  it('picks the funding page when funding detail is what is missing', () => {
    const got = candidateLinks(page, 'https://movementforgood.com/', false, 'funding')
    expect(got[0]).toBe('https://movementforgood.com/our-funds/')
  })

  it('will not revisit a page an earlier hop already spent a call on', () => {
    const got = candidateLinks(page, 'https://movementforgood.com/', false, 'timing',
      ['https://movementforgood.com/draw-dates'])
    expect(got).not.toContain('https://movementforgood.com/draw-dates')
  })
})

describe('statesDatedWindows — a rolling claim cannot stand beside dated rounds', () => {
  it('fires on the page that beat the first attempt', () => {
    // Verbatim from movementforgood.com/draws/1000, which also says
    // "Nominations open all year". Both sentences are true; only one of them
    // describes what the surface renders.
    const page = `Nominations open all year. Draw 1 23-27 March 240 x £1,000 awards.
      Draw 2 7-11 September 100 x £1,000 awards. Draw 3 1-16 December 240 x £1,000 awards.`
    expect(statesDatedWindows(page)).toBe(true)
  })

  it('fires on a launch-and-close schedule', () => {
    expect(statesDatedWindows(
      'Wednesday 17 June 2026 Fund Launches. Wednesday 12 August 2026 Application Window Closes.',
    )).toBe(true)
  })

  it('does NOT fire on a genuinely rolling page', () => {
    // The cost of over-firing is a row that stays unverified, so the bar is two
    // dates AND round vocabulary. Neither alone is enough.
    expect(statesDatedWindows(
      'We accept applications at any time. The trustees meet regularly and there is no deadline.',
    )).toBe(false)
    expect(statesDatedWindows('The foundation was established on 4 May 1948.')).toBe(false)
    expect(statesDatedWindows('Applications close 14 April each year.')).toBe(false)
    expect(statesDatedWindows('')).toBe(false)
  })

  it('counts distinct dates, so one date repeated is not a schedule', () => {
    expect(statesDatedWindows('Round closes 12 August. Remember: 12 August. Deadline 12 August.')).toBe(false)
  })
})
