// The backoff must be able to BOTH start and stop.
//
// An alarm that cannot fire and a skip that cannot clear are the same bug in
// opposite directions, and the second is the one that would quietly remove a
// funder from verification for ever. Every case below asserts the transition,
// not just the resting state.

import { describe, it, expect } from 'vitest'
import {
  shouldSkipHost, recordFailure, recordSuccess, backoffHours, hostOf, isHostLevel,
  HOST_BACKOFF_HOURS, MAX_BACKOFF_HOURS, type HostState,
} from './host-backoff'

const AT = (iso: string) => new Date(iso)

describe('backoffHours', () => {
  it('doubles the way shape C does, and caps', () => {
    expect(backoffHours(0)).toBe(0)
    expect(backoffHours(1)).toBe(HOST_BACKOFF_HOURS[0])
    expect(backoffHours(2)).toBe(HOST_BACKOFF_HOURS[1])
    // Past the end of the ladder it holds at the cap rather than growing.
    expect(backoffHours(99)).toBe(MAX_BACKOFF_HOURS)
  })

  it('never exceeds the cap, so a wall is never a permanent skip', () => {
    // A permanent skip is a silent removal from verification.
    for (const n of [1, 3, 6, 12, 500]) expect(backoffHours(n)).toBeLessThanOrEqual(MAX_BACKOFF_HOURS)
  })
})

describe('shouldSkipHost', () => {
  const walled = (failures: number, at: string): HostState =>
    ({ failures, lastFailedAt: at, reason: 'bot_wall' })

  it('does not skip a host with no history', () => {
    expect(shouldSkipHost(null)).toBeNull()
    expect(shouldSkipHost({ failures: 0, lastFailedAt: '2026-09-01T00:00:00Z', reason: 'bot_wall' })).toBeNull()
  })

  it('SKIPS inside the window, and says how long is left', () => {
    const s = shouldSkipHost(walled(1, '2026-09-01T10:00:00Z'), AT('2026-09-01T10:30:00Z'))
    expect(s?.skip).toBe(true)
    expect(s?.reason).toBe('bot_wall')
    expect(s?.hoursLeft).toBeGreaterThan(0)
  })

  it('STOPS skipping once the window passes — the half that matters', () => {
    // One failure buys one hour. Ninety minutes later the host is read again.
    expect(shouldSkipHost(walled(1, '2026-09-01T10:00:00Z'), AT('2026-09-01T11:30:00Z'))).toBeNull()
  })

  it('waits longer after repeated failures, and still lets go', () => {
    const four = walled(4, '2026-09-01T00:00:00Z')   // 24 hours
    expect(shouldSkipHost(four, AT('2026-09-01T12:00:00Z'))?.skip).toBe(true)
    expect(shouldSkipHost(four, AT('2026-09-02T01:00:00Z'))).toBeNull()
  })

  it('does not skip on an unparseable timestamp — a corrupt entry must not hide a host', () => {
    expect(shouldSkipHost({ failures: 5, lastFailedAt: 'not a date', reason: 'bot_wall' })).toBeNull()
  })
})

describe('a host that starts working again is forgiven immediately', () => {
  it('clears the entry outright rather than decrementing it', () => {
    let state: HostState | null = null
    for (let i = 0; i < 5; i++) state = recordFailure(state, 'bot_wall', AT('2026-09-01T00:00:00Z'))
    expect(state!.failures).toBe(5)
    expect(shouldSkipHost(state, AT('2026-09-01T01:00:00Z'))?.skip).toBe(true)

    // The funder removes their WAF. No sentence to serve out.
    state = recordSuccess()
    expect(state).toBeNull()
    expect(shouldSkipHost(state, AT('2026-09-01T01:00:00Z'))).toBeNull()
  })
})

describe('which failures are a property of the host', () => {
  it('remembers interception and emptiness', () => {
    expect(isHostLevel('bot_wall')).toBe(true)
    expect(isHostLevel('empty')).toBe(true)
  })

  it('does NOT remember a soft 404 or a directory listing', () => {
    // A soft 404 is a fact about one URL. Backing off the host would hide every
    // other row on a funder whose site is otherwise fine.
    expect(isHostLevel('soft_404')).toBe(false)
    expect(isHostLevel('directory_listing')).toBe(false)
  })
})

describe('hostOf', () => {
  it('collapses the forms the catalogue actually stores', () => {
    expect(hostOf('https://www.artscouncil.org.uk/our-open-funds/x')).toBe('artscouncil.org.uk')
    expect(hostOf('http://artscouncil.org.uk')).toBe('artscouncil.org.uk')
    expect(hostOf('https://www.london.gov.uk:443/a/b')).toBe('london.gov.uk')
    expect(hostOf(null)).toBe('')
  })

  it('groups the eleven Arts Council rows onto one entry', () => {
    const urls = [
      'https://www.artscouncil.org.uk/ProjectGrants',
      'https://www.artscouncil.org.uk/museum-transformation-programme',
      'https://www.artscouncil.org.uk/our-open-funds/creative-foundations-fund-cff-round-2',
    ]
    expect(new Set(urls.map(hostOf)).size).toBe(1)
  })
})
