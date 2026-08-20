/**
 * Has a hidden fund reopened, according to evidence we already hold?
 *
 * WHY THIS EXISTS. `check-coming-soon` can only fire on `next_open_date_parsed`
 * — a date somebody parsed in advance. 79 of the 94 rows in
 * `between_rounds_scheduled` have no such date, and 36 of them say only "Closed —
 * next round TBC", so for those the job can never fire at all.
 *
 * Meanwhile `verify-rows` re-reads every one of those rows every few weeks
 * (`select_verify_batch` takes any row that is not rejected or archived) and
 * writes what the page said into `field_evidence`. On 2026-08-20 that store
 * contained "This programme is currently open for applications, and will close on
 * Monday 21 September at 12 noon" — for a fund that had been hidden from users
 * since the day it was read. **We were buying the answer every few weeks and
 * throwing it away.**
 *
 * WHAT COUNTS AS REOPENED. One signal only: the funder's page states a closing
 * date that has not yet passed. A fund with a live closing date is open, or about
 * to be, and that is the same reasoning the rest of the catalogue runs on.
 *
 * WHAT DELIBERATELY DOES NOT COUNT:
 *
 *   `is_rolling.agrees === true`. This is the trap that would have made the
 *   detector wrong on its first run. `agrees` means "the page matched what WE
 *   stored", not "the page says rolling" — so a row storing is_rolling=false
 *   whose page also says not-rolling scores `agrees: true`. Forever Manchester's
 *   Bright Futures Fund carries exactly that, with the quote "The latest round
 *   ... is NOW CLOSED to applications." Reading agreement as openness would have
 *   reopened a closed fund.
 *
 *   Scanning quotes for "now open". Brittle, and it misreads whose page it is:
 *   the Lloyds Bank Foundation Racial Equity row says "Applications are now open"
 *   on actiontogether.org.uk, a third party writing about someone else's fund.
 *
 * The action on detection is a REVIEW, never a publication. See the route.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * How fresh a read has to be before its day-and-month is trusted without a year.
 * 90 days matches the gate's freshness horizon.
 */
const RECENT_READ_DAYS = 90

export type ReopeningRow = {
  id: string
  title?: string | null
  deadline?: string | null
  field_evidence?: Record<string, unknown> | null
}

export type Reopening = {
  /** The closing date the page states, ISO. */
  closesOn: string
  /** Written for the cron report and the review card, in plain words. */
  reason: string
  /**
   * How firm the signal is.
   *
   * `stated`     — the page gave a full future date. Trust it.
   * `same_cycle` — the page gave a day and month whose year the extractor got
   *                wrong, and that day has not yet come round this year.
   */
  confidence: 'stated' | 'same_cycle'
}

function stamp(row: ReopeningRow, field: string): Record<string, unknown> | null {
  const ev = row.field_evidence
  if (!ev || typeof ev !== 'object') return null
  const s = (ev as Record<string, unknown>)[field]
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : null
}

function asFutureDate(v: unknown, todayISO: string): string | null {
  if (typeof v !== 'string' || !ISO_DATE.test(v)) return null
  return v > todayISO ? v : null
}

/**
 * Returns the reopening, or null.
 *
 * `todayISO` is passed in rather than read from the clock so the caller fixes one
 * day for a whole batch and the tests are not time-dependent.
 */
export function detectReopening(row: ReopeningRow, todayISO: string): Reopening | null {
  // The page says the fund is gone. Whatever else it holds, it has not reopened.
  const listed = stamp(row, 'still_listed')
  if (listed && listed.agrees === false) return null

  const dl = stamp(row, 'deadline')
  if (!dl) return null

  // 1. The page states a date we do not hold, and it is still ahead.
  const proposed = asFutureDate(dl.proposed, todayISO)
  if (proposed) {
    return {
      closesOn: proposed,
      reason: `the funder's page states a closing date of ${proposed}, which has not passed`,
      confidence: 'stated',
    }
  }

  // 2. The page confirms the future date we already hold. Requires an actual
  //    quote: `agrees: true` with nothing behind it is not evidence of anything,
  //    and the same rule governs proposals elsewhere in the engine.
  const stored = asFutureDate(row.deadline, todayISO)
  if (stored && dl.agrees === true && typeof dl.quote === 'string' && dl.quote.trim() !== '') {
    return {
      closesOn: stored,
      reason: `the funder's page confirms a closing date of ${stored}, which has not passed`,
      confidence: 'stated',
    }
  }

  // 3. THE YEAR THE EXTRACTOR GUESSED IS WRONG.
  //
  //    This rule exists because the first version of this detector MISSED THE
  //    ONE CASE THAT PROMPTED IT. Wiltshire & Swindon's Older People's Programme
  //    was read on 2026-08-16 and its quote is "This programme is currently open
  //    for applications, and will close on Monday 21 September at 12 noon" — no
  //    year on the page, and the extractor resolved it to 2025-09-21. A past
  //    date, so rules 1 and 2 both declined, on a fund that was open.
  //
  //    A bare day-and-month should roll FORWARD, not backward. Rather than trust
  //    the guessed year, this asks whether that day has come round yet this year.
  //
  //    Only on a RECENT read, because the whole inference is "the page said this
  //    lately, so the date it names is probably the next one". On a stamp six
  //    months old that reasoning does not hold.
  //
  //    Deliberately weaker, and labelled `same_cycle` so the report says so. The
  //    asymmetry justifies it: a false positive costs one review, and a false
  //    negative leaves a fund invisible while it is open.
  //    AND ONLY WHERE THE PAGE DID NOT STATE THE YEAR. This guard was added
  //    after the first version of rule 3 fired on Skipton Charitable Foundation,
  //    whose quote reads "Applications will close on Friday 31st October 2025 at
  //    5pm". The year IS on the page, the extractor read it correctly, and the
  //    date is genuinely in the past — rolling it into 2026 would have invented a
  //    round the funder never announced. If the quote contains the year, the
  //    extractor was not guessing and there is nothing to correct.
  const candidate = typeof dl.proposed === 'string' && ISO_DATE.test(dl.proposed)
    ? dl.proposed
    : (typeof row.deadline === 'string' && ISO_DATE.test(row.deadline) ? row.deadline : null)

  const quoteStatesTheYear = candidate !== null
    && typeof dl.quote === 'string'
    && dl.quote.includes(candidate.slice(0, 4))

  if (candidate && !quoteStatesTheYear && recentlyRead(row, todayISO) && typeof dl.quote === 'string' && dl.quote.trim() !== '') {
    const thisYear = `${todayISO.slice(0, 4)}${candidate.slice(4)}`
    if (thisYear > todayISO) {
      return {
        closesOn: thisYear,
        reason: `the page names a closing date of ${candidate.slice(8, 10)}/${candidate.slice(5, 7)} that has not come round yet this year, `
          + `and the year on the page was not stated`,
        confidence: 'same_cycle',
      }
    }
  }

  return null
}

/** Was the page read recently enough to trust a day-and-month without a year? */
function recentlyRead(row: ReopeningRow, todayISO: string): boolean {
  const read = stamp(row, '_page_read')
  const at = read?.checked_at
  if (typeof at !== 'string') return false
  const days = (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(at)) / 86_400_000
  return Number.isFinite(days) && days <= RECENT_READ_DAYS
}
