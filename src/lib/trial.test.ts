import { describe, it, expect } from 'vitest'
import {
  TRIAL_DAYS, SETUP_MINUTES, TRIAL_PHRASE, SETUP_PHRASE, TRIAL_AND_SETUP_LINE,
} from './trial'

/**
 * The rule this module exists to hold is "never a bare free", so the test that
 * matters is that the word never appears without its bound. A test asserting
 * the exact string would just restate the constant; these assert the property.
 */
describe('trial copy', () => {
  it('never says "free" without saying for how long', () => {
    expect(TRIAL_PHRASE).toMatch(/free/i)
    expect(TRIAL_PHRASE).toContain(String(TRIAL_DAYS))
    // The bound must be in the same sentence, not merely somewhere on the page.
    expect(TRIAL_PHRASE.split('.')[0]).toContain(String(TRIAL_DAYS))
  })

  it('keeps the hedge on the setup time', () => {
    expect(SETUP_PHRASE).toContain('about')
    expect(SETUP_PHRASE).toContain(String(SETUP_MINUTES))
  })

  it('composes the line that sits beside a signup CTA', () => {
    expect(TRIAL_AND_SETUP_LINE).toBe('Free for 14 days. Takes about 5 minutes to set up.')
  })

  it('tracks the constants rather than hardcoding them', () => {
    expect(TRIAL_PHRASE).toBe(`Free for ${TRIAL_DAYS} days`)
    expect(SETUP_PHRASE).toBe(`Takes about ${SETUP_MINUTES} minutes to set up.`)
  })
})
