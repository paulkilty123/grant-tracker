import { describe, it, expect } from 'vitest'
import { deriveReviewReasons, type ReviewRow } from './review-reasons'
import { BLOCKING_CODES } from './publish-gate'

/**
 * The verification engine writes `no_longer_listed`, `not_a_grant` and
 * `round_closed` into `field_evidence._page_read.note`. Until 17 August nothing
 * that guarded publishing read them, so the review queue offered "Looks right,
 * publish it" on Theirworld Small Grants while the funder's page said
 * "Applications for the Small Grants Programme are now closed". 20 rows
 * carrying one of these verdicts were visible to users at the time.
 */

const TODAY = '2026-08-17'

/** A row with nothing wrong, so any assertion is about the verdict alone. */
function row(evidence: Record<string, unknown>): ReviewRow {
  return {
    id: 'r1',
    title: 'Test fund',
    is_active: true,
    url_status: 'ok',
    amount_min: 1000,
    amount_max: 5000,
    deadline: '2027-01-01',
    eligible_structures: ['registered_charity'],
    impact_sectors: ['community'],
    target_beneficiaries: ['families'],
    funder_brief: { who_can_apply: 'Charities', last_enriched: TODAY },
    field_evidence: evidence as ReviewRow['field_evidence'],
  }
}

const codes = (r: ReviewRow) => deriveReviewReasons(r, TODAY).map(x => x.code)

describe('page-read verdicts become reasons', () => {
  it('raises page_says_delisted and quotes the funder', () => {
    const rs = deriveReviewReasons(row({
      _page_read:   { note: 'no_longer_listed', checked_at: TODAY, by: 'verify:v1', agrees: null, quote: null, source_url: null },
      still_listed: { agrees: false, quote: 'Applications for the Small Grants Programme are now closed', checked_at: TODAY, by: 'verify:v1', source_url: null },
    }), TODAY)
    const hit = rs.find(r => r.code === 'page_says_delisted')
    expect(hit).toBeDefined()
    expect(hit!.severity).toBe('critical')
    expect(hit!.detail).toContain('now closed')
  })

  it('raises page_says_not_funding', () => {
    expect(codes(row({
      _page_read: { note: 'not_a_grant', checked_at: TODAY, by: 'verify:v1', agrees: null, quote: null, source_url: null },
      is_grant:   { agrees: false, quote: 'This page describes our annual report', checked_at: TODAY, by: 'verify:v1', source_url: null },
    }))).toContain('page_says_not_funding')
  })

  it('raises page_says_round_closed when the page states the year in full', () => {
    expect(codes(row({
      _page_read: { note: 'round_closed', checked_at: TODAY, by: 'verify:v1', agrees: null, quote: null, source_url: null },
      deadline:   { agrees: false, quote: 'The closing date was 3 April 2026', checked_at: TODAY, by: 'verify:v1', source_url: null },
    }))).toContain('page_says_round_closed')
  })

  it('accepts a two-digit year inside a numeric date', () => {
    expect(codes(row({
      _page_read: { note: 'round_closed', checked_at: TODAY, by: 'verify:v1', agrees: null, quote: null, source_url: null },
      deadline:   { agrees: false, quote: 'Deadline for enquiry forms : 12/08/26', checked_at: TODAY, by: 'verify:v1', source_url: null },
    }))).toContain('page_says_round_closed')
  })

  // The condition Paul set on 16 August, and the row that forced it.
  it('ABSTAINS on round_closed when the page never wrote a year', () => {
    expect(codes(row({
      _page_read: { note: 'round_closed', checked_at: TODAY, by: 'verify:v1', agrees: null, quote: null, source_url: null },
      deadline:   {
        agrees: false,
        // Greggs Community Action Fund. The verifier resolved 2024 from this and
        // called the round closed. The fund was open for another twelve days.
        quote: 'The Community Action Fund is currently open for applications until 28th August at 12 noon',
        checked_at: TODAY, by: 'verify:v1', source_url: null,
      },
    }))).not.toContain('page_says_round_closed')
  })

  it('abstains when round_closed carries no deadline quote at all', () => {
    expect(codes(row({
      _page_read: { note: 'round_closed', checked_at: TODAY, by: 'verify:v1', agrees: null, quote: null, source_url: null },
    }))).not.toContain('page_says_round_closed')
  })

  it('raises none of them on a row with no page evidence', () => {
    const c = codes(row({}))
    expect(c).not.toContain('page_says_delisted')
    expect(c).not.toContain('page_says_not_funding')
    expect(c).not.toContain('page_says_round_closed')
  })

  it('raises none of them when the page read was clean', () => {
    const c = codes(row({
      _page_read: { note: 'verified', checked_at: TODAY, by: 'verify:v1', agrees: null, quote: null, source_url: null },
    }))
    expect(c).not.toContain('page_says_delisted')
    expect(c).not.toContain('page_says_not_funding')
    expect(c).not.toContain('page_says_round_closed')
  })
})

describe('the gate blocks on them', () => {
  // Without this the reasons render and publishing carries on regardless, which
  // is the state that let 20 closed funds stay visible.
  it('all three are blocking, not informational', () => {
    expect(BLOCKING_CODES).toContain('page_says_delisted')
    expect(BLOCKING_CODES).toContain('page_says_not_funding')
    expect(BLOCKING_CODES).toContain('page_says_round_closed')
  })
})
