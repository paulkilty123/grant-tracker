// Two "incomplete" codes that kept rows in Needs reading when nothing a read
// could add was missing. Each test asserts the code FIRES first, then stops
// under the condition that makes it moot: a suppression test that only checks
// the after state passes just as loudly against a detector that never ran.

import { describe, it, expect } from 'vitest'
import { deriveReviewReasons, type ReviewRow } from './review-reasons'

const codes = (row: Partial<ReviewRow>) =>
  deriveReviewReasons(row as ReviewRow, '2026-09-11').map(r => r.code)

const base = (): Partial<ReviewRow> => ({
  id: 'x', is_active: false, funding_type: 'grant',
  title: 'Cruden Foundation Appeals', funder: 'Cruden Foundation',
  apply_url: 'https://crudenfoundation.org/how-to-apply/', url_status: 'ok',
  eligible_structures: ['registered_charity'], impact_sectors: ['community'],
  deadline: '2026-11-06',
  funder_brief: { source: 'live_fetch', who_can_apply: 'Registered charitable organisations based in, or specifically working in, Scotland.' },
  field_evidence: { _page_read: { note: 'verified', checked_at: '2026-09-11T20:00:00Z' } } as never,
})

describe('no_amount respects amount_undisclosed', () => {
  it('FIRES when the amount is missing and nobody has said the funder states none', () => {
    expect(codes({ ...base(), amount_max: null })).toContain('no_amount')
  })
  it('stops when the page states a floor with no ceiling', () => {
    expect(codes({ ...base(), amount_min: 10_000, amount_max: null })).not.toContain('no_amount')
  })
  it('stops when an admin has marked the amount undisclosed', () => {
    expect(codes({ ...base(), amount_max: null, amount_undisclosed: true })).not.toContain('no_amount')
  })
})

describe('beneficiaries_generic_only is about a default nobody checked, not a fund for everyone', () => {
  it('FIRES on general_public alone when the brief says nothing about who can apply', () => {
    expect(codes({ ...base(), target_beneficiaries: ['general_public'], funder_brief: { source: 'live_fetch' } })).toContain('beneficiaries_generic_only')
  })
  it('FIRES on general_public alone when the page has not been read', () => {
    expect(codes({ ...base(), target_beneficiaries: ['general_public'], field_evidence: null })).toContain('beneficiaries_generic_only')
  })
  it('FIRES when the last read failed its gate, even with a brief', () => {
    expect(codes({ ...base(), target_beneficiaries: ['general_public'],
      field_evidence: { _page_read: { note: 'fixable_link: wrong_fund', checked_at: '2026-09-11T20:00:00Z' } } as never })).toContain('beneficiaries_generic_only')
  })
  it('stops when the brief states who can apply and the page was read and passed', () => {
    expect(codes({ ...base(), target_beneficiaries: ['general_public'] })).not.toContain('beneficiaries_generic_only')
  })
})
