/**
 * A closed fund is shown from one month before it reopens, not earlier.
 * Paul, 2026-09-07: "not too far away that someone just dismisses it".
 *
 * Two crons read this. check-coming-soon surfaces a parked row for review
 * when its reopening is within the lead; expire-grants keeps an expired row
 * visible only when its known reopening is within the lead, and parks it
 * otherwise.
 */
export const REOPENING_LEAD_DAYS = 30

/** ISO date `days` after `todayISO` (UTC, no time). */
export function leadCutoff(todayISO: string, days = REOPENING_LEAD_DAYS): string {
  const t = new Date(`${todayISO}T00:00:00Z`)
  if (Number.isNaN(t.getTime())) throw new Error(`bad date ${todayISO}`)
  return new Date(t.getTime() + days * 86400000).toISOString().slice(0, 10)
}

/** True when a reopening date is close enough to show the fund. */
export function reopensWithinLead(nextOpenISO: string | null | undefined, todayISO: string, days = REOPENING_LEAD_DAYS): boolean {
  if (!nextOpenISO) return false
  return nextOpenISO <= leadCutoff(todayISO, days)
}
