import type { PipelineItem } from '@/types'
import { PIPELINE_STAGES } from '@/lib/utils'

/**
 * The pipeline as a spreadsheet (Ruth Davey, Unicorn Theatre, 21 Sept 2026:
 * "I would always have a pipeline internally"). One row per item, the
 * columns a fundraiser keeps, values quoted, a UTF-8 BOM so Excel reads the
 * pound signs. Built in the browser from what is already loaded; nothing
 * leaves the account.
 */
export function pipelineCsv(items: PipelineItem[]): string {
  const stageLabel = (id: string) => PIPELINE_STAGES.find(s => s.id === id)?.label ?? id
  const cols: Array<[string, (i: PipelineItem) => string | number | null | undefined]> = [
    ['Fund', i => i.grant_name],
    ['Funder', i => i.funder_name],
    ['Stage', i => stageLabel(i.stage)],
    ['Deadline', i => i.deadline],
    ['Amount requested', i => i.amount_requested],
    ['Amount min', i => i.amount_min],
    ['Amount max', i => i.amount_max],
    ['Amount awarded', i => (i as PipelineItem & { amount_awarded?: number | null }).amount_awarded],
    ['Outcome date', i => i.outcome_date],
    ['Outcome notes', i => i.outcome_notes],
    ['Contact', i => i.contact_name],
    ['Contact email', i => i.contact_email],
    ['Starred', i => i.starred ? 'yes' : ''],
    ['Notes', i => i.notes],
    ['Funder link', i => i.grant_url],
    ['Added', i => i.created_at?.slice(0, 10)],
    ['Updated', i => i.updated_at?.slice(0, 10)],
  ]
  const cell = (v: string | number | null | undefined) => {
    const t = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const lines = [cols.map(c => cell(c[0])).join(',')]
  for (const i of items) lines.push(cols.map(c => cell(c[1](i))).join(','))
  return '\uFEFF' + lines.join('\r\n')
}

