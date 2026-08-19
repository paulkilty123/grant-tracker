import { describe, it, expect } from 'vitest'
import { deriveReviewReasons, type ReviewRow } from './review-reasons'
import { AMOUNT_UNSUPPORTED_NOTE, type FieldEvidence } from '@/lib/field-evidence'
import { gateDecision } from './publish-gate'
import { sectionOf } from './review-sections'

/**
 * The amount check has to fire on silence, which is the one thing the rest of
 * the engine treats as harmless. These tests exist because the failure they
 * describe passed every check the catalogue had: on 2026-08-19 a random sample
 * of twelve live rows found three rows showing amounts their funder's page never
 * states, and all three had been read within three days and reported clean.
 */

const stamp = (note?: string) => ({
  by: 'verify:v1',
  agrees: null,
  quote: null,
  checked_at: '2026-08-19T10:00:00.000Z',
  source_url: 'https://example.org/funding',
  ...(note ? { note } : {}),
})

const row = (over: Partial<ReviewRow>): ReviewRow => ({
  id: 'r1',
  title: 'Test Fund',
  funder: 'Test Funder',
  is_active: true,
  eligible_structures: ['registered_charity'],
  impact_sectors: ['community'],
  is_rolling: true,
  apply_url: 'https://example.org/funding',
  field_evidence: { _page_read: stamp('verified') } as unknown as FieldEvidence,
  ...over,
})

const codes = (r: ReviewRow) => deriveReviewReasons(r, '2026-08-19').map(x => x.code)

describe('amount_unsupported', () => {
  it('fires when we show a figure and the page states none', () => {
    const r = row({
      amount_min: 1000,
      amount_max: 50000,
      field_evidence: {
        _page_read: stamp('verified'),
        amount_max: stamp(AMOUNT_UNSUPPORTED_NOTE),
      } as unknown as FieldEvidence,
    })
    expect(codes(r)).toContain('amount_unsupported')
  })

  it('quotes the figure the user is being shown', () => {
    const r = row({
      amount_max: 50000,
      field_evidence: {
        _page_read: stamp('verified'),
        amount_max: stamp(AMOUNT_UNSUPPORTED_NOTE),
      } as unknown as FieldEvidence,
    })
    const found = deriveReviewReasons(r, '2026-08-19').find(x => x.code === 'amount_unsupported')
    expect(found?.detail).toContain('£50,000')
  })

  // The distinction the whole code rests on. A row with no amount is incomplete
  // and honest; `no_amount` covers it and this must stay silent, or the queue
  // fills with rows where nothing is wrong.
  it('does NOT fire when the row shows no amount at all', () => {
    const r = row({ amount_min: null, amount_max: null })
    expect(codes(r)).toContain('no_amount')
    expect(codes(r)).not.toContain('amount_unsupported')
  })

  it('does NOT fire when the page confirmed the figure', () => {
    const r = row({
      amount_max: 3000,
      field_evidence: {
        _page_read: stamp('verified'),
        amount_max: { ...stamp(), agrees: true, quote: 'Grants of up to £3,000 are available.' },
      } as unknown as FieldEvidence,
    })
    expect(codes(r)).not.toContain('amount_unsupported')
  })

  // Silence with no note is the pre-existing state of every row the engine read
  // before this check existed. It must not retro-fire on all of them.
  it('does NOT fire on a plain unanswered stamp carrying no note', () => {
    const r = row({
      amount_max: 3000,
      field_evidence: {
        _page_read: stamp('verified'),
        amount_max: stamp(),
      } as unknown as FieldEvidence,
    })
    expect(codes(r)).not.toContain('amount_unsupported')
  })

  // The Ferguson case, and the reason the reader looks across both fields
  // instead of trusting one. A row is read over up to three pages: the login-
  // walled apply_url stated nothing and stamped amount_min "unsupported", then
  // the funder's guidance page one hop on confirmed "Requests up to £50,000 are
  // reviewed monthly". Reporting that figure as invented would have been wrong,
  // and it is precisely what the first version of this check did.
  it('does NOT fire when a later page in the same read confirmed the figure', () => {
    const r = row({
      amount_max: 50000,
      field_evidence: {
        _page_read: stamp('verified'),
        amount_min: stamp(AMOUNT_UNSUPPORTED_NOTE),
        amount_max: {
          ...stamp(),
          agrees: true,
          quote: 'Requests up to £50,000 are reviewed monthly.',
          source_url: 'https://fergusontrust.co.uk/charitable-organisation-application-guidance/',
        },
      } as unknown as FieldEvidence,
    })
    expect(codes(r)).not.toContain('amount_unsupported')
  })

  it('fires from amount_min alone, for a row that states only a minimum', () => {
    const r = row({
      amount_min: 5000,
      amount_max: null,
      field_evidence: {
        _page_read: stamp('verified'),
        amount_min: stamp(AMOUNT_UNSUPPORTED_NOTE),
      } as unknown as FieldEvidence,
    })
    expect(codes(r)).toContain('amount_unsupported')
  })

  it('is informational, so it files the row without changing what publishes', () => {
    const r = row({
      amount_max: 50000,
      field_evidence: {
        _page_read: stamp('verified'),
        amount_max: stamp(AMOUNT_UNSUPPORTED_NOTE),
      } as unknown as FieldEvidence,
    })
    const gate = gateDecision(r)
    expect(gate.blocking.map(b => b.code)).not.toContain('amount_unsupported')
    expect(gate.informational.map(b => b.code)).toContain('amount_unsupported')
  })

  it('lands under "needs your judgement" when it is the blocking reason', () => {
    expect(sectionOf(['amount_unsupported'], ['amount_unsupported'])).toBe('judgement')
  })
})
