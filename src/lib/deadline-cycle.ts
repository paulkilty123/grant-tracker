// The next deadline implied by a recurring cycle.
//
// ── Why this is a shared module ──────────────────────────────────────────────
// This maths existed twice, byte-identical, in expire-grants and admin/sweep,
// with a comment in one saying "mirrors" the other. Both carried the same bug,
// and fixing it in one place would have left the other silently wrong — the
// admin sweep proposing one date and the nightly cron rolling to another.
//
// ── The bug ─────────────────────────────────────────────────────────────────
// `deadline_cycle` entries carry an optional `label`, and both copies ignored
// it. The function took the earliest future date across ALL entries, so a cycle
// describing a window rolled the deadline to the date the window OPENS.
//
// London LGBT+ Fund is the worked case:
//
//     { day: 17, month: 6, label: "Applications open"  }
//     { day: 12, month: 8, label: "Applications close" }
//
// From 13 August 2026 the earliest future date is 17 June 2027 — the opening.
// The row would have advertised "apply by 17 June 2027" when the real deadline
// is 12 August 2027, and the fund would not even be open on the date shown. A
// user planning against it loses the round.
//
// Measured 2026-08-13: 105 rows carry an opening-type entry, 29 live, and 21
// live with a deadline set — those roll wrong the moment their deadline passes,
// unattended, at 02:00.
//
// An opening date is not a deadline. If a cycle contains only opening dates, the
// honest answer is that we do not know the deadline, so this returns null and
// the caller falls through to its between-rounds handling. Advertising an
// opening date as a deadline is worse than admitting we cannot compute one.

export type CycleEntry = { day: number; month: number; label?: string }

/**
 * Labels that describe a window OPENING rather than closing.
 *
 * Deliberately matched on the label only, never on the date. Word-boundary
 * anchored so "closes" does not match "close" inside another word, and so a
 * neutral label like "Spring round" is left alone — an unlabelled or neutral
 * entry is still a deadline candidate, which preserves the old behaviour for
 * the 288 rows whose cycles carry no opening entry.
 *
 * `reopen` is included: it is an opening, and the `re-` prefix would otherwise
 * slip past a naive /open/ test only by accident.
 */
const OPENING_LABEL =
  /\b(opens?|opening|reopens?|reopening|launch(?:es|ed|ing)?|starts?|starting|registration|register)\b/i

/**
 * Labels for dates that are neither an opening nor a deadline: what the funder
 * does AFTER the window shuts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY, 2026-08-16. The opening-date fix filtered a denylist of one word family
 * and stopped there, because every cycle in the catalogue at the time carried at
 * most an opens/closes pair. The verification engine now extracts a page's WHOLE
 * schedule, and real schedules have a third kind of date. The London LGBT+ Fund
 * reads:
 *
 *   17 June  Fund Launches
 *   12 August  Application Window Closes
 *   30 November  Outcomes Communicated
 *
 * The opening filter removed 17 June and then chose 30 November, the day
 * decisions are announced, as the deadline. A fundraiser would have planned
 * against a date three and a half months after applications shut.
 *
 * This is the same defect as the one it is sitting beside, one class along, and
 * it is worth naming: a denylist answers "is it this bad thing", when the
 * question is "is it a deadline". `expire-grants` learned this already for the
 * prose parser and carries NON_APP_DATE_CUES for it; the structured path never
 * got the equivalent.
 */
const NON_DEADLINE_LABEL =
  /\b(outcome|outcomes|decision|decisions|announce(?:d|ment|ments)?|notif(?:y|ied|ication)|award(?:ed|s)?\s+(?:made|announced)|panel|board|trustees?\s+meet|shortlist(?:ed|ing)?|interview|result(?:s)?|paid|payment|report(?:s|ing)?\s+due|complet(?:e|ed|ion)|project\s+(?:starts?|ends?))\b/i

/** Is this entry a date the window opens, rather than a date it closes? */
export function isOpeningEntry(entry: CycleEntry): boolean {
  return typeof entry.label === 'string' && OPENING_LABEL.test(entry.label)
}

/** Is this entry something that happens after the window shuts? */
export function isPostDecisionEntry(entry: CycleEntry): boolean {
  return typeof entry.label === 'string' && NON_DEADLINE_LABEL.test(entry.label)
}

/** Could this entry be a closing date? Unlabelled and neutrally labelled
 *  entries stay in, which preserves the behaviour of the 288 bare {day, month}
 *  cycles that already mean "deadline". */
export function isDeadlineCandidate(entry: CycleEntry): boolean {
  return !isOpeningEntry(entry) && !isPostDecisionEntry(entry)
}

/**
 * The next future deadline implied by `cycle`, as ISO `YYYY-MM-DD`, or null.
 *
 * Null means "no deadline can be computed from this cycle" and callers must
 * treat it as unknown, not as "no deadline exists".
 *
 * `todayISO` is a parameter rather than a call to the clock so the behaviour is
 * testable and so a single run cannot straddle midnight and produce two
 * different answers for two rows.
 */
export function nextCycleDeadline(
  cycle: CycleEntry[] | null | undefined,
  todayISO: string,
): string | null {
  if (!cycle || cycle.length === 0) return null

  // Closing dates only. An entry with no label stays in: most cycles are bare
  // {day, month} pairs that already mean "deadline". Openings and
  // after-the-fact events are both excluded — see NON_DEADLINE_LABEL.
  const candidates = cycle.filter(isDeadlineCandidate)
  if (candidates.length === 0) return null

  const today       = new Date(`${todayISO}T00:00:00Z`)
  if (Number.isNaN(today.getTime())) return null
  const currentYear = today.getUTCFullYear()

  let earliest: Date | null = null
  for (const { day, month } of candidates) {
    if (!Number.isInteger(day) || day < 1 || day > 31) continue
    if (!Number.isInteger(month) || month < 1 || month > 12) continue
    let candidate = new Date(Date.UTC(currentYear, month - 1, day))
    // Guard against a rolled-over date: Date.UTC(2026, 1, 31) silently becomes
    // 3 March. A cycle claiming 31 February is data we cannot honour, and
    // quietly moving it is how a wrong date looks plausible.
    if (candidate.getUTCMonth() !== month - 1) continue
    if (candidate <= today) candidate = new Date(Date.UTC(currentYear + 1, month - 1, day))
    if (!earliest || candidate < earliest) earliest = candidate
  }
  return earliest ? earliest.toISOString().slice(0, 10) : null
}
