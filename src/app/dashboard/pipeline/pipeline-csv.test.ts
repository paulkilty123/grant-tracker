import { describe, it, expect } from 'vitest'
import { pipelineCsv } from './pipeline-csv'
import type { PipelineItem } from '@/types'

/**
 * Ruth Davey, 21 Sept 2026: a fundraiser keeps a pipeline in a spreadsheet.
 * Predictions before the run: one header row plus one row per item; a comma
 * or quote in a note is quoted and doubled; a null is an empty cell; the
 * stage is its label, not its id; the file opens with a BOM so Excel reads £.
 */
const item = (over: Partial<PipelineItem>): PipelineItem => ({
  id: 'p1', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-20T10:00:00Z', org_id: 'o', created_by: 'u',
  grant_name: 'Backstage Trust', funder_name: 'Backstage Trust', funder_type: 'trust_foundation',
  amount_requested: 25000, amount_min: 5000, amount_max: 50000, deadline: '2026-10-11', stage: 'applying',
  notes: null, application_progress: null, is_urgent: false, contact_name: null, contact_email: null,
  grant_url: 'https://example.org/apply', outcome_date: null, outcome_notes: null, starred: true,
  ...over,
} as unknown as PipelineItem)

describe('pipelineCsv', () => {
  it('writes a header and one row per item, stage as its label, BOM first', () => {
    const csv = pipelineCsv([item({}), item({ id: 'p2', stage: 'won', starred: false })])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('Fund,Funder,Stage,Deadline,Amount requested,Amount min,Amount max,Amount awarded,Outcome date,Outcome notes,Contact,Contact email,Starred,Notes,Funder link,Added,Updated')
    expect(lines[1]).toContain('Backstage Trust,Backstage Trust,Applying,2026-10-11,25000,5000,50000,,,,,,yes,,https://example.org/apply,2026-09-01,2026-09-20')
    expect(lines[2]).toContain(',Won,')
  })
  it('quotes a note with a comma, a quote or a line break', () => {
    const csv = pipelineCsv([item({ notes: 'Spoke to Jo, she said "maybe"\nfollow up' })])
    expect(csv).toContain('"Spoke to Jo, she said ""maybe""\nfollow up"')
  })
})
