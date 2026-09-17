import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { DECLINE_REASONS, declineReasonLabel } from './outcomes'

describe('decline reasons', () => {
  it('every value in the list is accepted by the migration check constraint', () => {
    const sql = readFileSync('supabase/migrations/085_pipeline_outcomes.sql', 'utf8')
    for (const r of DECLINE_REASONS) expect(sql).toContain(`'${r.value}'`)
  })

  it('the migration accepts nothing the list does not know', () => {
    const sql = readFileSync('supabase/migrations/085_pipeline_outcomes.sql', 'utf8')
    const inList = sql.match(/in \(([\s\S]*?)\)/)?.[1] ?? ''
    const values = Array.from(inList.matchAll(/'([a-z_]+)'/g)).map(m => m[1])
    expect(values.sort()).toEqual(DECLINE_REASONS.map(r => r.value).slice().sort())
  })

  it('labels resolve, and unknown or missing values resolve to null', () => {
    expect(declineReasonLabel('oversubscribed')).toBe('Oversubscribed')
    expect(declineReasonLabel('made_up')).toBeNull()
    expect(declineReasonLabel(null)).toBeNull()
  })
})
