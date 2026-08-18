import { describe, it, expect } from 'vitest'
import { quoteOverstatesAward } from './quote-vs-amount'

const ASDA = '£529,977 Outdoor Community Spaces Fund £510,465 Young Futures Fund £1,255,314 Local Community Spaces Fund £401,400 Better Together Fund £400,200 Foodbank Fundamentals Fund £13,291 Match Funding'

describe('quoteOverstatesAward', () => {
  it('catches the Asda card, where the quote lists pots under a typical-award heading', () => {
    const r = quoteOverstatesAward(ASDA, 20000)
    expect(r).not.toBeNull()
    expect(r!.quoted).toBeGreaterThanOrEqual(500000)
    expect(r!.stored).toBe(20000)
  })

  it('stays quiet when the quote agrees with the stored figure', () => {
    expect(quoteOverstatesAward('Grants of up to £20,000 are available', 20000)).toBeNull()
    expect(quoteOverstatesAward('awards ranged from £5,000 to £18,000', 20000)).toBeNull()
  })

  it('stays quiet on normal variation, so it does not become background noise', () => {
    // Twice the stored max is under the bar on purpose.
    expect(quoteOverstatesAward('one award of £40,000', 20000)).toBeNull()
  })

  it('leaves a genuine per-grant disagreement to the amount flags', () => {
    // "up to £250,000" is CUED, so it is an argument about the award itself and
    // a different finding. This check must not claim it as a pot.
    expect(quoteOverstatesAward('grants of up to £250,000', 20000)).toBeNull()
  })

  it('says nothing when we hold no maximum to compare against', () => {
    expect(quoteOverstatesAward(ASDA, null)).toBeNull()
    expect(quoteOverstatesAward(ASDA, 0)).toBeNull()
  })

  it('says nothing on an empty or figureless quote', () => {
    expect(quoteOverstatesAward('', 20000)).toBeNull()
    expect(quoteOverstatesAward('Supporting grassroots community groups', 20000)).toBeNull()
    expect(quoteOverstatesAward(null, 20000)).toBeNull()
  })
})
