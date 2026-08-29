import { describe, it, expect } from 'vitest'
import { foundingPriceAvailable, foundingOfferIsOpen } from './founding'
import { FOUNDING_OFFER_CLOSES } from '@/config/plans'

const beforeClose = new Date('2026-10-01T00:00:00Z')
const afterClose  = new Date('2026-11-01T00:00:00Z')
/** When the cohort's six free months end and they convert. */
const conversion  = new Date('2027-03-10T09:00:00Z')

describe('the public founding offer', () => {
  it('is open before the end of October', () => {
    expect(foundingPriceAvailable('self_serve', beforeClose).allowed).toBe(true)
    expect(foundingOfferIsOpen(beforeClose)).toBe(true)
  })

  it('is closed after it', () => {
    expect(foundingPriceAvailable('self_serve', afterClose).allowed).toBe(false)
    expect(foundingOfferIsOpen(afterClose)).toBe(false)
  })

  it('is still open at the last instant, not one short', () => {
    // An off-by-one here shuts the offer a day early, on the day the most
    // people would be taking it.
    expect(foundingPriceAvailable('self_serve', new Date(FOUNDING_OFFER_CLOSES)).allowed).toBe(true)
  })

  it('says why when it refuses, naming the date', () => {
    expect(foundingPriceAvailable('self_serve', afterClose).reason).toContain('2026-10-31')
  })
})

describe('the standing promise to the cohort', () => {
  // This is the assertion the whole module exists for. A single date check
  // would pass every test above and fail this one, and the failure would be
  // invisible until March, when a cohort member is quoted the public price.
  it('still grants the founding rate in March, four months after the window shut', () => {
    expect(foundingPriceAvailable('granted', conversion).allowed).toBe(true)
  })

  it('grants it however long afterwards', () => {
    expect(foundingPriceAvailable('granted', new Date('2030-01-01T00:00:00Z')).allowed).toBe(true)
  })

  it('and self-serve at that same moment is refused', () => {
    // Proves the two channels genuinely diverge rather than both being open.
    expect(foundingPriceAvailable('self_serve', conversion).allowed).toBe(false)
  })

  it('explains itself as a promise, not as an open offer', () => {
    expect(foundingPriceAvailable('granted', conversion).reason).toMatch(/promised/)
  })
})
