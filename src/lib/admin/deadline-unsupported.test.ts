import { describe, it, expect } from 'vitest'
import { deriveReviewReasons, type ReviewRow } from './review-reasons'
import { DEADLINE_UNSUPPORTED_NOTE, type FieldEvidence } from '@/lib/field-evidence'
import { gateDecision } from './publish-gate'

/**
 * The deadline twin of `amount_unsupported`, and the tests pin the ONE way they
 * differ: this one does not block. That is a measured difference, not a taste —
 * of the 71 live rows showing a date no page states, 16 carried Paul's own admin
 * value and 10 had been verified by a person.
 */

const stamp = (note?: string) => ({
  by: 'verify:v1', agrees: null, quote: null,
  checked_at: '2026-08-20T10:00:00.000Z', source_url: 'https://example.org/fund',
  ...(note ? { note } : {}),
})

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  id: 'r1', title: 'Test Fund', funder: 'Test Funder', is_active: true,
  eligible_structures: ['registered_charity'], impact_sectors: ['community'],
  apply_url: 'https://example.org/fund',
  field_evidence: { _page_read: stamp('verified') } as unknown as FieldEvidence,
  ...over,
})

const codes = (r: ReviewRow) => deriveReviewReasons(r, '2026-08-20').map(x => x.code)

describe('deadline_unsupported', () => {
  it('fires when we show a closing date and the page states none', () => {
    const r = row({
      deadline: '2026-11-30',
      field_evidence: { _page_read: stamp('verified'), deadline: stamp(DEADLINE_UNSUPPORTED_NOTE) } as unknown as FieldEvidence,
    })
    expect(codes(r)).toContain('deadline_unsupported')
  })

  it('names the date the user is being shown', () => {
    const r = row({
      deadline: '2026-11-30',
      field_evidence: { _page_read: stamp('verified'), deadline: stamp(DEADLINE_UNSUPPORTED_NOTE) } as unknown as FieldEvidence,
    })
    expect(deriveReviewReasons(r, '2026-08-20').find(x => x.code === 'deadline_unsupported')?.detail).toContain('2026-11-30')
  })

  // Silence about a date we are not showing is just silence.
  it('does NOT fire on a row with no deadline', () => {
    const r = row({ deadline: null, is_rolling: true })
    expect(codes(r)).not.toContain('deadline_unsupported')
  })

  it('does NOT fire on a plain unanswered stamp carrying no note', () => {
    const r = row({
      deadline: '2026-11-30',
      field_evidence: { _page_read: stamp('verified'), deadline: stamp() } as unknown as FieldEvidence,
    })
    expect(codes(r)).not.toContain('deadline_unsupported')
  })

  // The measured difference from the amount twin, pinned so it cannot drift.
  it('is informational, because 26 of the 71 came from Paul or a human check', () => {
    const r = row({
      deadline: '2026-11-30',
      field_evidence: { _page_read: stamp('verified'), deadline: stamp(DEADLINE_UNSUPPORTED_NOTE) } as unknown as FieldEvidence,
    })
    const gate = gateDecision(r)
    expect(gate.blocking.map(b => b.code)).not.toContain('deadline_unsupported')
    expect(gate.informational.map(b => b.code)).toContain('deadline_unsupported')
  })
})
