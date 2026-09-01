// A dry run that cannot report a refusal is not a dry run.
//
// Paul, 2026-09-01, after the first version of the review-queue corrections
// script printed "(currently admin:paulkilty1@gmail.com)" beside a change and
// then reported "would apply 6". Naming the holder is not predicting the
// outcome, and the two readings together were worse than either alone.
//
// The tests below do two things. They assert the prediction reports a refusal at
// all — the thing that was missing — and they assert it AGREES WITH THE MERGER
// on every case, because a prediction that drifts from the writer is the same
// bug wearing a different hat.

import { describe, it, expect } from 'vitest'
import { predictWrite, describePrediction } from './dry-run-refusal'
import { mergeFieldUpdate, type ProvenanceEntry, type ProvenanceSource } from '@/lib/grant-merge'

const ADMIN: ProvenanceEntry = { source: 'admin:paulkilty1@gmail.com', set_at: '2026-07-24T09:00:00Z', pinned: true }
const SCRAPER: ProvenanceEntry = { source: 'scraper:manual_ingest' as never, set_at: '2026-05-18T09:00:00Z', pinned: false }
const SYSTEM = 'system:review-sweep-2026-09-01' as ProvenanceSource
const NOW = '2026-09-01T12:00:00Z'
const QUOTE = { snippet: 'Our Annual Grants Fund 2027 is now closed.', confidence: 'high' as const }

describe('the prediction reports a refusal — the thing that was missing', () => {
  it('says REFUSED where system: meets an admin-held deadline', () => {
    const p = predictWrite({
      field: 'deadline', currentValue: '2026-07-24', currentProv: ADMIN,
      newValue: '2027-07-01', source: SYSTEM, now: NOW,
    })
    expect(p.outcome).toBe('refused')
    expect(p.outcome === 'refused' && p.heldBy).toBe('admin:paulkilty1@gmail.com')
    expect(p.outcome === 'refused' && p.heldTrust).toBe(100)
  })

  it('and the printed line SAYS so, rather than only naming the holder', () => {
    const p = predictWrite({
      field: 'deadline', currentValue: '2026-07-24', currentProv: ADMIN,
      newValue: '2027-07-01', source: SYSTEM, now: NOW,
    })
    const line = describePrediction('deadline', '2026-07-24', '2027-07-01', p)
    expect(line).toContain('WOULD BE REFUSED')
    // The exact failure: a line that mentions the holder and implies success.
    expect(line).not.toMatch(/^\S+: .* -> .*\s+\(currently/)
  })

  it('says APPLIES over a scraper value', () => {
    expect(predictWrite({
      field: 'deadline', currentValue: '2026-07-05', currentProv: SCRAPER,
      newValue: null, source: SYSTEM, now: NOW,
    }).outcome).toBe('applies')
  })

  it('says NO CHANGE when the value already matches, and does not count it as work', () => {
    expect(predictWrite({
      field: 'amount_max', currentValue: 5000, currentProv: SCRAPER,
      newValue: 5000, source: SYSTEM, now: NOW,
    }).outcome).toBe('no_change')
  })

  it('says SUPERSEDES for a quoted withdrawal of a stale perishable claim', () => {
    const p = predictWrite({
      field: 'deadline', currentValue: '2026-07-24', currentProv: ADMIN,
      newValue: null, source: SYSTEM, citation: QUOTE, now: NOW,
    })
    expect(p.outcome).toBe('supersedes')
    expect(describePrediction('deadline', '2026-07-24', null, p)).toContain('SUPERSEDES')
  })
})

describe('the prediction agrees with the merger on every case', () => {
  const cases: Array<{
    name: string; field: string; from: unknown; to: unknown
    prov: ProvenanceEntry; citation?: typeof QUOTE
  }> = [
    { name: 'admin deadline, new date',      field: 'deadline',   from: '2026-07-24', to: '2027-07-01', prov: ADMIN },
    { name: 'admin deadline, cleared+quote', field: 'deadline',   from: '2026-07-24', to: null, prov: ADMIN, citation: QUOTE },
    { name: 'admin deadline, cleared, none', field: 'deadline',   from: '2026-07-24', to: null, prov: ADMIN },
    { name: 'scraper deadline cleared',      field: 'deadline',   from: '2026-07-05', to: null, prov: SCRAPER },
    { name: 'scraper amount raised',         field: 'amount_max', from: null,         to: 1500, prov: SCRAPER },
    { name: 'admin amount, quoted clear',    field: 'amount_max', from: 50_000,       to: null, prov: ADMIN, citation: QUOTE },
    { name: 'unchanged value',               field: 'amount_max', from: 5000,         to: 5000, prov: SCRAPER },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const predicted = predictWrite({
        field: c.field, currentValue: c.from, currentProv: c.prov,
        newValue: c.to, source: SYSTEM, citation: c.citation, now: NOW,
      })
      const actual = mergeFieldUpdate(
        c.from, c.prov, c.to,
        { source: SYSTEM, set_at: NOW, pinned: false, ...(c.citation ? { citation: c.citation } : {}) },
        c.field,
      )
      const predictedWrites = predicted.outcome === 'applies' || predicted.outcome === 'supersedes'
      expect(predictedWrites, `${c.name}: predicted ${predicted.outcome}, merger ${actual.write ? 'wrote' : 'refused'}`)
        .toBe(actual.write)
    })
  }
})
