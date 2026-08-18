/**
 * Day / month / year boxes to a stored ISO date.
 *
 * WHY THREE BOXES AND NOT `<input type="date">`. A native date input renders in
 * the browser's locale, so the same control reads dd/mm/yyyy for one reviewer
 * and mm/dd/yyyy for another, and 05/08/2026 is a valid date under both. The
 * catalogue is entirely British and the funder pages being copied from are
 * written British, so the order is fixed here rather than left to the browser.
 * The deadlines page reached the same conclusion and replaced the native input
 * with its own picker.
 *
 * A TWO DIGIT YEAR IS REFUSED, NOT GUESSED. "26" could be 2026 or 1926, and the
 * expansion rule that looks obvious is how a date silently resolves to a wrong
 * year. The ledger already records the cost of that shape: a year-less date on a
 * funder's page resolving to a past year produces a false `round_closed`
 * verdict, which reads as a fund having shut. Refusing costs two keystrokes.
 */

export type DmyResult =
  | { ok: true;  iso: string }
  | { ok: false; error: string }

const RANGE_MIN = 2000
const RANGE_MAX = 2100

export function parseDmy(day: string, month: string, year: string): DmyResult {
  const d = day.trim(), m = month.trim(), y = year.trim()

  if (!d && !m && !y) return { ok: false, error: 'Enter a date first.' }
  if (!d || !m || !y)  return { ok: false, error: 'Fill in day, month and year.' }
  if (!/^\d{1,2}$/.test(d)) return { ok: false, error: 'Day must be one or two digits.' }
  if (!/^\d{1,2}$/.test(m)) return { ok: false, error: 'Month must be one or two digits.' }
  if (!/^\d{4}$/.test(y))   return { ok: false, error: 'Year must be all four digits, so 2026 rather than 26.' }

  const dn = Number(d), mn = Number(m), yn = Number(y)
  if (mn < 1 || mn > 12) return { ok: false, error: 'Month must be between 1 and 12.' }
  if (dn < 1)            return { ok: false, error: 'Day must be 1 or more.' }
  if (yn < RANGE_MIN || yn > RANGE_MAX) {
    return { ok: false, error: `Year must be between ${RANGE_MIN} and ${RANGE_MAX}.` }
  }

  // Round trip through UTC rather than checking a month-length table: it is the
  // same check for February in a leap year as for the 31st of April, and it
  // cannot drift out of step with one. Date rolls an overflow forward (31 April
  // becomes 1 May), so a component that comes back changed means the date the
  // reviewer typed does not exist.
  const dt = new Date(Date.UTC(yn, mn - 1, dn))
  if (dt.getUTCFullYear() !== yn || dt.getUTCMonth() !== mn - 1 || dt.getUTCDate() !== dn) {
    return { ok: false, error: `There is no ${dn}/${mn}/${yn} in the calendar.` }
  }

  return { ok: true, iso: `${y}-${String(mn).padStart(2, '0')}-${String(dn).padStart(2, '0')}` }
}

/** Stored ISO date back to the three boxes. Anything unparseable seeds blank. */
export function splitIso(iso: string | null): { day: string; month: string; year: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!m) return { day: '', month: '', year: '' }
  return { day: String(Number(m[3])), month: String(Number(m[2])), year: m[1] }
}
