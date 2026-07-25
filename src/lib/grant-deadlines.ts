// Deadline-shape detection helpers. Pure, no DB access.
//
// The multi-round pattern lived in src/lib/cf-fund-verify.ts, so the check that
// catches "this text implies several rounds but we only captured one date" ran
// for community-foundation funds and nothing else. Everywhere else a multi-round
// fund captured a single date, that date passed, and the grant went stale —
// expire-grants cannot roll a deadline forward without a cycle to roll to.
//
// "Deadlines are not captured properly, especially multi-round ones" is the third
// of the three error classes Paul reports hitting most in Needs Review. Moved
// here 2026-07-25 so every source gets the same check.

/**
 * Phrasings that imply a recurring or multi-round application cycle.
 *
 * Not proof of multiple rounds — just enough signal to defer to a human rather
 * than publish a single date that is likely to go stale the moment that round
 * closes. Kept deliberately narrow: explicit round numbering, an explicit
 * per-year count, or an explicit "multi-round" / "several rounds" phrase.
 */
export const MULTI_ROUND_PATTERN = /\bround\s*(one|two|three|four|1|2|3|4|i|ii|iii|iv)\b|\b(twice|two|three|four)\s+(?:(?:times|rounds?|deadlines?|windows?|calls?|intakes?)\s+)?(a|per)\s*year\b|\bmulti-?round\b|\bseveral\s+rounds?\b/i
// The optional noun group was widened 2026-07-25. The inherited pattern allowed
// only "times" between the number and "a year", so "we run two ROUNDS a year"
// did not match — a straightforwardly multi-round phrasing. This also fixes the
// same miss in the CF pipeline, which shares this constant. Widening only ever
// causes MORE rows to be held for review rather than auto-published, which is
// the safe direction.

/**
 * Additional cycle phrasings worth flagging that the pattern above misses.
 * Separated so the CF pipeline's long-standing behaviour is unchanged — it keeps
 * using MULTI_ROUND_PATTERN alone — while the general check below can be a
 * little broader, since it only ever raises a flag and never writes a value.
 */
const RECURRING_CYCLE_HINTS = /\b(?:quarterly|termly|biannual(?:ly)?|bi-annual(?:ly)?|each\s+(?:quarter|term)|every\s+(?:quarter|three\s+months|six\s+months|four\s+months)|(?:board|panel|trustees?)\s+meet(?:s|ings?)?\b|deadlines?\s+(?:are|fall|in)\b|closing\s+dates?\s+(?:are|fall)\b|application\s+windows?\b|rounds?\s+(?:open|close)\b)/i

export type MultiRoundCheck = {
  /** True when the text implies a cycle but no structured cycle was captured. */
  suspected: boolean
  /** The phrase that triggered it, for the flag detail. */
  matched: string | null
}

/**
 * Detect an uncaptured recurring cycle.
 *
 * Fires only when ALL of these hold:
 *   - the grant is not rolling (a rolling grant has no round to miss)
 *   - a single deadline IS set (nothing to go stale otherwise, and a row with no
 *     deadline is already caught by the separate deadline_missing check)
 *   - deadline_cycle is empty (nothing structured to roll forward to)
 *   - the source text implies a cycle
 *
 * That combination is precisely the silent-rot case: one date, no cycle, and
 * wording that says there will be another round.
 */
export function detectUncapturedMultiRound(input: {
  isRolling:     boolean | null | undefined
  deadline:      string | null | undefined
  deadlineCycle: unknown[] | null | undefined
  /** Deadline citation snippet, brief.decision_timeline, description, etc. */
  sourceTexts:   Array<string | null | undefined>
}): MultiRoundCheck {
  const { isRolling, deadline, deadlineCycle, sourceTexts } = input

  if (isRolling) return { suspected: false, matched: null }
  if (!deadline) return { suspected: false, matched: null }
  if ((deadlineCycle?.length ?? 0) > 0) return { suspected: false, matched: null }

  for (const raw of sourceTexts) {
    if (!raw) continue
    const m = raw.match(MULTI_ROUND_PATTERN) ?? raw.match(RECURRING_CYCLE_HINTS)
    if (m) return { suspected: true, matched: m[0] }
  }
  return { suspected: false, matched: null }
}

// ── Deriving a usable deadline from a captured cycle ─────────────────────────
/**
 * A single entry in `scraped_grants.deadline_cycle`.
 *
 * `day` is genuinely optional: enrichment records "May application round" with a
 * month and no day, which names a window rather than a date and cannot become
 * one without inventing precision the funder never gave.
 */
export type CycleEntry = { month?: number | null; day?: number | null; label?: string | null }

/**
 * Labels naming when a round OPENS rather than when it closes.
 *
 * This distinction is the whole point of the function. Gannochy Trust was
 * recorded with a deadline of 3 August 2026 — which is the date its portal
 * OPENS; the actual deadline is 2 October. Treating an open date as a deadline
 * tells an applicant they have weeks less than they do, and tells the expiry
 * cron to retire a fund that is only just accepting applications.
 */
const OPENS_RE = /\bopens?\b|\bopening\b|\bapplications?\s+open\b|\bwindow\s+opens?\b|\blaunch(es)?\b|\bbegins?\b|\bstarts?\b|\bcommences?\b|\bcycle\s+begins?\b|\bfrom\b/i
// "begins" and "starts" were added 2026-07-26 after a dry run caught the exact
// error this constant exists to prevent, one synonym short. Suffolk Giving Fund
// records {day:1, month:6, label:"Suffolk Giving Fund cycle begins (4 decisions
// per year)"} — a START date for a genuinely rolling programme. Without the
// widened pattern the run would have written 1 June as a DEADLINE and cleared a
// correct is_rolling flag, turning an always-open fund into one that appears to
// close on a date it does not.

/** Deadline-ish labels. Anything not matching OPENS_RE is treated as a close. */
export type DerivedCycleDates = {
  /** Next future closing date, ISO yyyy-mm-dd, or null when none is derivable. */
  deadline: string | null
  /** Next future opening date, ISO yyyy-mm-dd, or null. */
  nextOpenDate: string | null
  /** Entries that name a month but no day, so no date could be derived. */
  ambiguous: number
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Is this a real calendar date? Rejects 31 February and similar. */
function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/**
 * Turn a recorded cycle into the next actual dates.
 *
 * WHY THIS EXISTS
 * Enrichment already extracts the cycle correctly — Aviva's Financial Futures
 * Fund records both "Round One, 15 April" and "Round Two, 7 October" — and then
 * nothing reads it. 55 of 720 active rows hold a cycle while `deadline` stays
 * null, and 29 of those are additionally flagged `is_rolling`, so a fund with
 * two fixed rounds a year is presented to users as always open. The information
 * needed to fix every one of them is already sitting in the row.
 *
 * `today` is injected rather than read from the clock so the behaviour is
 * testable and a run is reproducible.
 */
export function deriveCycleDates(cycle: unknown, today: Date): DerivedCycleDates {
  const out: DerivedCycleDates = { deadline: null, nextOpenDate: null, ambiguous: 0 }
  if (!Array.isArray(cycle) || cycle.length === 0) return out

  const y = today.getUTCFullYear()
  const todayIso = iso(y, today.getUTCMonth() + 1, today.getUTCDate())
  const closes: string[] = []
  const opens: string[] = []

  for (const raw of cycle) {
    const e = (raw ?? {}) as CycleEntry
    const month = typeof e.month === 'number' ? e.month : null
    const day   = typeof e.day === 'number' ? e.day : null
    if (month === null) continue
    if (day === null) { out.ambiguous++; continue }

    // Roll to next year when this year's occurrence has already passed. A cycle
    // is by definition recurring, so a passed round means the next one, not none.
    let year = y
    if (!valid(year, month, day)) continue
    if (iso(year, month, day) < todayIso) year = y + 1
    if (!valid(year, month, day)) continue

    ;(OPENS_RE.test(e.label ?? '') ? opens : closes).push(iso(year, month, day))
  }

  closes.sort(); opens.sort()
  out.deadline     = closes[0] ?? null
  out.nextOpenDate = opens[0] ?? null
  return out
}
