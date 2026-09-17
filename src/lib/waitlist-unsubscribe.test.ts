import { describe, it, expect, beforeAll } from 'vitest'
import {
  waitlistRemovalToken, verifyWaitlistRemovalToken, waitlistRemovalUrl,
} from './waitlist-unsubscribe'

// The module refuses to sign without a secret, which is the behaviour we want
// in production and an obstacle here. Set one before anything calls it.
beforeAll(() => { process.env.ALERT_UNSUBSCRIBE_SECRET = 'test-secret-for-waitlist-tokens' })

const ROW = '535463a3-a37b-441d-8a12-3a4b10d99d3c'

describe('waitlist removal tokens', () => {
  it('round-trips a row id', () => {
    expect(verifyWaitlistRemovalToken(waitlistRemovalToken(ROW))).toBe(ROW)
  })

  // Each of these is the alarm firing. A verifier that only ever sees good
  // tokens is indistinguishable from one that returns the id unconditionally,
  // which is exactly the bug worth having a test for.
  it('rejects a tampered signature', () => {
    const t = waitlistRemovalToken(ROW)
    const bad = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')
    expect(verifyWaitlistRemovalToken(bad)).toBeNull()
  })

  it('rejects a swapped row id under a valid signature', () => {
    const sig = waitlistRemovalToken(ROW).split('.').pop()!
    const other = '00000000-0000-0000-0000-000000000000'
    expect(verifyWaitlistRemovalToken(`${other}.${sig}`)).toBeNull()
  })

  it('rejects a signature of the wrong length without throwing', () => {
    // timingSafeEqual throws on unequal lengths. The length check has to come
    // first, and a truncated token is the commonest way a real link arrives
    // broken, because mail clients wrap long URLs.
    expect(() => verifyWaitlistRemovalToken(`${ROW}.short`)).not.toThrow()
    expect(verifyWaitlistRemovalToken(`${ROW}.short`)).toBeNull()
  })

  it('rejects a token with no signature at all', () => {
    expect(verifyWaitlistRemovalToken(ROW)).toBeNull()
    expect(verifyWaitlistRemovalToken('')).toBeNull()
  })

  it('does not accept an alert unsubscribe token', async () => {
    // Both modules sign with the same key. The domain prefix is the only thing
    // stopping a token minted for one route working on the other, so if that
    // prefix is ever dropped this is the test that notices.
    const { unsubscribeToken } = await import('./alerts-unsubscribe')
    expect(verifyWaitlistRemovalToken(unsubscribeToken(ROW))).toBeNull()
  })

  it('puts the token in the query string and the id nowhere else', () => {
    const url = waitlistRemovalUrl('https://www.shootsfunding.co.uk', ROW)
    expect(url).toContain('/api/waitlist/unsubscribe?t=')
    // No email address anywhere in the link: it gets forwarded and indexed.
    expect(url).not.toContain('@')
  })
})
