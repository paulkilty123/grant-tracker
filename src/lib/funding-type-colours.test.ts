import { describe, it, expect } from 'vitest'
import { FUNDING_TYPE_COLOUR, TYPE_NEUTRAL, typeColour } from './funding-type-colours'
import { SECTOR_FAMILY, SECTOR_FAMILY_COLOUR, sectorColour, TAG_NEUTRAL } from './sector-colours'

/** Relative luminance, then WCAG contrast. */
function lum(hex: string): number {
  const v = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('funding type colours', () => {
  it('gives every type a foreground that clears 4.5:1 on its own tint', () => {
    for (const [key, c] of Object.entries(FUNDING_TYPE_COLOUR)) {
      expect(contrast(c.fg, c.tint), `${key} fg on tint`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('gives every rail 3:1 against a white card, the non-text floor', () => {
    // This is the one the lime primary failed at 1.95:1 — a button's label can
    // pass while its own edge does not.
    for (const [key, c] of Object.entries(FUNDING_TYPE_COLOUR)) {
      expect(contrast(c.rail, '#FFFFFF'), `${key} rail on white`).toBeGreaterThanOrEqual(3)
    }
  })

  it('has no lime anywhere in the set', () => {
    const all = Object.values(FUNDING_TYPE_COLOUR).flatMap(c => [c.rail, c.tint, c.fg])
    expect(all.map(h => h.toUpperCase())).not.toContain('#8ECB3C')
  })

  it('falls through to null rather than to a wrong type', () => {
    expect(typeColour('accelerator')).toBeNull()
    expect(typeColour(null)).toBeNull()
    expect(typeColour('grant')?.fg).toBe('#1B6B3D')
  })

  it('keeps the neutral scope out of the four', () => {
    const rails = Object.values(FUNDING_TYPE_COLOUR).map(c => c.rail)
    expect(rails).not.toContain(TYPE_NEUTRAL.rail)
  })
})

describe('sector families', () => {
  it('clears 4.5:1 on every family', () => {
    for (const [name, c] of Object.entries(SECTOR_FAMILY_COLOUR)) {
      expect(contrast(c.color, c.bg), `${name}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('maps all 14 sectors, so none silently falls to neutral', () => {
    const taxonomy = [
      'environment', 'community', 'sport', 'food', 'heritage', 'creative',
      'social_economy', 'mental_health', 'health', 'tech', 'justice',
      'education', 'housing', 'employment',
    ]
    for (const s of taxonomy) expect(SECTOR_FAMILY[s], s).toBeDefined()
    expect(Object.keys(SECTOR_FAMILY)).toHaveLength(14)
  })

  it('sends an unknown sector to neutral, never to a wrong family', () => {
    expect(sectorColour('not_a_sector')).toEqual(TAG_NEUTRAL)
  })

  it('keeps every sector family distinct from every funding-type tint', () => {
    // The reason the type chip left the tag row: measured against these
    // families it collided at ΔE 1.3–2.6. Nothing in the two sets may be equal.
    const families = Object.values(SECTOR_FAMILY_COLOUR).map(c => c.bg.toUpperCase())
    const tints    = Object.values(FUNDING_TYPE_COLOUR).map(c => c.tint.toUpperCase())
    for (const t of tints) expect(families).not.toContain(t)
  })
})
