import { describe, it, expect } from 'vitest'
import { grantMatchesLocationText } from './matching'

/**
 * The Find Funding location test, keyed off location_tag against the org's
 * free-text location. Found from the demo on 2026-09-04: Yapp Charitable
 * Trust ("England & Wales") vanished from Find Funding for a Leeds charity,
 * because a nation tag was string-matched like a region and "leeds" is not a
 * substring of "england & wales". Predicted before the fix: Yapp NOT in the
 * gated set; after: position 2 at 74%.
 */
describe('grantMatchesLocationText', () => {
  it('lets a Leeds organisation through an England & Wales tag', () => {
    expect(grantMatchesLocationText('England & Wales', 'Leeds')).toBe(true)
    expect(grantMatchesLocationText('England & Wales, Isle of Man & Ireland', 'Leeds')).toBe(true)
    expect(grantMatchesLocationText('England', 'Leeds, West Yorkshire')).toBe(true)
  })

  it('keeps a Scotland-only tag away from a Leeds organisation', () => {
    expect(grantMatchesLocationText('Scotland', 'Leeds')).toBe(false)
    expect(grantMatchesLocationText('Scotland', 'Glasgow, Scotland')).toBe(true)
  })

  it('reads Wales from the text, and defaults to England when no nation is named', () => {
    expect(grantMatchesLocationText('Wales', 'Cardiff, Wales')).toBe(true)
    expect(grantMatchesLocationText('Wales', 'Leeds')).toBe(false)
  })

  it('still treats a county or two-area tag as a region', () => {
    // The Reckitt case from the same demo: Hull and East Yorkshire must not
    // admit Leeds, while the old "Yorkshire" tag did.
    expect(grantMatchesLocationText('Hull and East Yorkshire', 'Leeds')).toBe(false)
    expect(grantMatchesLocationText('Hull and East Yorkshire', 'Hull')).toBe(true)
    expect(grantMatchesLocationText('Yorkshire', 'Leeds')).toBe(true)
  })

  it('national and empty tags always pass', () => {
    expect(grantMatchesLocationText('UK', 'Leeds')).toBe(true)
    expect(grantMatchesLocationText(null, 'Leeds')).toBe(true)
    expect(grantMatchesLocationText('Scotland', '')).toBe(true)
  })
})
