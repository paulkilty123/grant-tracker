/**
 * What actually changed on a funder's listing page, and does it matter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DATA WAS ALREADY THERE
 *
 * `watchlist_alerts` has stored `snapshot_before` and `snapshot_after` in full
 * since the watchlist was built, so the set difference between two fingerprints
 * has been computable the whole time. Nothing computed it. The admin screen
 * renders both snapshots side by side and leaves the reader to spot the
 * difference between two forty-item lists of lowercased headings, which is why
 * 387 alerts have accumulated and not one has ever been resolved.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DIFF IS FREE; ONLY THE JUDGEMENT COSTS ANYTHING
 *
 * Splitting on the separator and taking a set difference is exact and costs
 * nothing. The part that needs a model is narrow: given these lines appeared and
 * these disappeared, has the funding offer changed, or has a news carousel
 * rotated? So the model sees only the difference, never the two full pages, and
 * the prompt asks for one label and the line it turns on.
 *
 * A label with no quote behind it is an opinion. `parseClassification` refuses
 * one for the same reason `buildEvidencePatch` refuses an unquoted verdict.
 */

/** The fingerprint separator `extractFingerprint` writes. */
const SEP = ' || '

/**
 * How much of a diff the model is shown.
 *
 * A redesign can change every line on a page, and paying to read 300 rotated
 * blog titles buys nothing that the first 30 do not already say. The cap is
 * reported alongside the result rather than applied quietly — a truncated input
 * that does not say it was truncated reads as the whole answer.
 */
export const MAX_DIFF_ITEMS = 30
const MAX_ITEM_CHARS = 200

export type FingerprintDiff = {
  added:   string[]
  removed: string[]
  /** Totals before the cap, so a truncated sample cannot be read as complete. */
  addedTotal:   number
  removedTotal: number
  truncated:    boolean
}

/** Set difference between two fingerprints, capped and reported. */
export function diffFingerprints(before: string | null, after: string | null): FingerprintDiff {
  const split = (s: string | null) =>
    (s ?? '').split(SEP).map(x => x.trim()).filter(Boolean)

  const beforeItems = split(before)
  const afterItems  = split(after)
  const b = new Set(beforeItems)
  const a = new Set(afterItems)

  // Deduplicated by the Sets, ordered by the arrays. Spreading a Set needs
  // downlevelIteration under this tsconfig's target, so the arrays do the
  // ordering and the Sets do the membership.
  const added   = afterItems.filter((x, i) => afterItems.indexOf(x) === i && !b.has(x))
  const removed = beforeItems.filter((x, i) => beforeItems.indexOf(x) === i && !a.has(x))
  const clip = (xs: string[]) => xs.slice(0, MAX_DIFF_ITEMS).map(x => x.slice(0, MAX_ITEM_CHARS))

  return {
    added:        clip(added),
    removed:      clip(removed),
    addedTotal:   added.length,
    removedTotal: removed.length,
    truncated:    added.length > MAX_DIFF_ITEMS || removed.length > MAX_DIFF_ITEMS,
  }
}

// ── The judgement ────────────────────────────────────────────────────────────

export const CLASSIFICATIONS = ['cosmetic', 'funding_change', 'page_gone', 'unclear'] as const
export type Classification = (typeof CLASSIFICATIONS)[number]

export type ClassificationResult = {
  classification: Classification
  /** The added or removed line the label turns on. Null only for `unclear`. */
  quote: string | null
}

/** Bump when the prompt changes, so a stale label is distinguishable from a fresh one. */
export const CLASSIFIER_VERSION = 'v1'

export const CLASSIFIER_PROMPT = `You are reading the difference between two snapshots of a UK grant funder's listing page. The snapshots are lists of headings and bold text pulled from the page, lowercased.

Decide what the change means for someone looking for funding.

  funding_change  a fund opened, closed, changed its deadline, changed its
                  amount, changed who can apply, or a new fund appeared
  page_gone       the page no longer shows its funding content at all: a
                  takedown, a login wall, a maintenance notice, or a redesign
                  that removed the listings
  cosmetic        anything else. News items, blog posts, job adverts, event
                  listings, staff changes, annual reports, cookie notices,
                  navigation, reordering, or a wording tweak that leaves the
                  offer the same
  unclear         the difference does not support any of the above

Most changes are cosmetic. Funder websites carry news feeds and job boards that
rotate constantly, and their funding offer changes a few times a year. Do not
reach for funding_change because a line mentions money or the word "grant" —
the page is a grants page, so most of it does. Reach for it only when the diff
shows the OFFER moving.

Answer with JSON and nothing else:

  {"classification": "...", "quote": "..."}

"quote" must be one line copied verbatim from the added or removed lines you
were shown — the single line the decision turns on. If no line supports a
decision, answer {"classification": "unclear", "quote": null}.`

/** The user turn: only the difference, never the two full pages. */
export function buildClassifierInput(funder: string, diff: FingerprintDiff): string {
  const list = (xs: string[], total: number) =>
    xs.length === 0
      ? '  (none)'
      : xs.map(x => `  - ${x}`).join('\n') +
        (total > xs.length ? `\n  ...and ${total - xs.length} more, not shown` : '')

  return [
    `Funder: ${funder}`,
    '',
    'Lines that appeared:',
    list(diff.added, diff.addedTotal),
    '',
    'Lines that disappeared:',
    list(diff.removed, diff.removedTotal),
  ].join('\n')
}

/**
 * Read the model's answer, refusing anything that is not a label with a line
 * behind it.
 *
 * An unrecognised label becomes `unclear` rather than being coerced to the
 * nearest match: a classifier that quietly rounds a bad answer to a good-looking
 * one is worse than one that admits it did not get an answer, and this output is
 * going to be hand-sampled precisely to find out how often it is wrong.
 */
export function parseClassification(raw: string): ClassificationResult {
  const unclear: ClassificationResult = { classification: 'unclear', quote: null }

  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return unclear

  let parsed: unknown
  try { parsed = JSON.parse(match[0]) } catch { return unclear }
  if (!parsed || typeof parsed !== 'object') return unclear

  const { classification, quote } = parsed as { classification?: unknown; quote?: unknown }
  if (typeof classification !== 'string') return unclear
  if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) return unclear

  const q = typeof quote === 'string' && quote.trim().length > 0 ? quote.trim() : null

  // NO QUOTE, NO VERDICT — the same rule the verification engine applies to a
  // field proposal. A label nobody can check is not a finding.
  if (classification !== 'unclear' && q === null) return unclear

  return { classification: classification as Classification, quote: q }
}
