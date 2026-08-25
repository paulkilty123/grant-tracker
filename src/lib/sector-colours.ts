/**
 * Impact-area chips: five colour families over the 14-sector taxonomy.
 *
 * THE RULE IN THE TAG ROW: colour means impact area. Sectors are coloured by
 * family; beneficiary group, funder category and location stay neutral. A tag
 * row where two different kinds of thing both carry colour is a row where
 * colour means nothing.
 *
 * The funding type is NOT in this row, and must not be put back. Measured
 * against these families it collides at ΔE 1.3–2.6 — an in-kind chip and an
 * amber sector chip are effectively the same colour. Two categorical systems
 * cannot share one chip row, so the type lives in the meta row instead, in its
 * own foreground colour.
 *
 * Purple moved from a first pick of #ECE9F7, which sat ΔE 4.9 from the blue
 * family. It is now 8.4; every other pair in the set is 9.9–19.7.
 */
export type SectorFamily = 'green' | 'amber' | 'blue' | 'coral' | 'purple'

export const SECTOR_FAMILY_COLOUR: Record<SectorFamily, { bg: string; color: string }> = {
  green:  { bg: '#E3F0E4', color: '#1B6B3D' },  // 5.55:1
  amber:  { bg: '#F9F1D9', color: '#7A5E11' },  // 5.42:1
  blue:   { bg: '#E7F0FA', color: '#2A5A85' },  // 6.29:1
  coral:  { bg: '#F4D8D0', color: '#8C3B28' },  // 5.62:1
  purple: { bg: '#EFE6FA', color: '#4A3E8C' },  // 7.36:1
}

/**
 * Sector → family. This grouping is deliberate and unchanged from the version
 * that shipped; only the colour values moved. Fourteen distinct chip colours
 * would be unreadable, and these five carve the taxonomy where a fundraiser
 * would carve it.
 */
export const SECTOR_FAMILY: Record<string, SectorFamily> = {
  environment:    'green',
  community:      'green',
  sport:          'green',
  food:           'green',
  heritage:       'amber',
  creative:       'amber',
  social_economy: 'blue',
  mental_health:  'blue',
  health:         'blue',
  tech:           'blue',
  justice:        'coral',
  education:      'purple',
  housing:        'purple',
  employment:     'purple',
}

/** Neutral chip, for anything that is not an impact area. */
export const TAG_NEUTRAL = { bg: '#F1EDE3', color: '#5F5E5A' }

export function sectorColour(sector: string): { bg: string; color: string } {
  const family = SECTOR_FAMILY[sector]
  return family ? SECTOR_FAMILY_COLOUR[family] : TAG_NEUTRAL
}
