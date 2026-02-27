import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInDays, parseISO, isValid, format } from 'date-fns'
import type { DeadlineAlert, PipelineItem, PipelineStage } from '@/types'

// ── Class merging ─────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Currency formatting ───────────────────────

export function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `£${(amount / 1_000_000).toFixed(1)}m`
  if (amount >= 1_000)     return `£${(amount / 1_000).toFixed(0)}k`
  return `£${amount.toLocaleString()}`
}

export function formatRange(min: number | null, max: number | null): string {
  if (!min && !max) return 'Amount TBC'
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
  if (days < 0)  return `Overdue (${format(date, 'd MMM yyyy')})`
  if (days === 0) return 'Today!'
  if (days === 1) return 'Tomorrow'
  if (days <= 14) return `${days} days (${format(date, 'd MMM')})`
  return format(date, 'd MMM yyyy')
}

export function getDeadlineAlerts(items: PipelineItem[]): DeadlineAlert[] {
  const activeStages: PipelineStage[] = ['identified', 'researching', 'applying', 'submitted']
  return items
    .filter(i => activeStages.includes(i.stage) && i.deadline)
    .map(i => {
      const daysUntil = getDaysUntil(i.deadline)
      return {
        item: i,
        daysUntil: daysUntil ?? 999,
        urgency: getDeadlineUrgency(daysUntil),
      }
    })
    .filter(a => a.urgency !== 'rolling')
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

// ── Pipeline stage config ─────────────────────

export const PIPELINE_STAGES = [
  { id: 'identified',  label: 'Identified',  emoji: '🔎', colour: 'blue' },
  { id: 'researching', label: 'Researching', emoji: '📖', colour: 'amber' },
  { id: 'applying',    label: 'Applying',    emoji: '✏️', colour: 'purple' },
  { id: 'submitted',   label: 'Submitted',   emoji: '📬', colour: 'sage' },
  { id: 'won',         label: 'Won',         emoji: '🏆', colour: 'forest' },
  { id: 'declined',    label: 'Declined',    emoji: '✗',  colour: 'red' },
] as const

export const STAGE_COLOURS: Record<PipelineStage, string> = {
  identified:  'border-blue-400 text-blue-600',
  researching: 'border-amber-400 text-amber-600',
  applying:    'border-purple-400 text-purple-600',
  submitted:   'border-sage text-sage',
  won:         'border-forest text-forest',
  declined:    'border-red-400 text-red-600',
}

export const STAGE_BG: Record<PipelineStage, string> = {
  identified:  'bg-blue-50',
  researching: 'bg-amber-50',
  applying:    'bg-purple-50',
  submitted:   'bg-green-50',
  won:         'bg-emerald-50',
  declined:    'bg-red-50',
}
