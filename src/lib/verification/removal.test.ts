import { describe, it, expect } from 'vitest'
import { decideRemoval, type RemovalRow } from './removal'
import { abstainReason, statesYearInFull, readsAsForthcoming, statesClosure } from './abstain'
import type { FieldEvidence } from '../field-evidence'

/**
 * The fixtures are REAL QUOTES off live rows, pulled from production on
 * 2026-08-17. That matters more than it usually does: this module's whole job
 * is to refuse to act on sentences that look actionable, and invented fixtures
 * would be written to match the regexes rather than the funders.
 */

function row(fe: FieldEvidence, over: Partial<RemovalRow> = {}): RemovalRow {
  return {
    id: 'r1', title: 'A Fund', is_active: true, pipeline_state: 'published',
    is_rolling: null, apply_url: 'https://funder.example/fund', field_evidence: fe,
    ...over,
  }
}

const pageRead = (note: string) => ({
  _page_read: { note, agrees: null, quote: null, source_url: null, checked_at: '2026-08-17T00:00:00Z', by: 'verify:v2' },
})

const stamp = (quote: string, extra: Record<string, unknown> = {}) => ({
  quote, agrees: false, source_url: 'https://funder.example/fund',
  checked_at: '2026-08-17T00:00:00Z', by: 'verify:v2', ...extra,
})

describe('the abstain rule', () => {
  it('accepts a four-digit year and a two-digit numeric date', () => {
    expect(statesYearInFull('The application deadline will be 9 March 2026.')).toBe(true)
    expect(statesYearInFull('Deadline for enquiry forms : 12/08/26')).toBe(true)
  })

  it('rejects a date the funder wrote without a year', () => {
    // The Greggs sentence, verbatim. Resolved to 2025-08-28 and used to close a
    // fund that was open.
    expect(statesYearInFull('The Community Action Fund is currently open for applications until 28th August at 12 noon.')).toBe(false)
    expect(statesYearInFull('Apply by Monday 13th July')).toBe(false)
  })

  it('reads an opening as an opening', () => {
    expect(readsAsForthcoming('Applications for our next programme will re-open in May 2026.')).toBe(true)
    expect(readsAsForthcoming('** Coming autumn 2026 **')).toBe(true)
    expect(readsAsForthcoming('The Community Action Fund is currently open for applications until 28th August at 12 noon.')).toBe(true)
  })

  it('treats a sentence that closes AND reopens as a closure', () => {
    const q = 'This round has now closed and will reopen in the spring of 2027.'
    expect(statesClosure(q)).toBe(true)
    expect(abstainReason({ quote: q, requireYear: true })).toBeNull()
  })

  it('holds when the page was never quoted', () => {
    expect(abstainReason({ quote: null, requireYear: false })).toMatch(/not quoted/)
    expect(abstainReason({ quote: '   ', requireYear: false })).toMatch(/not quoted/)
  })
})

describe('round_closed', () => {
  it('acts on a deadline the funder wrote in full', () => {
    const d = decideRemoval(row({ ...pageRead('round_closed'), deadline: stamp('Deadline 30th March 2026', { proposed: '2026-03-30' }) }))
    expect(d.act).toBe(true)
    if (!d.act) return
    expect(d.klass).toBe('round_closed')
    // Out of view, but watched — not archived.
    expect(d.fields).toEqual({ is_active: false, pipeline_state: 'between_rounds_scheduled' })
    // It may not invent a reopening date.
    expect(d.fields).not.toHaveProperty('next_open_date')
  })

  it('ABSTAINS on the Greggs row — no year, and the sentence says open', () => {
    const d = decideRemoval(row({
      ...pageRead('round_closed'),
      deadline: stamp('The Community Action Fund is currently open for applications until 28th August at 12 noon.', { proposed: '2025-08-28' }),
    }))
    expect(d.act).toBe(false)
    if (d.act) return
    expect(d.reason).toMatch(/opening, not closing/)
  })

  it('ABSTAINS where a re-opening date was read as a deadline', () => {
    // Tech for Good Programme. The year IS stated, so the year limb passes and
    // only the forthcoming limb catches this. Both limbs are load-bearing.
    const d = decideRemoval(row({
      ...pageRead('round_closed'),
      deadline: stamp('Applications for our next programme will re-open in May 2026.', { proposed: '2026-05-01' }),
    }))
    expect(d.act).toBe(false)
    if (d.act) return
    expect(d.reason).toMatch(/opening, not closing/)
  })

  it('ABSTAINS on a year-less date even when nothing says open', () => {
    const d = decideRemoval(row({ ...pageRead('round_closed'), deadline: stamp('Apply by Monday 13th July', { proposed: '2025-07-13' }) }))
    expect(d.act).toBe(false)
    if (d.act) return
    expect(d.reason).toMatch(/did not write the year/)
  })
})

describe('no_longer_listed', () => {
  const acts = [
    'The latest round of the Bright Futures Fund, in partnership with Forever Manchester, is NOW CLOSED to applications.',
    'Applications to this fund are now closed.',
    'Current status Closed',
    'Our grant-giving activities are on pause while we finalise a new funding policy.',
    'Opportunity status: Closed',
    'The application window for this fund has now closed. Thank you to all groups that applied.',
    'This programme is currently closed for applications.',
    'This fund has now closed to applications.',
  ]
  // ARCHIVE IS THE EXCEPTION. Every one of these eight quotes is a real
  // `no_longer_listed` row from the first armed pass, and not one says the fund
  // is gone — so all eight go out of view AND STAY WATCHED, rather than being
  // buried where a reopening could never bring them back.
  it.each(acts)('takes it out of view but keeps it watched: %s', q => {
    const d = decideRemoval(row({ ...pageRead('no_longer_listed'), still_listed: stamp(q) }))
    expect(d.act).toBe(true)
    if (!d.act) return
    expect(d.fields.is_active).toBe(false)
    expect(d.fields.pipeline_state).toBe('between_rounds_scheduled')
    expect(d.fields).not.toHaveProperty('rejection_reason')
  })

  it('archives only where the funder says the fund is GONE', () => {
    const d = decideRemoval(row({
      ...pageRead('no_longer_listed'),
      still_listed: stamp('This programme has been discontinued and there will be no future rounds.'),
    }))
    expect(d.act).toBe(true)
    if (!d.act) return
    expect(d.fields.pipeline_state).toBe('archived')
    expect(String(d.fields.rejection_reason)).toContain('no_longer_listed')
  })

  it('a pause is not a permanent closure', () => {
    // Grants to Charities, verbatim. Read as "gone" on the first pass; it is a
    // funder rewriting its policy, which is the most watchable case of the lot.
    const d = decideRemoval(row({
      ...pageRead('no_longer_listed'),
      still_listed: stamp('Our grant-giving activities are on pause while we finalise a new funding policy.'),
    }))
    expect(d.act).toBe(true)
    if (!d.act) return
    expect(d.fields.pipeline_state).toBe('between_rounds_scheduled')
  })

  it('ABSTAINS on a fund that is arriving, not leaving', () => {
    const d = decideRemoval(row({ ...pageRead('no_longer_listed'), still_listed: stamp('** Coming autumn 2026 **') }))
    expect(d.act).toBe(false)
    if (d.act) return
    expect(d.reason).toMatch(/opening, not closing/)
  })

  it('ABSTAINS where the quote asserts no closure at all', () => {
    // A sentence about past grantmaking is not evidence the fund is gone.
    const d = decideRemoval(row({
      ...pageRead('no_longer_listed'),
      still_listed: stamp('Almost £85,000 has been invested in 10 Community Organisations through Addressing Mental Health Inequalities in Minority Ethnic Groups Grant'),
    }))
    expect(d.act).toBe(false)
    if (d.act) return
    expect(d.reason).toMatch(/does not state the fund is closed/)
  })
})

describe('not_a_grant', () => {
  it('ALWAYS archives — there is no round to wait for and nothing to watch', () => {
    const d = decideRemoval(row({ ...pageRead('not_a_grant'), is_grant: stamp('This page describes volunteering opportunities, not funding.') }))
    expect(d.act).toBe(true)
    if (!d.act) return
    expect(d.fields.pipeline_state).toBe('archived')
  })

  it('still abstains with no quote', () => {
    const d = decideRemoval(row({ ...pageRead('not_a_grant'), is_grant: { ...stamp('x'), quote: null } as never }))
    expect(d.act).toBe(false)
  })
})

describe('the rolling flip', () => {
  it('unsets a rolling claim the page contradicts with dated rounds', () => {
    const d = decideRemoval(row(
      { ...pageRead('verified'), is_rolling: stamp('Rounds close on 31 January 2026 and 31 July 2026.', { proposed: false }) },
      { is_rolling: true },
    ))
    expect(d.act).toBe(true)
    if (!d.act) return
    expect(d.klass).toBe('rolling_unset')
    expect(d.fields).toEqual({ is_rolling: false })
  })

  it('NEVER sets rolling true — that widens a claim', () => {
    const d = decideRemoval(row(
      { ...pageRead('verified'), is_rolling: stamp('Applications are accepted at any time in 2026.', { proposed: true }) },
      { is_rolling: false },
    ))
    expect(d.act).toBe(false)
  })

  it('ABSTAINS where the dates are the trustees diary, not the applicant deadline', () => {
    // Drapers' Charitable Fund, verbatim. Would have been flipped on the first
    // armed run: a genuinely rolling fund whose committee meeting dates the
    // extractor read as rounds.
    const d = decideRemoval(row(
      { ...pageRead('verified'), is_rolling: stamp('You can apply at any time of the year. Our Charities Committee meets five times a year and applications will normally be considered at the next meeting following submission. The next meeting dates are: 29 September 2026 1 December 2026', { proposed: false }) },
      { is_rolling: true },
    ))
    expect(d.act).toBe(false)
    if (d.act) return
    expect(d.reason).toMatch(/accepted at any time/)
  })

  it('ABSTAINS on monthly consideration with trustee meetings', () => {
    // William A Cadbury, verbatim.
    const d = decideRemoval(row(
      { ...pageRead('verified'), is_rolling: stamp('Applications for small grants (all postal applications and requests for amounts under £5000) are considered on a monthly basis. Trustees meet in May and November 2026.', { proposed: false }) },
      { is_rolling: true },
    ))
    expect(d.act).toBe(false)
  })

  it('still acts where the dates are real application deadlines', () => {
    // South Lanarkshire Renewable Energy Fund, verbatim. The guard above must
    // not swallow the class it was added beside.
    const d = decideRemoval(row(
      { ...pageRead('verified'), is_rolling: stamp('Deadlines for main grant applications You must submit your application by one of the dates below. Decisions are made at the following committee meeting. 20 January 2026 7 April 2026 7 July 2026', { proposed: false }) },
      { is_rolling: true },
    ))
    expect(d.act).toBe(true)
  })

  it('abstains on a year-less round list', () => {
    const d = decideRemoval(row(
      { ...pageRead('verified'), is_rolling: stamp('Rounds close on 31 January and 31 July.', { proposed: false }) },
      { is_rolling: true },
    ))
    expect(d.act).toBe(false)
    if (d.act) return
    expect(d.reason).toMatch(/did not write the year/)
  })
})

describe('what it will not touch', () => {
  it('leaves a verified row alone', () => {
    expect(decideRemoval(row(pageRead('verified'))).act).toBe(false)
  })

  it('leaves a broken link alone — a link to fix is not a fund to remove', () => {
    expect(decideRemoval(row(pageRead('fixable_link: wrong_fund'))).act).toBe(false)
    expect(decideRemoval(row(pageRead('fixable_link: fetch_failed'))).act).toBe(false)
  })

  it('leaves multiple_funds alone', () => {
    expect(decideRemoval(row(pageRead('multiple_funds'))).act).toBe(false)
  })

  it('does nothing to a row that is already out of view', () => {
    const d = decideRemoval(row(
      { ...pageRead('no_longer_listed'), still_listed: stamp('Applications to this fund are now closed.') },
      { is_active: false },
    ))
    expect(d.act).toBe(false)
  })

  it('does nothing with no evidence at all', () => {
    expect(decideRemoval(row({} as FieldEvidence)).act).toBe(false)
    expect(decideRemoval(row(null as never)).act).toBe(false)
  })

  it('never proposes a field outside the four classes', () => {
    // The guarantee §12 rests on: no amount, no eligibility, no income cap.
    const fe = {
      ...pageRead('round_closed'),
      deadline:            stamp('Deadline 30th March 2026', { proposed: '2026-03-30' }),
      eligible_structures: stamp('Open to charities and CICs', { proposed: ['charity', 'cic'] }),
      max_org_income:      stamp('Income under £1m', { proposed: 1000000 }),
    }
    const d = decideRemoval(row(fe))
    expect(d.act).toBe(true)
    if (!d.act) return
    expect(Object.keys(d.fields).sort()).toEqual(['is_active', 'pipeline_state'])
  })
})
