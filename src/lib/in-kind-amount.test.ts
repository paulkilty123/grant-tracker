// An in-kind offer has no cash award, and no surface may say otherwise.
//
// Measured on production 2026-09-01, before this: 60 live in-kind rows rendered
// "Amount on application" and 4 rendered "Amount not disclosed". LawWorks
// brokers free legal advice; The Hygiene Bank ships products. Neither has a
// figure to ask about or to withhold.
//
// Each case asserts the WRONG answer would have been produced by the same input
// under a different funding type, so a regression that drops the funding_type
// argument fails here rather than going quiet.

import { describe, it, expect } from 'vitest'
import { formatRange } from './utils'
import { toMCPOpportunitySummary } from './opportunity-adapter'

describe('formatRange — the no-amount branch depends on funding type', () => {
  it('does not invite a fundraiser to ask an in-kind offer what the grant is', () => {
    // The bug, stated as its own test: without the type, this is the answer.
    expect(formatRange(null, null)).toBe('Amount on application')
    expect(formatRange(null, null, false, 'in_kind')).toBe('In-kind')
  })

  it('does not claim a pro bono scheme is withholding a figure', () => {
    expect(formatRange(null, null, true)).toBe('Amount not disclosed')
    expect(formatRange(null, null, true, 'in_kind')).toBe('In-kind')
  })

  it('covers the £0 to £0 seed artefact, which is the same absence written differently', () => {
    // 11 live in-kind rows are stored 0/0. `!min && !max` catches it because 0
    // is falsy, so it lands on the same branch — which is what we want.
    expect(formatRange(0, 0, false, 'in_kind')).toBe('In-kind')
  })

  it('leaves a REAL in-kind value alone — that figure means what it says', () => {
    // AWS gives £1,000 of credits, Microsoft £3,500, Google Ad Grants up to
    // £10,000 a month. Suppressing those would delete the useful half.
    expect(formatRange(1000, 1000, false, 'in_kind')).toBe('£1k')
    expect(formatRange(null, 10_000, false, 'in_kind')).toBe('Up to £10k')
  })

  it('keeps every existing answer for a cash grant', () => {
    expect(formatRange(null, null, false, 'grant')).toBe('Amount on application')
    expect(formatRange(null, null, true,  'grant')).toBe('Amount not disclosed')
    expect(formatRange(5000, 20_000, false, 'grant')).toBe('£5k – £20k')
    expect(formatRange(null, null, false, 'programme')).toBe('Programme only')
  })
})

describe('the MCP contract does not report a missing cash award as withheld', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: '00000000-0000-4000-8000-000000000001',
    title: 'LawWorks Free Legal Advice', funder: 'LawWorks',
    funding_type: 'in_kind', amount_min: null, amount_max: null,
    amount_undisclosed: true, apply_url: 'https://www.lawworks.org.uk/',
    ...over,
  }) as never

  const ctx = { tier: 'free', surface: 'mcp' } as never

  it('is false for an in-kind row with no amount', () => {
    expect(toMCPOpportunitySummary(row(), ctx).amount.undisclosed).toBe(false)
  })

  it('is still true for a CASH fund whose funder publishes no figure', () => {
    // The distinction the contract exists for must survive the fix.
    expect(toMCPOpportunitySummary(row({ funding_type: 'grant' }), ctx).amount.undisclosed).toBe(true)
  })

  it('is still true for an in-kind row nobody has priced but someone established', () => {
    // Only the null/null case is a category error. A stored figure is real.
    const withFigure = toMCPOpportunitySummary(row({ amount_max: 3500, amount_undisclosed: false }), ctx)
    expect(withFigure.amount.max).toBe(3500)
    expect(withFigure.amount.undisclosed).toBe(false)
  })
})
