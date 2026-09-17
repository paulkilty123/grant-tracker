import { describe, it, expect } from 'vitest'
import { leadCutoff, reopensWithinLead } from './reopening-lead'

describe('reopening lead', () => {
  it('is one month', () => {
    expect(leadCutoff('2026-09-07')).toBe('2026-10-07')
    expect(leadCutoff('2026-12-15')).toBe('2027-01-14')
  })
  it('shows a fund reopening inside the month and parks one further out', () => {
    expect(reopensWithinLead('2026-10-01', '2026-09-07')).toBe(true)
    expect(reopensWithinLead('2026-10-07', '2026-09-07')).toBe(true)
    expect(reopensWithinLead('2026-10-08', '2026-09-07')).toBe(false)
    expect(reopensWithinLead('2027-01-01', '2026-09-07')).toBe(false)
    expect(reopensWithinLead(null, '2026-09-07')).toBe(false)
  })
})
