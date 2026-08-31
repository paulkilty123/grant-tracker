import { describe, it, expect } from 'vitest'
import { oneOrgPerRecipient } from './one-per-recipient'

const org = (id: string, name: string, owner_email: string, created_at: string) =>
  ({ id, name, owner_email, created_at })

describe('one digest per person', () => {
  it('sends once to someone holding seven organisations', () => {
    // The real shape: paulkilty1@gmail.com had seven with alerts on, and a
    // broadcast would have delivered seven emails at once.
    const orgs = Array.from({ length: 7 }, (_, i) =>
      org(`o${i}`, `Org ${i}`, 'p@example.com', `2026-0${i + 1}-01`))
    const { chosen, suppressed } = oneOrgPerRecipient(orgs, new Map())
    expect(chosen).toHaveLength(1)
    expect(suppressed).toHaveLength(6)
  })

  it('picks the organisation carrying the work, not the oldest', () => {
    const orgs = [
      org('old', 'Empty But Oldest', 'p@example.com', '2026-01-01'),
      org('busy', 'Has The Pipeline', 'p@example.com', '2026-06-01'),
    ]
    const { chosen, suppressed } = oneOrgPerRecipient(orgs, new Map([['busy', 12]]))
    expect(chosen[0].name).toBe('Has The Pipeline')
    expect(suppressed[0]).toEqual({
      to: 'p@example.com', org: 'Empty But Oldest', inFavourOf: 'Has The Pipeline',
    })
  })

  it('falls back to the oldest when nobody has done anything', () => {
    // destination6one8 held five records with zero activity in any of them.
    // The app shows the oldest when it has no active-org cookie, so the email
    // is about the one somebody landing in the app would see.
    const orgs = [
      org('b', 'Second', 'p@example.com', '2026-05-01'),
      org('a', 'First',  'p@example.com', '2026-02-01'),
      org('c', 'Third',  'p@example.com', '2026-08-01'),
    ]
    expect(oneOrgPerRecipient(orgs, new Map()).chosen[0].name).toBe('First')
  })

  it('leaves separate people alone', () => {
    const orgs = [
      org('a', 'A', 'one@example.com', '2026-01-01'),
      org('b', 'B', 'two@example.com', '2026-01-01'),
    ]
    const { chosen, suppressed } = oneOrgPerRecipient(orgs, new Map())
    expect(chosen).toHaveLength(2)
    expect(suppressed).toHaveLength(0)
  })

  it('treats a differently-cased address as the same person', () => {
    const orgs = [
      org('a', 'A', 'Person@Example.com', '2026-01-01'),
      org('b', 'B', 'person@example.com', '2026-02-01'),
    ]
    expect(oneOrgPerRecipient(orgs, new Map()).chosen).toHaveLength(1)
  })
})
