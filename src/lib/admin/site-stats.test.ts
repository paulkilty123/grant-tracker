import { describe, it, expect } from 'vitest'
import { parseSiteStats, fillDays } from './site-stats'

// Fixture in the RPC's real shape: jsonb counts arrive as numbers, but a
// bigint aggregate can arrive as a string through PostgREST, so both are fed.
const payload = {
  pageviews: '204', visitors: 83, signupVisitors: 28, adminSessionsExcluded: 3,
  byDay: [{ day: '2026-09-10', pageviews: 204, visitors: 83 }],
  pages: [{ path: '/', views: 137, visitors: 106 }],
  sources: [{ source: 'linkedin / launch', visitors: 11 }, { source: 'direct', visitors: 160 }],
  landing: [{ path: '/', visitors: 90 }],
}

describe('parseSiteStats', () => {
  it('reads the RPC shape, numbers or numeric strings', () => {
    const s = parseSiteStats(payload, 7)
    expect(s.pageviews).toBe(204)
    expect(s.visitors).toBe(83)
    expect(s.signupVisitors).toBe(28)
    expect(s.sources[0]).toEqual({ source: 'linkedin / launch', visitors: 11 })
  })

  it('refuses a wrong shape rather than reporting zeros', () => {
    expect(() => parseSiteStats(null, 7)).toThrow()
    expect(() => parseSiteStats({ ...payload, byDay: 'nope' }, 7)).toThrow(/byDay/)
    expect(() => parseSiteStats({ ...payload, pageviews: 'many' }, 7)).toThrow(/pageviews/)
  })
})

describe('fillDays', () => {
  it('puts a zero row on every missing day, in order, ending today', () => {
    const now = new Date('2026-09-15T12:00:00Z')
    const out = fillDays([{ day: '2026-09-13', pageviews: 30, visitors: 11 }], 3, now)
    expect(out.map(d => d.day)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15'])
    expect(out[0].pageviews).toBe(30)
    expect(out[1]).toEqual({ day: '2026-09-14', pageviews: 0, visitors: 0 })
  })
})
