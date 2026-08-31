/**
 * Wording helpers for the weekly digest.
 *
 * Plurals get a helper rather than string concatenation because the last email
 * that shipped read "We found 1 grant that match your profile" — subject-verb
 * disagreement in the first message a paying customer sees. Concatenation is
 * how that happens: the noun gets an `s` bolted on and the verb is forgotten.
 */

/** "1 grant" / "3 grants". Pass an explicit plural for irregulars. */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many ?? `${one}s`}`
}

/** "closes" / "close" — agrees with a count, for "Two things close". */
export function verb(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm
}

/**
 * "One thing closes" / "Two things close" / "Seven things close".
 * Words up to ten, numerals above — the house style for prose, while counts in
 * labels ("3 new matches") stay numeric.
 */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
export function spell(n: number): string {
  return n >= 0 && n <= 10 ? WORDS[n] : String(n)
}
export function spellCap(n: number): string {
  const w = spell(n)
  return w.charAt(0).toUpperCase() + w.slice(1)
}

/** Whole days from today to an ISO date. Negative once it has passed. */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const d = new Date(iso)
  const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((b - a) / 86_400_000)
}

/** "14 October" — no year, because everything in this email is within months. */
export function humanDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`
}

/** "Tuesday 1 September", for the header. */
export function humanDayDate(d: Date = new Date()): string {
  return `${d.toLocaleString('en-GB', { weekday: 'long', timeZone: 'UTC' })} ${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`
}

/**
 * The countdown tile's label. "6" + "days", "1" + "day", "0" + "today".
 * Kept together so the tile can never read "1 days".
 */
export function countdown(days: number): { n: string; unit: string } {
  if (days <= 0) return { n: '!', unit: 'today' }
  return { n: String(days), unit: days === 1 ? 'day' : 'days' }
}

/**
 * The amount line. Never beside a button, and never "Amount varies" as a
 * headline figure — it sits in the meta row (funder · amount · deadline) or it
 * is omitted entirely.
 *
 * Returns null rather than a placeholder when there is nothing to say, so the
 * caller drops the segment instead of printing a shrug.
 */
export function amountLabel(min: number | null, max: number | null, undisclosed?: boolean): string | null {
  if (undisclosed) return 'Amount not published'
  if (min && max) return min === max ? `£${min.toLocaleString()}` : `£${min.toLocaleString()}–£${max.toLocaleString()}`
  if (max) return `Up to £${max.toLocaleString()}`
  if (min) return `From £${min.toLocaleString()}`
  return null
}

/** Joins the meta row, dropping anything absent so no stranded separators. */
export function metaLine(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ')
}

/** Escapes text for inlining into the email HTML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
