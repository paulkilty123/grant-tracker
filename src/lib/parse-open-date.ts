/**
 * Parses a human-readable "next open" date string into a YYYY-MM-DD date.
 * Returns the FIRST DAY of the period so the cron job triggers once that
 * month/quarter/season arrives.
 *
 * Supported formats:
 *   "July 2026"        → "2026-07-01"
 *   "March 2026"       → "2026-03-01"
 *   "Q1 2026"          → "2026-01-01"
 *   "Q2 2026"          → "2026-04-01"
 *   "Q3 2026"          → "2026-07-01"
 *   "Q4 2026"          → "2026-10-01"
 *   "Spring 2026"      → "2026-03-01"
 *   "Summer 2026"      → "2026-06-01"
 *   "Autumn 2026"      → "2026-09-01"
 *   "Fall 2026"        → "2026-09-01"
 *   "Winter 2026"      → "2026-12-01"
 *   "Early 2026"       → "2026-01-01"
 *   "Mid 2026"         → "2026-06-01"
 *   "Late 2026"        → "2026-09-01"
 *   "2026"             → "2026-01-01"
 *
 * Day-precision formats keep the day rather than rounding to the 1st:
 *   "2026-07-30"           → "2026-07-30"
 *   "5 August 2026"        → "2026-08-05"
 *   "16 July 2026 (round 2)" → "2026-07-16"
 *
 * Returns null if the string can't be parsed.
 *
 * The day-precision cases were added 2026-08-11. Before that, an exact date fell
 * through every branch to the bare-year fallback: "2026-07-30" parsed to
 * "2026-01-01", seven months early and silently wrong, because the string
 * contains no month NAME and the ISO digits were never looked at. A reopen
 * watcher reading that would fire more than half a year before the round opened.
 * Rounding down is the right default for a vague period ("Autumn 2026"), but an
 * exact date is not a period and must not be rounded.
 */

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const SEASONS: Record<string, number> = {
  spring: 3, summer: 6, autumn: 9, fall: 9, winter: 12,
}

const QUALIFIERS: Record<string, number> = {
  early: 1, mid: 6, late: 9,
}

// Is this a real calendar date? Guards against "2026-13-40" surviving the regex.
function validYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export function parseOpenDate(text: string | null | undefined): string | null {
  if (!text) return null
  const s = text.trim().toLowerCase()

  // ── Exact dates first ──────────────────────────────────────────────────────
  // These must be checked before the year/month/season branches below, which
  // deliberately round down to the start of a period. An exact date is not a
  // period, so rounding it loses real precision the source gave us.

  // ISO: "2026-07-30", and the same date embedded in longer text.
  const isoMatch = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number)
    if (validYMD(y, m, d)) return iso(y, m, d)
  }

  // "5 August 2026", "16 July 2026 (round 2)", "31st July 2026"
  const dmyMatch = s.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(20\d{2})\b/,
  )
  if (dmyMatch) {
    const day = Number(dmyMatch[1])
    const month = MONTHS[dmyMatch[2]]
    const year = Number(dmyMatch[3])
    if (month && validYMD(year, month, day)) return iso(year, month, day)
  }

  // "August 5 2026" / "August 5th, 2026"
  const mdyMatch = s.match(
    /\b([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/,
  )
  if (mdyMatch) {
    const month = MONTHS[mdyMatch[1]]
    const day = Number(mdyMatch[2])
    const year = Number(mdyMatch[3])
    if (month && validYMD(year, month, day)) return iso(year, month, day)
  }

  // ── Period formats: round down to the start of the period ──────────────────
  // Extract year (4-digit number)
  const yearMatch = s.match(/\b(20\d{2})\b/)
  if (!yearMatch) return null
  const year = parseInt(yearMatch[1], 10)

  // "Q1 2026" etc
  const qMatch = s.match(/\bq([1-4])\b/)
  if (qMatch) {
    const month = (parseInt(qMatch[1], 10) - 1) * 3 + 1
    return `${year}-${String(month).padStart(2, '0')}-01`
  }

  // Month name
  for (const [name, month] of Object.entries(MONTHS)) {
    if (s.includes(name)) {
      return `${year}-${String(month).padStart(2, '0')}-01`
    }
  }

  // Season
  for (const [name, month] of Object.entries(SEASONS)) {
    if (s.includes(name)) {
      return `${year}-${String(month).padStart(2, '0')}-01`
    }
  }

  // Qualifier: early/mid/late
  for (const [name, month] of Object.entries(QUALIFIERS)) {
    if (s.includes(name)) {
      return `${year}-${String(month).padStart(2, '0')}-01`
    }
  }

  // Just a year
  return `${year}-01-01`
}
