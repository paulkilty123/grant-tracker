/**
 * When should this row be read again?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A NUMBER IN A SQL FUNCTION
 *
 * Migration 055 shipped a flat 14-day cooldown. It is the right shape for a row
 * we cannot resolve and the wrong shape for almost everything else, and Paul
 * named the reason exactly:
 *
 *   "A flat 14 days is wrong for funders that are genuinely open year-round. Key
 *    the cadence off what the page said, not when we last looked."
 *
 * A clock asks "how long since I looked". That question has no relationship to
 * whether anything has changed. The page itself already told us when it is worth
 * looking again — a fund that says it accepts applications at any time is making
 * a durable claim, and a fund with a closing date on 12 August is worth reading
 * on 13 August and worth nothing on 14 June.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE SHAPES, IN PRECEDENCE ORDER
 *
 *   dated        the row holds real dates → check around them, never on a clock
 *   always_open  the page states year-round, and we have the quote → twice a year
 *   silent       we read the page and still cannot tell → back off, and say so
 *
 * `dated` outranks `always_open` and that is the whole of the escape hatch. A
 * fund that stops being open year-round almost always acquires a date, and the
 * moment it does this function stops returning `always_open` for it — it does
 * not serve out the remaining 180 days. Migration 056 closes the other half by
 * clearing `verify_due_at` whenever a timing column changes, so a date arriving
 * from ANY write path (crawl, admin, enrichment, raw SQL) makes the row due at
 * once rather than at its next scheduled read. Both halves are tested.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A DUE DATE IS A CHECKPOINT, NOT AN INTERVAL
 *
 * The design describes shape B as windows: [D−10, D−1] before an opening and
 * [D+1, D+10] after a closing. The queue cannot hold an interval — it holds one
 * timestamp per row — so a window is stored as its LEADING EDGE and the trailing
 * edge is expressed by the next checkpoint arriving. That is not a
 * simplification, it is the reason the inside-the-window case works: a row read
 * on D−5 has already had its run-up read, so its next checkpoint is D+1, not the
 * D−10 it is currently sitting inside.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SHAPE C IS A TO-DO LIST, NOT A RESTING STATE
 *
 * 401 rows are read-and-still-unknown. Backing off is the right response to a
 * page that will not answer, and it must not be mistaken for the question being
 * settled. The count is reported on the admin Pipeline line beside
 * `live_unbacked` for exactly that reason — set as a condition by Paul, so a
 * deferred gap never reads as a closed one.
 */

import {
  isOpeningEntry, isDeadlineCandidate, type CycleEntry,
} from '@/lib/deadline-cycle'
import { isConfirmed, readStamp, PAGE_READ_KEY, type FieldEvidence } from '@/lib/field-evidence'

// ── The dials ────────────────────────────────────────────────────────────────

/** How far ahead of a stated opening date we start asking "is it going to open". */
export const OPEN_LEAD_DAYS = 10

/** Nothing waits longer than this, whatever its shape says. A row whose dates
 *  have all rolled past the horizon still gets looked at twice a year. */
export const LONG_STOP_DAYS = 180

/** Shape A. Paul's "a couple of times a year". The design doc's §10 proposed
 *  120; the failure mode is mild because a fund that stops being rolling
 *  acquires a date, and a date moves the row to shape B, which is far more
 *  frequent. */
export const ALWAYS_OPEN_DAYS = 180

/**
 * Shape C. Each consecutive silence doubles the gap, to a cap.
 *
 * A permanently silent row costs 5 reads in its first year and 2 a year after,
 * against 26 a year under the flat cooldown. Across the 401 rows in this shape
 * that is 10,452 reads a year replaced by roughly 2,000 then 800.
 */
export const SILENT_BACKOFF_DAYS = [14, 28, 56, 112, 180] as const

const DAY_MS = 86_400_000

// ── Types ────────────────────────────────────────────────────────────────────

export type CadenceShape = 'dated' | 'always_open' | 'silent'

export type CadenceInput = {
  deadline:       string | null
  next_open_date: string | null
  deadline_cycle: CycleEntry[] | null
  /**
   * The row's evidence INCLUDING this run's stamps. The shape is decided by what
   * the page just said, so passing pre-run evidence would key the cadence off
   * the previous read — the exact mistake this replaces.
   */
  evidence:       FieldEvidence | null
}

export type CadenceDecision = {
  shape:  CadenceShape
  dueAt:  Date
  /** Whole days from the read to the next read. Reported, never stored. */
  days:   number
  /** One line, stored on the `_page_read` stamp so a due date can be explained
   *  months later without re-deriving it. */
  reason: string
  /** Consecutive silent reads including this one. Zero when the page answered. */
  silentStreak: number
}

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Midnight UTC for an ISO `YYYY-MM-DD`, or null for anything unparseable. */
function parseDay(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string' || iso.length < 10) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

/**
 * A day/month pair resolved into a given year, or null if that pair does not
 * exist in it.
 *
 * The null is load-bearing: `Date.UTC(2026, 1, 31)` silently becomes 3 March, so
 * a cycle claiming 31 February would otherwise schedule a check against a date
 * the funder never named. `nextCycleDeadline` guards the same way and for the
 * same reason.
 */
function resolveCycleDate(entry: CycleEntry, year: number): Date | null {
  const { day, month } = entry
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCMonth() === month - 1 ? d : null
}

/**
 * Checkpoints a single date generates.
 *
 *   opening  D − OPEN_LEAD_DAYS   is it going to open?
 *            D + 1                did it open, and what did it say?
 *   closing  D + 1                did it close, and is there a next date?
 *
 * Paul's rule was "before opening and after closing". The `D + 1` on an opening
 * is the second half of the same sentence: a reopen is the most positive event
 * in a grant's life and we currently discover it by accident, so it is worth one
 * read on the day it was supposed to happen as well as one in the run-up.
 */
function checkpointsFor(date: Date, kind: 'opening' | 'closing'): Date[] {
  return kind === 'opening'
    ? [addDays(date, -OPEN_LEAD_DAYS), addDays(date, 1)]
    : [addDays(date, 1)]
}

// ── The decision ─────────────────────────────────────────────────────────────

/**
 * Every checkpoint strictly after `after` implied by the dates on this row.
 *
 * Absolute dates (`deadline`, `next_open_date`) are one-off: once their
 * checkpoints have passed they generate nothing, which is why a row holding only
 * expired dates falls through to shape A or C rather than resting on the dated
 * long stop. That is deliberate. A live row advertising a deadline that has gone
 * is not a settled row, and giving it a 180-day nap would be the flat cooldown's
 * mistake wearing better clothes.
 *
 * Cycle entries carry day and month with no year, so they roll forward and
 * always produce a future checkpoint.
 */
export function futureCheckpoints(input: CadenceInput, after: Date): Date[] {
  const out: Date[] = []
  const push = (d: Date | null, kind: 'opening' | 'closing') => {
    if (!d) return
    for (const c of checkpointsFor(d, kind)) if (c.getTime() > after.getTime()) out.push(c)
  }

  push(parseDay(input.deadline), 'closing')
  push(parseDay(input.next_open_date), 'opening')

  const cycle = Array.isArray(input.deadline_cycle) ? input.deadline_cycle : []
  const year  = after.getUTCFullYear()
  for (const entry of cycle) {
    // Openings and closings both schedule reads. A post-decision entry
    // ("Outcomes Communicated") is neither — nothing about the funding offer
    // changes on the day results go out, so it is not worth a fetch. Both tests
    // come from deadline-cycle.ts rather than being restated here; two copies of
    // this classification drifted into the same live bug once already.
    const opening = isOpeningEntry(entry)
    if (!opening && !isDeadlineCandidate(entry)) continue
    for (const y of [year, year + 1]) {
      push(resolveCycleDate(entry, y), opening ? 'opening' : 'closing')
    }
  }

  return out.sort((a, b) => a.getTime() - b.getTime())
}

/** Did this read produce an actual timing verdict, either way? */
function timingAnswered(evidence: FieldEvidence | null, asOf: Date): boolean {
  for (const field of ['deadline', 'is_rolling'] as const) {
    const stamp = readStamp(evidence, field)
    if (!stamp) continue
    if (stamp.agrees === null) continue
    if (typeof stamp.quote === 'string' && stamp.quote.trim().length > 0) return true
  }
  // A cycle the page stated in full is an answer about timing even though the
  // fields above are silent — it is the strongest timing answer there is.
  return isConfirmed(evidence, 'deadline_cycle', { asOf })
}

/**
 * The `silent_streak` carried on the previous `_page_read` stamp, or 0.
 *
 * Takes `unknown` because its caller reads a jsonb column straight off the row
 * and every field inside it is validated here anyway. A cast at the call site
 * would move the lie rather than remove it.
 */
export function previousSilentStreak(evidence: unknown): number {
  const raw = evidence && typeof evidence === 'object'
    ? (evidence as Record<string, unknown>)[PAGE_READ_KEY]
    : null
  if (!raw || typeof raw !== 'object') return 0
  const n = (raw as { silent_streak?: unknown }).silent_streak
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/**
 * When to read this row again, and why.
 *
 * `checkedAt` is a parameter rather than a call to the clock so a single run
 * cannot straddle midnight and give two rows different answers, and so the tests
 * are not time-dependent.
 */
export function computeCadence(
  input: CadenceInput,
  opts: { checkedAt: Date; previousStreak?: number },
): CadenceDecision {
  const { checkedAt } = opts
  const longStop = addDays(checkedAt, LONG_STOP_DAYS)
  const days = (d: Date) => Math.max(0, Math.round((d.getTime() - checkedAt.getTime()) / DAY_MS))

  // ── B. Dated ───────────────────────────────────────────────────────────────
  const checkpoints = futureCheckpoints(input, checkedAt)
  if (checkpoints.length > 0) {
    const next  = checkpoints[0]
    const dueAt = next.getTime() < longStop.getTime() ? next : longStop
    const capped = dueAt === longStop
    return {
      shape: 'dated',
      dueAt,
      days: days(dueAt),
      reason: capped
        ? `dated: next checkpoint ${next.toISOString().slice(0, 10)} is past the ${LONG_STOP_DAYS}-day horizon, so the long stop applies`
        : `dated: next checkpoint ${next.toISOString().slice(0, 10)}`,
      silentStreak: 0,
    }
  }

  // ── A. Evidenced always-open ───────────────────────────────────────────────
  //
  // Reached only when the row has NO future checkpoint, which is what makes the
  // escape hatch structural rather than a rule someone has to remember: a row
  // holding any live date never gets here at all.
  if (isConfirmed(input.evidence, 'is_rolling', { asOf: checkedAt })) {
    const dueAt = addDays(checkedAt, ALWAYS_OPEN_DAYS)
    return {
      shape: 'always_open',
      dueAt,
      days: ALWAYS_OPEN_DAYS,
      reason: `always open: the page states year-round and we hold the quote, so ${ALWAYS_OPEN_DAYS} days`,
      silentStreak: 0,
    }
  }

  // ── C. Silent ──────────────────────────────────────────────────────────────
  const answered = timingAnswered(input.evidence, checkedAt)
  const streak   = answered ? 0 : Math.max(0, opts.previousStreak ?? 0) + 1
  const idx      = Math.max(0, Math.min(streak - 1, SILENT_BACKOFF_DAYS.length - 1))
  const delay    = SILENT_BACKOFF_DAYS[idx]
  const dueAt    = addDays(checkedAt, delay)
  return {
    shape: 'silent',
    dueAt,
    days: delay,
    reason: answered
      ? `answered but undated: ${delay} days`
      : `silent ${streak}${streak === 1 ? 'st' : streak === 2 ? 'nd' : streak === 3 ? 'rd' : 'th'} time: ${delay} days`,
    silentStreak: streak,
  }
}
