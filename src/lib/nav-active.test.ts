import { describe, it, expect } from 'vitest'
import { isNavActive } from './nav-active'

const FEEDBACK = '/dashboard/admin/feedback'
const TRIAGE   = '/dashboard/admin/feedback-triage'

describe('isNavActive — the sibling-prefix bug', () => {
  // Adding "Feedback triage" next to "Match Feedback" lit both up at once,
  // because /dashboard/admin/feedback-triage starts with /dashboard/admin/feedback.
  it('does not light up Match Feedback when you are on Feedback triage', () => {
    expect(isNavActive(TRIAGE, FEEDBACK)).toBe(false)
    expect(isNavActive(TRIAGE, TRIAGE)).toBe(true)
  })

  it('does not light up Feedback triage when you are on Match Feedback', () => {
    expect(isNavActive(FEEDBACK, TRIAGE)).toBe(false)
    expect(isNavActive(FEEDBACK, FEEDBACK)).toBe(true)
  })
})

describe('isNavActive — behaviour that must not regress', () => {
  it('keeps a section lit on its own sub-pages', () => {
    expect(isNavActive('/dashboard/admin/grants/abc-123', '/dashboard/admin/grants')).toBe(true)
    expect(isNavActive('/dashboard/projects/new', '/dashboard/projects')).toBe(true)
  })

  it('lights the exact page', () => {
    expect(isNavActive('/dashboard/pipeline', '/dashboard/pipeline')).toBe(true)
  })

  it('does not leave the roots permanently lit', () => {
    expect(isNavActive('/dashboard/pipeline', '/dashboard')).toBe(false)
    expect(isNavActive('/dashboard/admin/users', '/dashboard/admin')).toBe(false)
  })

  it('still lights a root when you are actually on it', () => {
    expect(isNavActive('/dashboard', '/dashboard')).toBe(true)
    expect(isNavActive('/dashboard/admin', '/dashboard/admin')).toBe(true)
  })

  it('does not confuse similarly named siblings elsewhere', () => {
    expect(isNavActive('/dashboard/admin/pipeline', '/dashboard/pipeline')).toBe(false)
    expect(isNavActive('/dashboard/plan', '/dashboard/planning')).toBe(false)
    expect(isNavActive('/dashboard/searching', '/dashboard/search')).toBe(false)
  })
})
