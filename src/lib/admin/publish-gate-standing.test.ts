import { describe, it, expect } from 'vitest'
import { pageStanding, machineMayPublish, countsAgainstCap, type GateDecision } from './publish-gate'
import type { ReviewRow } from './review-reasons'

// The 2026-09-02 rules on top of the gate:
//   - the machine exposes a not-live row only when the page confirmed at least
//     one line and contradicted none;
//   - republishing an already-live row never spends a slot.

const stamp = (over: Record<string, unknown>) => ({
  quote: null, source_url: 'https://funder.example/fund', checked_at: '2026-09-01T00:00:00Z',
  by: 'verify:v2', agrees: null, ...over,
})

const row = (evidence: Record<string, unknown> | null, is_active = false): ReviewRow =>
  ({ id: 'r1', is_active, field_evidence: evidence as ReviewRow['field_evidence'] })

const decision = (outcome: GateDecision['outcome'], wasLive: boolean): GateDecision =>
  ({ outcome, wasLive, blocking: [], informational: [], readiness: 0 })

describe('pageStanding', () => {
  it('never read is unconfirmed', () => {
    expect(pageStanding(row(null))).toBe('unconfirmed')
    expect(pageStanding(row({}))).toBe('unconfirmed')
  })

  it('read, every line silent, is unconfirmed (ten of sixteen Ready rows on 1 Sep)', () => {
    const ev = { _page_read: stamp({ note: 'verified' }), deadline: stamp({}), is_rolling: stamp({}) }
    expect(pageStanding(row(ev))).toBe('unconfirmed')
  })

  it('one line confirmed with a quote, none contradicted, is confirmed', () => {
    const ev = { _page_read: stamp({ note: 'verified' }), is_grant: stamp({ agrees: true, quote: 'a grant-making charity' }) }
    expect(pageStanding(row(ev))).toBe('confirmed')
  })

  it('agrees:true with no quote does not count as confirmed', () => {
    const ev = { is_grant: stamp({ agrees: true, quote: '' }) }
    expect(pageStanding(row(ev))).toBe('unconfirmed')
  })

  it('one contradiction outranks any number of confirmations', () => {
    const ev = {
      is_grant:   stamp({ agrees: true, quote: 'x' }),
      is_rolling: stamp({ agrees: true, quote: 'y' }),
      eligible_structures: stamp({ agrees: false, quote: 'charities only', proposed: ['registered_charity'] }),
    }
    expect(pageStanding(row(ev))).toBe('contradicted')
  })
})

describe('machineMayPublish', () => {
  const confirmed = row({ is_grant: stamp({ agrees: true, quote: 'x' }) })
  const silent    = row({ _page_read: stamp({ note: 'verified' }) })

  it('never publishes a hold or attention decision', () => {
    expect(machineMayPublish(confirmed, decision('hold', false))).toBe(false)
    expect(machineMayPublish(confirmed, decision('attention', true))).toBe(false)
  })

  it('publishes a not-live row only when the page confirmed something', () => {
    expect(machineMayPublish(confirmed, decision('publish', false))).toBe(true)
    expect(machineMayPublish(silent,    decision('publish', false))).toBe(false)
  })

  it('always republishes an already-live row the gate passes, whatever the page said', () => {
    expect(machineMayPublish(silent, decision('publish', true))).toBe(true)
  })
})

describe('countsAgainstCap', () => {
  it('only a newly exposed row spends a slot', () => {
    expect(countsAgainstCap(decision('publish', false))).toBe(true)
    expect(countsAgainstCap(decision('publish', true))).toBe(false)
    expect(countsAgainstCap(decision('hold', false))).toBe(false)
  })
})
