import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInDays, parseISO, isValid, format } from 'date-fns'
import type { DeadlineAlert, PipelineItem, PipelineStage } from '@/types'

// ── Class merging ─────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Text helpers ──────────────────────────────

/**
 * Trim a string to <= max chars without cutting mid-word.
 * Prefers to end on a sentence boundary; otherwise backs off to the last whole
 * word and appends an ellipsis. Used as the safety net when auto-filling a
 * mission from a website scan, so it never ends mid-word (e.g. "…for their vi").
 */
export function trimMission(text: string, max = 200): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  const slice = clean.slice(0, max)
  const lastSentence = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  )
  // Only snap to a sentence boundary if it keeps most of the allowed length.
  if (lastSentence >= max * 0.6) {
    return slice.slice(0, lastSentence + 1).trim()
  }
  const lastSpace = slice.lastIndexOf(' ')
  const base = (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).replace(/[\s.,;:–—-]+$/, '')
  return `${base}…`
}

// ── Currency formatting ───────────────────────

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}m`
  if (amount >= 1_000)     return `£${(amount / 1_000).toFixed(0)}k`
  return `£${amount.toLocaleString()}`
}

export function formatRange(min: number | null, max: number | null, undisclosed = false): string {
  // Affirmative non-disclosure (funder publishes no fixed amount) reads
  // differently from "we don't know yet" — say so honestly rather than
  // implying the figure appears on application.
  if (!min && !max) return undisclosed ? 'Amount not disclosed' : 'Amount on application'
  if (!min)  return `Up to ${formatCurrency(max!)}`
  if (!max)  return `From ${formatCurrency(min)}`
  if (min === max) return formatCurrency(min)
  return `${formatCurrency(min)} – ${formatCurrency(max)}`
}

// ── Deadline helpers ──────────────────────────

export function getDaysUntil(deadline: string | null): number | null {
  if (!deadline) return null
  const date = parseISO(deadline)
  if (!isValid(date)) return null
  return differenceInDays(date, new Date())
}

export function getDeadlineUrgency(
  daysUntil: number | null
): 'overdue' | 'urgent' | 'soon' | 'ok' | 'rolling' {
  if (daysUntil === null)  return 'rolling'
  if (daysUntil < 0)       return 'overdue'
  if (daysUntil <= 10)     return 'urgent'
  if (daysUntil <= 21)     return 'soon'
  return 'ok'
}

export function formatDeadline(deadline: string | null): string {
  if (!deadline) return 'Rolling'
  const date = parseISO(deadline)
  if (!isValid(date)) return deadline
  const days = differenceInDays(date, new Date())
  if (days < 0)  return `Overdue (${format(date, 'do MMMM yyyy')})`
  if (days === 0) return 'Today!'
  if (days === 1) return 'Tomorrow'
  if (days <= 14) return `${days} days (${format(date, 'do MMM')})`
  return format(date, 'do MMMM yyyy')
}

/**
 * Short card label for a fund that is shut but expected back.
 *
 * `next_open_date` is free text and ranges from "September 2026" to 313
 * characters of prose, so it cannot go on a card raw. Returns a compact label,
 * or null when there is nothing to say.
 *
 * WHY THIS EXISTS: a row with no deadline and is_rolling=false rendered NOTHING
 * in the card's deadline slot. Greater Manchester Mayor's Charity was published
 * as a watch-list row on 2026-07-29, scored 81% for a Manchester homelessness
 * charity, and sat at #2 looking entirely live — the reopening note only
 * appeared if you opened the detail view. A closed fund with a blank timing
 * field reads as an open one.
 *
 * THE PAST-DATE GUARD IS THE POINT. Several of these strings OPEN with a month
 * that has already gone: "April–May 2026 round closed (decisions by end of
 * July). Next round timing not yet announced". Taking the first date would
 * print "Opens Apr 2026" on a fund whose April round is over. So a date is only
 * used when it is genuinely in the future; otherwise the label falls back to
 * saying the fund is closed, which is the one thing we always know.
 */
export function formatNextOpen(nextOpenDate: string | null | undefined): string | null {
  const raw = (nextOpenDate ?? '').trim()
  if (!raw) return null

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december']
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // "1 September 2026" / "September 2026"
  const m = raw.match(new RegExp(`(?:(\\d{1,2})\\s+)?(${MONTHS.join('|')})\\s+(\\d{4})`, 'i'))
  if (m) {
    const day   = m[1] ? parseInt(m[1], 10) : 1
    const month = MONTHS.indexOf(m[2].toLowerCase())
    const year  = parseInt(m[3], 10)
    const when  = new Date(year, month, day)
    // Only trust it if it has not already passed — see the guard note above.
    if (when.getTime() > Date.now()) {
      return m[1] ? `Opens ${day} ${SHORT[month]} ${year}` : `Opens ${SHORT[month]} ${year}`
    }
  }

  // "Not before 2027", and bare future years.
  const notBefore = raw.match(/not before\s+(\d{4})/i)
  if (notBefore && parseInt(notBefore[1], 10) >= new Date().getFullYear()) {
    return `Opens ${notBefore[1]} at the earliest`
  }

  // Season without a year — "Late November / early December".
  const season = raw.match(/\b(?:late|early|mid)[- ](january|february|march|april|may|june|july|august|september|october|november|december)/i)
  if (season) {
    const idx = MONTHS.indexOf(season[1].toLowerCase())
    return `Opens around ${SHORT[idx]}`
  }

  // Nothing datable. Say the true thing rather than nothing.
  return 'Closed — check funder'
}

export function getDeadlineAlerts(items: PipelineItem[]): DeadlineAlert[] {
  const activeStages: PipelineStage[] = ['identified', 'applying', 'submitted']
  return items
    .filter(i => activeStages.includes(i.stage) && i.deadline)
    .map(i => {
      const daysUntil = getDaysUntil(i.deadline)
      let urgency = getDeadlineUrgency(daysUntil)
      // A submitted application's deadline is moot — you're already in, so never
      // flag it 'overdue' (Devi feedback 2026-06-24).
      if (i.stage === 'submitted' && urgency === 'overdue') urgency = 'ok'
      return {
        item: i,
        daysUntil: daysUntil ?? 999,
        urgency,
      }
    })
    .filter(a => a.urgency !== 'rolling')
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

// ── Pipeline stage config ─────────────────────

/**
 * Pipeline stages — April 2026 spec tonal ladder:
 * cream -> pale-green -> mid-pale-green -> saturated green -> coral.
 * Emotional gradient from neutral (identified) through progress
 * (applying/submitted) to success (won), with coral as the warm break
 * for declined. Coral is the only red-family colour the system allows.
 */
export const PIPELINE_STAGES = [
  { id: 'identified',  label: 'Identified',  emoji: '🔎', colour: 'cream'        },
  { id: 'applying',    label: 'Applying',    emoji: '✏️', colour: 'green-pale-2' },
  { id: 'submitted',   label: 'Submitted',   emoji: '📬', colour: 'green-pale-3' },
  { id: 'won',         label: 'Won',         emoji: '🏆', colour: 'green-mid'    },
  { id: 'declined',    label: 'Declined',    emoji: '✗',  colour: 'coral'        },
] as const

export const STAGE_COLOURS: Record<PipelineStage, string> = {
  identified: 'border-[rgba(0,0,0,0.10)] text-[#5F5E5A]',
  applying:   'border-green-mid text-green-text-deep',
  submitted:  'border-green-pale-3 text-green-deep',
  won:        'border-green-mid text-green-deep',
  declined:   'border-coral-mid text-coral-deep',
}

export const STAGE_BG: Record<PipelineStage, string> = {
  identified: 'bg-cream-1',
  applying:   'bg-green-pale-2',
  submitted:  'bg-green-pale-3',
  won:        'bg-green-mid',
  declined:   'bg-coral-pale',
}
