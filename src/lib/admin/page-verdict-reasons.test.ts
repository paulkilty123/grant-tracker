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
    // Set so the `no_funder` block does not fire on every fixture. A row
    // reaching this module without a funder is itself a blocking defect.
    funder: 'Test Funder',
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

/**
 * A past date in the write-up means two different things depending on whether a
 * current deadline exists. The queue used to treat them alike and then say
 * "Nothing looks wrong with this one" beside a "Date already past" chip.
 */
describe('a past date in the write-up', () => {
  const withStale = (extra: Partial<ReviewRow>): ReviewRow => ({
    ...row({}),
    funder_brief: {
      who_can_apply: 'Charities',
      last_enriched: TODAY,
      _stale_dates: [{ field: 'decision_timeline', phrase: 'Applications close 28 April 2026', matched_date: '2026-04' }],
    },
    ...extra,
  })

  it('is informational when a current deadline is still on the card', () => {
    const c = codes(withStale({ deadline: '2027-01-01' }))
    expect(c).toContain('stale_dates')
    expect(c).not.toContain('no_current_timing')
  })

  it('blocks when no deadline is recorded at all', () => {
    const c = codes(withStale({ deadline: null, is_rolling: false }))
    expect(c).toContain('no_current_timing')
    expect(c).not.toContain('stale_dates')
  })

  it('blocks, and says so plainly, when the card claims to be rolling', () => {
    const rs = deriveReviewReasons(withStale({ deadline: null, is_rolling: true }), TODAY)
    const hit = rs.find(r => r.code === 'no_current_timing')
    expect(hit).toBeDefined()
    expect(hit!.severity).toBe('critical')
    expect(hit!.detail).toContain('Rolling, apply any time')
  })

  it('does not double-count a stored deadline that has itself passed', () => {
    // deadline_passed already blocks that row; raising both would report one
    // fault twice and make the queue look worse than it is.
    const c = codes(withStale({ deadline: '2020-01-01' }))
    expect(c).toContain('deadline_passed')
    expect(c).not.toContain('no_current_timing')
    expect(c).not.toContain('stale_dates')
  })

  it('raises neither when the write-up quotes no stale date', () => {
    const c = codes(row({}))
    expect(c).not.toContain('stale_dates')
    expect(c).not.toContain('no_current_timing')
  })

  it('no_current_timing blocks at the gate, stale_dates does not', () => {
    expect(BLOCKING_CODES).toContain('no_current_timing')
    expect(BLOCKING_CODES).not.toContain('stale_dates')
  })
})

/**
 * The gate failures are stored as a COMPOSITE — `"fixable_link: wrong_fund"` —
 * in the same `note` the bare-outcome switch reads, so none of its cases ever
 * matched and the gate published the row regardless.
 *
 * Found 2026-08-17 in the dry run taken before arming auto-publish: 30 of the 51
 * rows the gate would have newly published carried a `fixable_link:` verdict, 29
 * of them `wrong_fund`. The engine had already read those pages and reported
 * that our fund was not on them.
 */
describe('gate failures reach the publish gate', () => {
  const evidence = (note: string) => ({
    _page_read: { note, checked_at: TODAY, by: 'verify:v2', agrees: null, quote: null, source_url: null },
  })

  it('BLOCKS a row whose page does not describe the fund', () => {
    const cs = codes(row(evidence('fixable_link: wrong_fund')))
    expect(cs).toContain('page_describes_different_fund')
    expect(BLOCKING_CODES).toContain('page_describes_different_fund')
  })

  it('does NOT block on a read failure — that is our problem, not the page contradicting us', () => {
    for (const failure of ['fetch_failed', 'no_content', 'no_funding_detail']) {
      const cs = codes(row(evidence(`fixable_link: ${failure}`)))
      expect(cs, failure).not.toContain('page_describes_different_fund')
    }
  })

  it('says nothing at all for a read failure, so the queue is not told twice', () => {
    // The first draft raised a `check` here and the Asda Foundation row came
    // back carrying `link_unverified` twice, because the url_status path already
    // raises it. Existing link reasons own this ground.
    const clean  = codes(row(evidence('verified')))
    const failed = codes(row(evidence('fixable_link: fetch_failed')))
    expect(failed).toEqual(clean)
  })

  it('leaves a verified row alone', () => {
    const cs = codes(row(evidence('verified')))
    expect(cs).not.toContain('page_describes_different_fund')
    expect(cs).not.toContain('link_unverified')
  })
})

describe('a row with no funder cannot publish', () => {
  it('blocks when funder is null, empty or whitespace', () => {
    for (const funder of [null, '', '   ', undefined]) {
      const r = { ...row({}), funder } as ReviewRow
      expect(codes(r), String(funder)).toContain('no_funder')
    }
    expect(BLOCKING_CODES).toContain('no_funder')
  })

  it('does not fire when a funder is present', () => {
    expect(codes(row({}))).not.toContain('no_funder')
  })
})

/**
 * The rule that makes the verification engine load-bearing: a row cannot go in
 * front of a user unless the engine has actually read the page it points at.
 *
 * The gap it closes was found the day it was written. The City Bridge Climate
 * row was staged behind the review gate with a hand-written brief, so `no_brief`
 * stayed silent, and the armed publisher would have made it live the next
 * morning with nobody having checked the URL resolved to the fund it claimed.
 */
describe('nothing publishes that was never read', () => {
  it('blocks a row with no page-read stamp at all', () => {
    const cs = codes(row({}))
    expect(cs).toContain('never_verified')
    expect(BLOCKING_CODES).toContain('never_verified')
  })

  it('blocks a row whose field_evidence is null', () => {
    const r = { ...row({}), field_evidence: null } as ReviewRow
    expect(codes(r)).toContain('never_verified')
  })

  it('is silent once the engine has read the page, whatever it found', () => {
    for (const note of ['verified', 'round_closed', 'no_longer_listed', 'fixable_link: wrong_fund']) {
      const cs = codes(row({
        _page_read: { note, checked_at: TODAY, by: 'verify:v2', agrees: null, quote: null, source_url: null },
      }))
      expect(cs, note).not.toContain('never_verified')
    }
  })

  it('is NOT the same test as no_brief — a hand-written brief does not satisfy it', () => {
    // Exactly the City Bridge Climate shape: brief present, page never read.
    const r = { ...row({}), funder_brief: { who_can_apply: 'London charities', what_they_fund: 'Climate work' } } as ReviewRow
    const cs = codes(r)
    expect(cs).not.toContain('no_brief')
    expect(cs).toContain('never_verified')
  })
})
