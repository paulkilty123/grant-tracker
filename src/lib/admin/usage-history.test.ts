import { describe, it, expect } from 'vitest'
import { buildHistory } from './usage-history'

// 14 days ending 15 Sept, answer worked out first.
//
// Week 2 (8 to 15 Sept): orgs a, b sign up; a searches and adds; c (old) searches;
// demo org searches and must be ignored. Searchers 2, added 1 => 50%.
// Week 1 (1 to 8 Sept): only c searches, nobody adds => 0%. No signups.
// Site: 10 visitors a day, 2 reaching signup on 10 Sept only.
const now = new Date('2026-09-15T12:00:00Z')
const at = (d: string) => `2026-09-${d}T09:00:00Z`
const orgs = [
  { id: 'a', name: 'A', created_at: at('09') },
  { id: 'b', name: 'B', created_at: at('12') },
  { id: 'c', name: 'C', created_at: '2026-08-01T00:00:00Z' },
  { id: 'demo', name: 'Bramble Arts Collective', created_at: '2026-08-01T00:00:00Z' },
]
const events = [
  { org_id: 'a', event_type: 'results_shown', created_at: at('09') },
  { org_id: 'a', event_type: 'pipeline_added', created_at: at('10') },
  { org_id: 'a', event_type: 'search_executed', created_at: at('10') },
  { org_id: 'c', event_type: 'results_shown', created_at: at('11') },
  { org_id: 'c', event_type: 'results_shown', created_at: at('03') },
  { org_id: 'demo', event_type: 'results_shown', created_at: at('11') },
  { org_id: 'demo', event_type: 'pipeline_added', created_at: at('11') },
]
const site = Array.from({ length: 14 }, (_, i) => {
  const day = new Date(now.getTime() - (13 - i) * 86_400_000).toISOString().slice(0, 10)
  return { day, pageviews: 20, visitors: 10, signupVisitors: day === '2026-09-10' ? 2 : 0 }
})

describe('buildHistory', () => {
  const h = buildHistory(orgs, events, site, 14, now)

  it('daily rows: one per day, joined to the site by day, demo org ignored', () => {
    expect(h.daily).toHaveLength(14)
    const d10 = h.daily.find(d => d.day === '2026-09-10')!
    expect(d10).toEqual({ day: '2026-09-10', visitors: 10, pageviews: 20, signupVisitors: 2, signups: 0, activeOrgs: 1, searches: 1 })
    const d11 = h.daily.find(d => d.day === '2026-09-11')!
    expect(d11.activeOrgs).toBe(1) // c only; demo excluded
    expect(h.daily.reduce((s, d) => s + d.signups, 0)).toBe(2)
  })

  it('weekly ratios match the hand-worked answer', () => {
    expect(h.weekly).toHaveLength(2)
    const [w1, w2] = h.weekly
    expect(w1.searchers).toBe(1); expect(w1.addedToPipeline).toBe(0); expect(w1.searchersAddedPct).toBe(0)
    expect(w2.searchers).toBe(2); expect(w2.addedToPipeline).toBe(1); expect(w2.searchersAddedPct).toBe(50)
    expect(w2.signups).toBe(2)
    expect(w2.visitors).toBe(70); expect(w2.signupVisitors).toBe(2); expect(w2.reachedSignupPct).toBe(3)
  })

  it('no site data means zero visitors and a null ratio, not 0%', () => {
    const h2 = buildHistory(orgs, events, null, 14, now)
    expect(h2.weekly[1].visitors).toBe(0)
    expect(h2.weekly[1].reachedSignupPct).toBeNull()
  })
})
