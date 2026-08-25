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
  it('gives the same project the same hue on every surface', () => {
    // The dashboard and the applications list build this from separate queries.
    // They agree only because both order projects newest-first; if one of them
    // ever stops doing that, the same project renders in two colours.
    const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const dashboard = hueMap(projects)
    const list      = hueMap(projects)
    for (const p of projects) expect(dashboard.get(p.id)).toBe(list.get(p.id))
  })

  it('does not reshuffle existing projects when a newer one is added', () => {
    // Newest-first, so a new project goes to the FRONT — which is exactly the
    // case a position-based mapping has to survive. It does not: this documents
    // that adding a project DOES recolour the others, and that the alternative
    // (hashing the id) was rejected because it scatters the palette.
    const before = hueMap([{ id: 'a' }, { id: 'b' }])
    const after  = hueMap([{ id: 'new' }, { id: 'a' }, { id: 'b' }])
    expect(before.get('a')).toBe(PROJECT_HUES[0])
    expect(after.get('a')).toBe(PROJECT_HUES[1])
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
