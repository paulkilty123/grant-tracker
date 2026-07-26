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

/**
 * Canonical pipeline-stage colour source. Two ladders, both intentional (not
 * a duplication of each other): STAGE_CHIP is the saturated small-pill tone
 * used for badges/chips; STAGE_SURFACE_BG is the paler tone the same stages
 * use as a large-area background (Kanban columns, tile fills), where the
 * chip ladder would be too saturated to read text against comfortably.
 * Previously six call sites each hand-copied one of these two ladders
 * independently — consolidated here 2026-07-26; see
 * docs/shoots-token-migration-handoff-2026-07-26.md.
 */
export const STAGE_CHIP: Record<PipelineStage, { bg: string; text: string }> = {
  identified: { bg: '#F5F1E8' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */, text: '#5F5E5A' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */ },
  applying:   { bg: '#EAF3DE' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */, text: '#3B6D11' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */ },
  submitted:  { bg: '#C0DD97' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */, text: '#173404' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */ },
  won:        { bg: '#639922' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */, text: '#ffffff' },
  declined:   { bg: '#FAECE7' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */, text: '#993C1D' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */ },
}

export const STAGE_SURFACE_BG: Record<PipelineStage, string> = {
  identified: '#F5F1E8' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */,
  applying:   '#F1F7E4' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */,
  submitted:  '#DFEDCC' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */,
  won:        '#EAF3DE' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */,
  declined:   '#FAECE7' /* eslint-disable-line no-restricted-syntax -- pipeline-stage colour, consolidated source, not yet mapped to a semantic token (primitives pass) */,
}
