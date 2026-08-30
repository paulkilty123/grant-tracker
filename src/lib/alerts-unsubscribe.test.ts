import { describe, it, expect, beforeAll } from 'vitest'
import { unsubscribeToken, verifyUnsubscribeToken, unsubscribeUrl } from './alerts-unsubscribe'

// The module reads the secret at call time, so setting it here is enough.
beforeAll(() => { process.env.ALERT_UNSUBSCRIBE_SECRET = 'test-secret-not-a-real-one' })

const ORG = '3745ad11-a75d-4152-b604-9c95bc21915d'

describe('unsubscribe tokens', () => {
  it('round-trips a token back to its org id', () => {
    expect(verifyUnsubscribeToken(unsubscribeToken(ORG))).toBe(ORG)
  })

  it('rejects a token whose org id was swapped for another', () => {
    // The attack the signature exists to stop: edit the uuid in the URL and
    // unsubscribe somebody else. The signature no longer matches the payload.
    const token = unsubscribeToken(ORG)
    const sig = token.slice(token.lastIndexOf('.') + 1)
    const other = '00000000-0000-0000-0000-000000000000'
    expect(verifyUnsubscribeToken(`${other}.${sig}`)).toBeNull()
  })

  it('rejects a token whose signature was altered', () => {
    const token = unsubscribeToken(ORG)
    // Flip the final character to something it certainly is not.
    const last = token.slice(-1)
    const flipped = token.slice(0, -1) + (last === 'A' ? 'B' : 'A')
    expect(verifyUnsubscribeToken(flipped)).toBeNull()
  })

  it('rejects junk, empties and a bare org id with no signature', () => {
    for (const bad of [null, undefined, '', 'nonsense', ORG, `${ORG}.`, '.sig']) {
      expect(verifyUnsubscribeToken(bad as string | null)).toBeNull()
    }
  })

  it('is stable across calls, so a link in an old email still works', () => {
    expect(unsubscribeToken(ORG)).toBe(unsubscribeToken(ORG))
  })

  it('builds a url carrying the token in ?t=', () => {
    const url = unsubscribeUrl('https://www.shootsfunding.co.uk', ORG)
    expect(url).toContain('/api/alerts/unsubscribe?t=')
    const t = decodeURIComponent(new URL(url).searchParams.get('t') ?? '')
    expect(verifyUnsubscribeToken(t)).toBe(ORG)
  })

  it('a token signed under a different secret does not verify', () => {
    // Guards against the fallback chain quietly accepting anything.
    const token = unsubscribeToken(ORG)
    process.env.ALERT_UNSUBSCRIBE_SECRET = 'a-different-secret'
    expect(verifyUnsubscribeToken(token)).toBeNull()
    process.env.ALERT_UNSUBSCRIBE_SECRET = 'test-secret-not-a-real-one'
  })
})
