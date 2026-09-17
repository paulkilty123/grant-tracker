import { describe, it, expect } from 'vitest'
import { resurfaceDecision } from './reopening-resurface'

describe('resurfaceDecision: a refused badge clear must not stop a hidden fund reaching review', () => {
  it('routes a hidden row still marked published (the expire-then-forget case)', () => {
    expect(resurfaceDecision({ is_active: false, pipeline_state: 'published' })).toBe('route')
  })
  it('routes a hidden row parked between rounds', () => {
    expect(resurfaceDecision({ is_active: false, pipeline_state: 'between_rounds_scheduled' })).toBe('route')
  })
  it('does not rewrite a row already awaiting review (daily re-runs stay idempotent)', () => {
    expect(resurfaceDecision({ is_active: false, pipeline_state: 'tagged_awaiting_review' })).toBe('already_queued')
  })
  it('leaves a live row alone: it is visible and the badge is the human\'s', () => {
    expect(resurfaceDecision({ is_active: true, pipeline_state: 'published' })).toBe('leave_live')
    expect(resurfaceDecision({ is_active: true, pipeline_state: 'tagged_awaiting_review' })).toBe('leave_live')
  })
  it('treats a null is_active as hidden', () => {
    expect(resurfaceDecision({ is_active: null, pipeline_state: 'published' })).toBe('route')
  })
})
