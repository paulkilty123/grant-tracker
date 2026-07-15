// Deadline urgency — the single source for how "close" a deadline reads,
// wherever it's shown (v1.1 §3.2). Three consumers read this SAME function
// with the SAME date and clock: the research card's deadline chip, the
// funder profile header, and the model's own per-fund judgment input (as a
// band only, never the exact day count — see orchestrator/research.ts).
// Because all three compute from one place, they cannot disagree — the
// urgency-register regression ("urgent, nine days" on one surface, "meaningful
// lead time" on another) is structurally dead, not merely patched.
//
// Computed at RENDER TIME, never persisted/frozen. A composed note's card
// data carries the deadline; urgency is derived from it live, every render —
// the one field a reloaded note must recompute rather than replay, so a note
// composed weeks ago still shows CURRENT urgency (or "closed") on reload.

export type UrgencyBand =
  | 'critical' | 'urgent' | 'approaching' | 'comfortable' | 'distant'
  | 'rolling' | 'closed'

export interface Urgency {
  daysRemaining: number | null // null for rolling (no deadline)
  band: UrgencyBand
  chipLabel: string
}

// Days-remaining -> band. A product judgment, not a fixed law — Paul's to
// tune. This table is the one place to change it; nothing else needs
// touching. 9 days must land as 'urgent' — the case the regression this
// module fixes was named after.
//   max 3   critical     closing this week
//   max 14  urgent       closing soon, act now
//   max 30  approaching  weeks out, time to prepare
//   max 60  comfortable  months of lead time
//   max Inf distant      plan ahead, no pressure
const BAND_MAX_DAYS: Array<{ max: number; band: UrgencyBand }> = [
  { max: 3, band: 'critical' },
  { max: 14, band: 'urgent' },
  { max: 30, band: 'approaching' },
  { max: 60, band: 'comfortable' },
  { max: Infinity, band: 'distant' },
]

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function deadlineUrgency(deadline: string | null, now: Date): Urgency {
  if (!deadline) {
    return { daysRemaining: null, band: 'rolling', chipLabel: 'Rolling' }
  }
  const d = new Date(`${deadline}T00:00:00`)
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const daysRemaining = Math.round((d.getTime() - startOfNow.getTime()) / 86_400_000)

  if (daysRemaining < 0) {
    const daysAgo = Math.abs(daysRemaining)
    return { daysRemaining, band: 'closed', chipLabel: `Closed ${daysAgo} day${daysAgo === 1 ? '' : 's'} ago` }
  }
  const matched = BAND_MAX_DAYS.find(b => daysRemaining <= b.max) ?? BAND_MAX_DAYS[BAND_MAX_DAYS.length - 1]
  const dayLabel = daysRemaining === 0 ? 'today' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`
  return { daysRemaining, band: matched.band, chipLabel: `Closes ${formatDate(d)} · ${dayLabel}` }
}
