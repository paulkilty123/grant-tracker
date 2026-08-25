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
 * id → hue. Sorts internally, so a caller's query order cannot change the
 * answer.
 *
 * IT SORTS BY created_at ASCENDING, oldest first, and that is the whole point.
 * An earlier version took the caller's order on trust and documented
 * "newest-first" in a comment. Three pages then read the same projects three
 * ways — the dashboard and this list by updated_at, the applications pages by
 * created_at — so the same project rendered in two colours depending on which
 * screen you were on, and ANY edit to a project reshuffled the whole palette
 * by moving it to the front.
 *
 * Oldest-first is the only order that holds still: a project's index never
 * changes once it exists, and a new one appends at the end and takes the next
 * colour. Nothing already on screen moves.
 *
 * Rows without created_at sort last, in the order given, rather than throwing.
 */
export function hueMap(projects: { id: string; created_at?: string | null }[]): Map<string, string> {
  const ordered = projects
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ax = a.p.created_at, bx = b.p.created_at
      if (ax && bx) return ax < bx ? -1 : ax > bx ? 1 : a.i - b.i
      if (ax) return -1
      if (bx) return 1
      return a.i - b.i
    })
  return new Map(ordered.map(({ p }, i) => [p.id, hueForIndex(i)]))
}
