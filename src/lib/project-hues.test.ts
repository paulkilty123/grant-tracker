import { describe, it, expect } from 'vitest'
import { PROJECT_HUES, hueForIndex, hueMap, PROJECT_HUE_INK, PROJECT_HUE_NONE } from './project-hues'

describe('hueForIndex', () => {
  it('assigns by position, so the first project is always the first hue', () => {
    expect(hueForIndex(0)).toBe(PROJECT_HUES[0])
    expect(hueForIndex(3)).toBe(PROJECT_HUES[3])
  })

  it('wraps rather than running out', () => {
    expect(hueForIndex(PROJECT_HUES.length)).toBe(PROJECT_HUES[0])
    expect(hueForIndex(PROJECT_HUES.length + 2)).toBe(PROJECT_HUES[2])
  })
})

describe('hueMap', () => {
  it('gives the same project the same hue whatever order the caller queried in', () => {
    // The real failure this guards. The dashboard and projects list query by
    // updated_at, the applications pages by created_at. Before hueMap sorted
    // internally, that alone made the same project two different colours
    // depending on which screen you were looking at.
    const a = { id: 'a', created_at: '2026-01-01' }
    const b = { id: 'b', created_at: '2026-02-01' }
    const c = { id: 'c', created_at: '2026-03-01' }
    const oldestFirst = hueMap([a, b, c])
    const newestFirst = hueMap([c, b, a])
    const arbitrary   = hueMap([b, c, a])
    for (const p of [a, b, c]) {
      expect(newestFirst.get(p.id)).toBe(oldestFirst.get(p.id))
      expect(arbitrary.get(p.id)).toBe(oldestFirst.get(p.id))
    }
  })

  it('does not reshuffle existing projects when a new one is added', () => {
    // Oldest-first is what makes this hold: an existing project's index never
    // moves, and the new one appends. Nothing already on screen changes colour.
    const a = { id: 'a', created_at: '2026-01-01' }
    const b = { id: 'b', created_at: '2026-02-01' }
    const before = hueMap([a, b])
    const after  = hueMap([a, b, { id: 'new', created_at: '2026-06-01' }])
    expect(before.get('a')).toBe(PROJECT_HUES[0])
    expect(after.get('a')).toBe(PROJECT_HUES[0])
    expect(after.get('b')).toBe(PROJECT_HUES[1])
    expect(after.get('new')).toBe(PROJECT_HUES[2])
  })

  it('does not recolour a project just because it was edited', () => {
    // updated_at moving must not matter. It used to: an edit pushed the project
    // to the front of an updated_at query and shifted every colour behind it.
    const a = { id: 'a', created_at: '2026-01-01' }
    const b = { id: 'b', created_at: '2026-02-01' }
    expect(hueMap([a, b]).get('a')).toBe(hueMap([b, a]).get('a'))
  })

  it('sorts rows with no created_at last rather than throwing', () => {
    const m = hueMap([{ id: 'none' }, { id: 'dated', created_at: '2026-01-01' }])
    expect(m.get('dated')).toBe(PROJECT_HUES[0])
    expect(m.get('none')).toBe(PROJECT_HUES[1])
  })

  it('returns nothing for a project it was not given', () => {
    // An application pointing at a deleted or foreign project must fall through
    // to neutral, never to a wrong colour.
    expect(hueMap([{ id: 'a' }]).get('missing')).toBeUndefined()
  })

  it('is empty for an org with no projects', () => {
    expect(hueMap([]).size).toBe(0)
  })
})

describe('the neutral state', () => {
  it('is not one of the project hues', () => {
    // A row with no project must be visibly unfiled, not accidentally coloured
    // like project number one.
    expect(PROJECT_HUES).not.toContain(PROJECT_HUE_NONE)
  })

  it('keeps the glyph colour off the hue list too', () => {
    expect(PROJECT_HUES).not.toContain(PROJECT_HUE_INK)
  })
})
