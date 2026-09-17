import { describe, it, expect } from 'vitest'
import { deriveReviewReasons, type ReviewRow } from './review-reasons'
import { gateDecision } from './publish-gate'
import { sectionOf } from './review-sections'

// Paul, 2026-09-02: a page confirming "invitation only" is a confirmed
// no-route and must block. The row must SAY invitation only and the page must
// confirm it in its own words; agrees:true on a row that says open is the page
// confirming it is open.

const stamp = (over: Record<string, unknown>) => ({
  quote: null, source_url: 'https://funder.example/fund', checked_at: '2026-09-01T00:00:00Z',
  by: 'verify:v2', agrees: null, ...over,
})
const base = (over: Partial<ReviewRow>): ReviewRow => ({
  id: 'r1', title: 'Fund', funder: 'Funder', is_active: false, url_status: 'ok',
  funder_brief: { source: 'ai_enrich', last_enriched: '2026-08-20', who_can_apply: 'charities' },
  field_evidence: { _page_read: stamp({ note: 'verified' }) },
  ...over,
})
const codes = (r: ReviewRow) => deriveReviewReasons(r, '2026-09-02').map(x => x.code)

describe('page_says_invite_only', () => {
  it('fires when the row says invitation only and the page confirms it (Baring, Ufi)', () => {
    const r = base({
      is_invite_only: true,
      field_evidence: {
        _page_read: stamp({ note: 'verified' }),
        is_invite_only: stamp({ agrees: true, quote: 'applications to the International Development Programme are always by invitation only.' }),
      },
    })
    expect(codes(r)).toContain('page_says_invite_only')
    expect(gateDecision(r).outcome).toBe('hold')
    expect(sectionOf(['page_says_invite_only'])).toBe('link')
  })

  it('does not fire when the page confirms the row is OPEN (Law Society Pro Bono Charter)', () => {
    const r = base({
      is_invite_only: false,
      field_evidence: {
        _page_read: stamp({ note: 'verified' }),
        is_invite_only: stamp({ agrees: true, quote: 'applications can be made using the form below.' }),
      },
    })
    expect(codes(r)).not.toContain('page_says_invite_only')
  })

  it('does not fire on an unconfirmed claim, or a confirmation with no quote', () => {
    expect(codes(base({ is_invite_only: true }))).not.toContain('page_says_invite_only')
    const r = base({ is_invite_only: true, field_evidence: { is_invite_only: stamp({ agrees: true, quote: '' }) } })
    expect(codes(r)).not.toContain('page_says_invite_only')
  })
})

describe('withhold: a live invitation-only row is a confirmation, not a defect (Paul, 2 Sep)', () => {
  const ev = {
    _page_read: stamp({ note: 'verified' }),
    is_invite_only: stamp({ agrees: true, quote: 'Grants are made by invitation only.' }),
  }
  it('holds a not-live row', () => {
    expect(gateDecision(base({ is_invite_only: true, field_evidence: ev })).outcome).toBe('hold')
  })
  it('does not make a live row attention', () => {
    const d = gateDecision(base({ is_invite_only: true, is_active: true, field_evidence: ev }))
    expect(d.outcome).toBe('publish')
    expect(d.informational.map(r => r.code)).toContain('page_says_invite_only')
  })
})

describe('deadline_implausible accepts a date the page states (A Sinclair Henderson)', () => {
  it('fires on a far date nothing supports', () => {
    expect(codes(base({ deadline: '2028-05-31' }))).toContain('deadline_implausible')
  })
  it('does not fire when the deadline stamp confirms it with a quote', () => {
    const r = base({ deadline: '2028-05-31', field_evidence: {
      _page_read: stamp({ note: 'verified' }),
      deadline: stamp({ agrees: true, quote: 'The next meeting will be in June 2028. Applications should be received by the previous month.' }),
    } })
    expect(codes(r)).not.toContain('deadline_implausible')
  })
  it('agrees without a quote does not clear it', () => {
    const r = base({ deadline: '2028-05-31', field_evidence: { deadline: stamp({ agrees: true, quote: '' }) } })
    expect(codes(r)).toContain('deadline_implausible')
  })
})
