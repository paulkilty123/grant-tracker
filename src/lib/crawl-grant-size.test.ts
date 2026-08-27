import { describe, it, expect } from 'vitest'
import { extractGrantSize } from './crawl'

/**
 * "Service Pupil Support programme" sat live with no amount at all, so its card
 * read "Amount on application" while covenantfund.org.uk stated "Grants of
 * between £5,000 and £150,000" on the very page we link to. The crawler only
 * ever read the listing, and the listing card says nothing about money.
 *
 * Opening the programme page is the fix, but a whole-page parseAmountRange
 * would have been a worse bug than the gap: the first two £ figures on that
 * page belong to "We've awarded just over £2.5 million to 34 projects". These
 * tests pin the difference between a stated award size and a number that
 * merely appears near one.
 */
describe('extractGrantSize', () => {
  it('reads the range even when the boast comes first', () => {
    // Real text order from the Service Pupil Support page, whitespace collapsed.
    const page = "We've awarded just over £2.5 million to 34 projects dedicated to "
      + 'helping service pupils thrive. Grants of between £5,000 and £150,000.'
    expect(extractGrantSize(page)).toEqual({ min: 5000, max: 150000 })
  })

  it('ignores money the page has spent rather than money it offers', () => {
    expect(extractGrantSize("We've awarded just over £2.5 million to 34 projects."))
      .toEqual({ min: null, max: null })
    // The noun has to be followed directly by of/from/up to/between/worth, so a
    // participle between them ("grants AWARDED of") is not an award size.
    expect(extractGrantSize('Total grants awarded of £2.5 million since 2012.'))
      .toEqual({ min: null, max: null })
  })

  it('takes the envelope across strands, not the first one printed', () => {
    // Reveal and Respond states a range per strand. Reading only the first
    // would cap the row at £40,000 on a programme that funds to £300,000.
    const page = 'Strand 1 offers grants of between £20,000 and £40,000. '
      + 'Strand 2 offers larger grants of between £150,000 and £300,000.'
    expect(extractGrantSize(page)).toEqual({ min: 20000, max: 300000 })
  })

  it('survives the label being rendered away from the figure', () => {
    // <h3>Grants of</h3> … <p>between £5,000 and £150,000</p> arrives as text
    // with a run of newlines and tabs in the middle of the phrase.
    const page = 'Grants of \n\t\t\t\t between £5,000 and £150,000 \n\n Requirements'
    expect(extractGrantSize(page)).toEqual({ min: 5000, max: 150000 })
  })

  it('keeps a ceiling a ceiling', () => {
    // "up to" must not become a floor of the same figure — a false minimum
    // breaks grant-size matching for every org below it.
    expect(extractGrantSize('Grants of up to £20,000 for community projects.'))
      .toEqual({ min: null, max: 20000 })
  })

  it('returns nulls when the page states no size', () => {
    expect(extractGrantSize('Applications close at 12 noon on 30 September 2026.'))
      .toEqual({ min: null, max: null })
    expect(extractGrantSize('')).toEqual({ min: null, max: null })
  })
})
