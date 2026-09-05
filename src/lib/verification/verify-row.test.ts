import { describe, it, expect } from 'vitest'
import { isFrontDoorUrl, timingAnswered, detailAnswered, decideHop, foldEvidence, candidateLinks, statesDatedWindows, unsupportedFigures, bankedSourceTargets } from './verify-row'
import { AMOUNT_UNSUPPORTED_NOTE, DEADLINE_UNSUPPORTED_NOTE } from '../field-evidence'
import type { VerifyResult } from './verify-row'

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

// ── The hop trigger ─────────────────────────────────────────────────────────
//
// MEASUREMENT SCAFFOLDING. `hopOn: 'any'` is not what production runs; these
// tests exist so the widening can be measured without an edit, and so the
// default is demonstrably unchanged.

describe('decideHop', () => {
  const verified = (evidence: ReturnType<typeof ev>[]): Pick<VerifyResult, 'gate' | 'outcome' | 'evidence' | 'fundsOnPage'> =>
    ({ gate: { pass: true, fund_on_page: 'Our Fund' }, outcome: 'verified', evidence })

  it('does not hop when timing is answered and the scope is timing', () => {
    // The false-first half of the pair below: this is today's behaviour, and it
    // is why 229 read rows carry 627 silences the engine has never gone back for.
    const r = verified([ev('deadline', true, 'Applications close 14 April.'), ev('eligible_structures', null)])
    expect(decideHop(r, 'Our Fund', 'timing')).toBeNull()
  })

  it('hops for an unanswered eligibility question once the scope widens', () => {
    const r = verified([ev('deadline', true, 'Applications close 14 April.'), ev('eligible_structures', null)])
    expect(decideHop(r, 'Our Fund', 'any')).toEqual({
      want: 'detail',
      why:  'the page named this fund but said nothing about who may apply',
    })
  })

  it('still prefers timing when both are unanswered', () => {
    // Timing is the field the surface fills in with the word "Rolling", so a
    // wrong answer there is visible to a user in a way a missing structure tag
    // is not. It keeps first call on the one hop we are willing to pay for.
    const r = verified([ev('deadline', null), ev('eligible_structures', null)])
    expect(decideHop(r, 'Our Fund', 'any')?.want).toBe('timing')
  })

  it('asks for nothing when both are answered, under either scope', () => {
    const r = verified([ev('is_rolling', true, 'Applications are accepted year round.'), ev('exclusions', false, 'We do not fund individuals.')])
    expect(decideHop(r, 'Our Fund', 'timing')).toBeNull()
    expect(decideHop(r, 'Our Fund', 'any')).toBeNull()
  })

  it('treats a contradiction as an answer, not a gap', () => {
    // agrees:false means the page spoke and disagreed with us. That is the most
    // informative outcome there is; hopping after it would be paying to
    // second-guess a fact we just sourced.
    const r = verified([ev('deadline', true, 'Closes 1 May.'), ev('eligible_structures', false, 'Open to CICs.')])
    expect(detailAnswered(r)).toBe(true)
    expect(decideHop(r, 'Our Fund', 'any')).toBeNull()
  })

  it('sends a detail-free page after funding detail regardless of scope', () => {
    const r = { gate: { pass: false as const, failure: 'no_funding_detail' as const, detail: '' }, outcome: 'fixable_link' as const, evidence: [] }
    expect(decideHop(r, 'Our Fund', 'timing')?.want).toBe('funding')
    expect(decideHop(r, 'Our Fund', 'any')?.want).toBe('funding')
  })
})

describe('link noise, after the 16 August measurement run', () => {
  const page = (hrefs: string[]) =>
    hrefs.map(h => `<a href="${h}">Read more</a>`).join('\n')

  it('will not follow a policy page that sits under a funding path', () => {
    // The live case: wisemusicfoundation.com/apply/privacy-policy was followed
    // and returned an eligible_structures list and an exclusions list. Both
    // were sourced from a privacy policy.
    const out = candidateLinks(
      page(['/apply/privacy-policy', '/grants/cookie-policy', '/funding/contact-us']),
      'https://wisemusicfoundation.com/apply', false, 'detail',
    )
    expect(out).toEqual([])
  })

  it('will not follow a newsletter', () => {
    // Two of them in one run of sixty. `\bnews\b` never matched "newsletter".
    const out = candidateLinks(
      page(['/our-impact/newsletter-sign-up', '/discover/newsletter.html']),
      'https://www.norfolkfoundation.com/', false, 'detail',
    )
    expect(out).toEqual([])
  })

  it('still follows the page that holds the answer', () => {
    // The guard must not be so wide it takes the destination with it: Berkshire
    // resolved a deadline, a structure gate and three exclusions off these two.
    const out = candidateLinks(
      page(['/available-funding', '/who-can-apply', '/newsletter']),
      'https://www.berkshirecf.org/', false, 'detail',
    )
    expect(out).toContain('https://www.berkshirecf.org/who-can-apply')
    expect(out).not.toContain('https://www.berkshirecf.org/newsletter')
  })

  it('lets a funding path win when only the LINK TEXT is noisy', () => {
    // "Sign up to our newsletter for news of our grants" pointing at /grants is
    // a bad sentence attached to a good destination. Text noise is overridable;
    // path noise is not.
    const out = candidateLinks(
      '<a href="/grants/eligibility">News of our grants: eligibility criteria</a>',
      'https://example.org/', false, 'detail',
    )
    expect(out).toEqual(['https://example.org/grants/eligibility'])
  })
})

/**
 * A figure we show that the page did not state is a reason to read on, not a
 * verdict. Fixtures are the two rows that proved it on 2026-09-04: Yapp's
 * £3,000 sits on its homepage while apply_url is how-to-apply, and The Fore's
 * £45,000 sits on what-we-offer while apply_url is who-we-fund. Before this
 * change decideHop returned null for both (timing was answered) and the
 * unsupported stamp stood; the 2 September sweep then nulled both figures.
 */
describe('unsupported figures make the engine read further', () => {
  const stamped = (field: string, note: string) => ({ field, agrees: null, quote: null, source_url: 'https://x/', note })
  const verified = (evidence: object[]): Pick<VerifyResult, 'gate' | 'outcome' | 'evidence' | 'fundsOnPage'> =>
    ({ gate: { pass: true, fund_on_page: 'Yapp Charitable Trust' }, outcome: 'verified', evidence: evidence as VerifyResult['evidence'] })

  it('names the figures the page left unsupported, and nothing else', () => {
    const r = verified([
      ev('deadline', true, 'Deadlines are 15 March, 15 July and 15 November.'),
      stamped('amount_max', AMOUNT_UNSUPPORTED_NOTE),
      ev('eligible_structures', null),
    ])
    expect(unsupportedFigures(r)).toEqual(['amount'])
    expect(unsupportedFigures(verified([stamped('deadline', DEADLINE_UNSUPPORTED_NOTE)]))).toEqual(['deadline'])
    expect(unsupportedFigures(verified([ev('amount_max', null)]))).toEqual([])   // silent, but we show nothing
  })

  it('hops for funding when an amount we show was not on the page, even though timing is answered', () => {
    const r = verified([
      ev('deadline', true, 'Deadlines are 15 March, 15 July and 15 November.'),
      stamped('amount_max', AMOUNT_UNSUPPORTED_NOTE),
    ])
    expect(decideHop(r, 'Yapp Charitable Trust', 'timing')).toEqual({
      want: 'funding', why: 'the page did not state the amount we show',
    })
  })

  it('hops for timing when the date we show was not on the page', () => {
    const r = verified([stamped('deadline', DEADLINE_UNSUPPORTED_NOTE), ev('amount_max', true, 'Up to £45,000')])
    expect(decideHop(r, 'The Fore Grants Programme', 'timing')?.want).toBe('timing')
  })

  it('a banked page that states the figure replaces the unsupported stamp when folded', () => {
    const first = [stamped('amount_max', AMOUNT_UNSUPPORTED_NOTE)]
    const hop   = [ev('amount_max', true, 'Grants are normally for a maximum of £3,000 per year', 'https://yappcharitabletrust.org.uk/')]
    const folded = foldEvidence(first as VerifyResult['evidence'], hop as VerifyResult['evidence'])
    expect(folded).toHaveLength(1)
    expect(folded[0].agrees).toBe(true)
    expect(folded[0].source_url).toBe('https://yappcharitabletrust.org.uk/')
  })
})

describe('bankedSourceTargets — read what somebody banked before guessing a link', () => {
  const row = {
    apply_url: 'https://thefore.org/who-we-fund/',
    grant_sources: [
      { url: 'https://thefore.org/what-we-offer/', label: 'What we offer (grant size)' },
      { url: 'https://thefore.org/apply/' },
      { url: 'https://fundingforall.org.uk/funds/the-fore/', label: 'directory' },   // off site
      { url: 'not a url' },
      { url: null },
    ],
  }
  it('returns same-site sources in banked order and drops the rest', () => {
    expect(bankedSourceTargets(row, ['https://thefore.org/who-we-fund/'])).toEqual([
      'https://thefore.org/what-we-offer/', 'https://thefore.org/apply/',
    ])
  })
  it('skips pages already read, ignoring a trailing slash or fragment', () => {
    expect(bankedSourceTargets(row, ['https://thefore.org/who-we-fund', 'https://thefore.org/what-we-offer#top']))
      .toEqual(['https://thefore.org/apply/'])
  })
  it('has nothing to offer without an apply_url or without sources', () => {
    expect(bankedSourceTargets({ apply_url: null, grant_sources: row.grant_sources }, [])).toEqual([])
    expect(bankedSourceTargets({ apply_url: row.apply_url, grant_sources: null }, [])).toEqual([])
  })
})
