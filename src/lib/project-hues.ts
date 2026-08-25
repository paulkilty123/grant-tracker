/**
 * Project colours.
 *
 * One project gets one hue, and that hue appears on the project itself and on
 * every application filed against it. That is the whole point: three
 * applications all reading "Youth Fund" are indistinguishable, and the shared
 * colour is what separates them at a glance.
 *
 * ASSIGNED BY POSITION, never hashed from the id. A hash would reshuffle every
 * colour whenever a project was added, so the mapping has to come from a stable
 * order — projects newest-first, the same order every surface loads them in.
 * Shared from here so the dashboard and the applications list cannot disagree;
 * two surfaces colouring the same project differently is worse than neither
 * colouring it at all.
 *
 * The glyph on each tile is --deep #1D3C3E, which measures 6.4 / 7.7 / 7.1 /
 * 4.4 / 5.9 against these grounds — all clear of the 3:1 non-text floor.
 */
export const PROJECT_HUES = ['#9BCA9D', '#EBCE78', '#ABCBEE', '#4EAAB4', '#E0A088'] as const

/** The glyph/text colour that sits on any of the hues above. */
export const PROJECT_HUE_INK = '#1D3C3E'

/** Neutral ground for a row with no project. No swatch, no label, no colour. */
export const PROJECT_HUE_NONE = '#F1EDE3'

export function hueForIndex(i: number): string {
  return PROJECT_HUES[i % PROJECT_HUES.length]
}

/**
 * id → hue, from a list already in the canonical order.
 *
 * Callers pass projects newest-first. Anything that passes a different order
 * will produce a different colouring, which is why the order lives in one
 * comment rather than in each caller's head.
 */
export function hueMap(projects: { id: string }[]): Map<string, string> {
  return new Map(projects.map((p, i) => [p.id, hueForIndex(i)]))
}
