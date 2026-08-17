import { describe, it, expect } from 'vitest'
import {
  REJECT_REASONS, formatRejectReason, parseRejectReason, rejectReasonLabel,
} from './reject-reasons'

describe('reject reasons round-trip', () => {
  it('stores a bare code when there is no note', () => {
    expect(formatRejectReason('duplicate')).toBe('duplicate')
    expect(formatRejectReason('duplicate', '   ')).toBe('duplicate')
    expect(parseRejectReason('duplicate')).toEqual({ code: 'duplicate', note: null })
  })

  it('keeps the note beside the code', () => {
    const stored = formatRejectReason('out_of_scope', 'US only')
    expect(stored).toBe('out_of_scope: US only')
    expect(parseRejectReason(stored)).toEqual({ code: 'out_of_scope', note: 'US only' })
  })

  it('does not lose a note containing colons', () => {
    const note = 'see https://example.org/a: the second round'
    expect(parseRejectReason(formatRejectReason('non_funder', note)).note).toBe(note)
  })

  it('every code round-trips', () => {
    for (const r of REJECT_REASONS) {
      expect(parseRejectReason(formatRejectReason(r.code, 'x')).code, r.code).toBe(r.code)
    }
  })
})

describe('reasons written before the picker existed', () => {
  // Seven files wrote this column as free prose and nothing read it. Those rows
  // must not be forced into a bucket: an invented code is indistinguishable from
  // a real one the moment anybody counts them.
  it('reports no code and keeps the prose', () => {
    const legacy = 'not really a grant, more of a competition'
    expect(parseRejectReason(legacy)).toEqual({ code: null, note: legacy })
  })

  it('does not mistake prose with a colon for a code', () => {
    const legacy = 'closed: the funder told us so in June'
    expect(parseRejectReason(legacy)).toEqual({ code: null, note: legacy })
  })

  it('handles null and empty without throwing', () => {
    expect(parseRejectReason(null)).toEqual({ code: null, note: null })
    expect(parseRejectReason('')).toEqual({ code: null, note: null })
  })
})

describe('labels', () => {
  it('names a known code', () => {
    expect(rejectReasonLabel('duplicate')).toBe('Duplicate')
  })
  it('falls back to the raw code rather than blank', () => {
    expect(rejectReasonLabel('quarantine')).toBe('quarantine')
    expect(rejectReasonLabel(null)).toBeNull()
  })
})
