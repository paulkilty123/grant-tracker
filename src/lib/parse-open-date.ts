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
 * Returns null if the string can't be parsed.
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

export function parseOpenDate(text: string | null | undefined): string | null {
  if (!text) return null
  const s = text.trim().toLowerCase()

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
