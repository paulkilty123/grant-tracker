import { describe, it, expect } from 'vitest'
import { compareWeeks, weekInputsFromEvents, renderWeekComparisonHtml } from './week-compare'

// A fixture in the real shape, with the answer worked out by hand first.
//
// This week (8 to 15 Sept): four orgs signed up. Three of them searched. Two
// older orgs also searched, so five searchers. Of the five, two added to the
// pipeline, and one of the two is a new org. One org's only event is OUTSIDE
// the window and must not count. One org has pipeline_added but never
// results_shown, so it cannot be a "searcher who added".
//
// Predicted: signups 4, signupsWhoSearched 3, searchers 5, searchersWhoAdded 2.
const start = new Date('2026-09-08T00:00:00Z')
const end   = new Date('2026-09-15T00:00:00Z')
const at = (d: string) => `2026-09-${d}T10:00:00Z`
const orgs = [
  { id: 'n1', created_at: at('09') }, { id: 'n2', created_at: at('10') },
  { id: 'n3', created_at: at('11') }, { id: 'n4', created_at: at('12') },
  { id: 'o1', created_at: '2026-08-01T00:00:00Z' }, { id: 'o2', created_at: '2026-08-01T00:00:00Z' },
  { id: 'o3', created_at: '2026-08-01T00:00:00Z' }, { id: 'o4', created_at: '2026-08-01T00:00:00Z' },
]
const events = [
  { org_id: 'n1', event_type: 'results_shown', created_at: at('09') },
  { org_id: 'n2', event_type: 'results_shown', created_at: at('10') },
  { org_id: 'n2', event_type: 'pipeline_added', created_at: at('10') },
  { org_id: 'n3', event_type: 'results_shown', created_at: at('11') },
  { org_id: 'o1', event_type: 'results_shown', created_at: at('12') },
  { org_id: 'o1', event_type: 'pipeline_added', created_at: at('13') },
  { org_id: 'o2', event_type: 'results_shown', created_at: at('13') },
  { org_id: 'o3', event_type: 'results_shown', created_at: at('03') },   // outside the window
  { org_id: 'o4', event_type: 'pipeline_added', created_at: at('14') },  // never searched
]

describe('weekInputsFromEvents', () => {
  it('matches the hand-worked answer', () => {
    const w = weekInputsFromEvents(orgs, events, { visitors: 193, signupVisitors: 28 }, start, end)
    expect(w).toEqual({
      visitors: 193, signupVisitors: 28,
      signups: 4, signupsWhoSearched: 3,
      searchers: 5, searchersWhoAddedToPipeline: 2,
    })
  })
})

describe('compareWeeks', () => {
  const cur  = { visitors: 193, signupVisitors: 28, signups: 4, signupsWhoSearched: 3, searchers: 5, searchersWhoAddedToPipeline: 2 }
  const prev = { visitors: 100, signupVisitors: 10, signups: 2, signupsWhoSearched: 2, searchers: 4, searchersWhoAddedToPipeline: 1 }

  it('gives the deltas and the three ratios, rounded', () => {
    const c = compareWeeks(cur, prev)
    expect(c.counts.find(r => r.label === 'Visitors')).toEqual({ label: 'Visitors', thisWeek: 193, lastWeek: 100, delta: 93 })
    expect(c.ratios.map(r => [r.thisWeek, r.lastWeek])).toEqual([[15, 10], [75, 100], [40, 25]])
  })

  it('a zero denominator is n/a, not 0%', () => {
    const c = compareWeeks({ ...cur, signups: 0, signupsWhoSearched: 0 }, prev)
    expect(c.ratios[1].thisWeek).toBeNull()
    expect(renderWeekComparisonHtml(c)).toContain('n/a')
  })

  it('renders the change with sign and points', () => {
    const html = renderWeekComparisonHtml(compareWeeks(cur, prev))
    expect(html).toContain('+93')
    expect(html).toContain('+15 pts')
    expect(html).toContain('-25 pts')
  })
})
