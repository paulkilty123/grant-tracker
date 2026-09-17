// Two claims the queue was making that it could not support.
//
// Both tests assert the reason FIRES first and then stops. A suppression test
// that only checks the "after" state passes just as loudly against a detector
// that never ran at all — the same trap as an alarm that has only ever reported
// zero.

import { describe, it, expect } from 'vitest'
import { deriveReviewReasons, type ReviewRow } from './review-reasons'

const codes = (row: Partial<ReviewRow>) =>
  deriveReviewReasons(row as ReviewRow, '2026-09-01').map(r => r.code)

/** A row the engine stamped `wrong_fund` against, on a page it could not read. */
const walledRow = (readExhausted?: Record<string, unknown>): Partial<ReviewRow> => ({
  id: 'x', is_active: true, funding_type: 'grant',
  title: 'Museum Renewal Fund 2025-26', funder: 'Arts Council England',
  apply_url: 'https://www.artscouncil.org.uk/our-open-funds/museum-renewal-fund-2025-26',
  funder_brief: { source: 'ai_enrich', who_can_apply: 'Accredited museums in England.' },
  amount_max: 50_000,
  field_evidence: {
    _page_read: { note: 'fixable_link: wrong_fund', checked_at: '2026-08-17T00:00:00Z' },
    ...(readExhausted ? { _read_exhausted: readExhausted } : {}),
  } as never,
})

describe('page_describes_different_fund is not sayable about a page nobody read', () => {
  it('FIRES when the page was genuinely read', () => {
    expect(codes(walledRow())).toContain('page_describes_different_fund')
  })

  it('is withdrawn once the row is recorded as bot-walled', () => {
    const c = codes(walledRow({ reason: 'bot_wall', consecutive: 2 }))
    expect(c).not.toContain('page_describes_different_fund')
    // And the row does NOT go quiet. It is still unread, and read_exhausted is
    // what says so — filing it under "Nothing more we can do" rather than
    // dropping it out of the queue.
    expect(c).toContain('read_exhausted')
  })

  it('still fires when the link itself is the defect, not our reading of it', () => {
    // `mailto:` apply_url. Nobody read the page either, but that is a finding
    // about the row a reviewer can act on, so nothing is withdrawn.
    expect(codes(walledRow({ reason: 'not_a_web_url', consecutive: 2 })))
      .toContain('page_describes_different_fund')
  })
})

describe('an in-kind offer has no amount to be missing', () => {
  const inKind = (over: Partial<ReviewRow> = {}): Partial<ReviewRow> => ({
    id: 'y', is_active: false, funding_type: 'in_kind',
    title: 'LawWorks Not-for-Profits Programme', funder: 'LawWorks',
    apply_url: 'https://www.lawworks.org.uk/', url_status: 'ok',
    funder_brief: { source: 'ai_enrich', who_can_apply: 'Small not-for-profits.' },
    amount_min: null, amount_max: null, ...over,
  })

  it('FIRES on a grant row with no amount', () => {
    expect(codes({ ...inKind(), funding_type: 'grant' })).toContain('no_amount')
  })

  it('does not fire on the same row as an in-kind offer', () => {
    expect(codes(inKind())).not.toContain('no_amount')
  })

  it('suppresses the £0-to-£0 seed artefact too', () => {
    expect(codes({ ...inKind({ amount_min: 0, amount_max: 0 }), funding_type: 'grant' }))
      .toContain('amount_zero')
    expect(codes(inKind({ amount_min: 0, amount_max: 0 }))).not.toContain('amount_zero')
  })

  it('still reports a WRONG figure on an in-kind row', () => {
    // Suppressing an absence must not suppress an assertion. Inverted amounts
    // are self-evidently wrong whatever the funding type.
    expect(codes(inKind({ amount_min: 5_000, amount_max: 1_000 }))).toContain('amount_inverted')
  })
})
