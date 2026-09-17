// A deadline that has passed is not a disagreement about who knows better.
//
// The trust ladder answers "who is more authoritative". For a perishable claim
// that is the wrong question: a human who read the funder's page in July knew
// better than any machine that day, and the same value in September is simply
// old. ScottishPower went stale behind admin trust 100 twice — once in July,
// recorded at the time, and again by September — because the ladder was the only
// rule and it has no way to say "this was true then".

import { describe, it, expect } from 'vitest'
import { mergeFieldUpdate, supersedesAsStale, PERISHABLE_FIELDS, type ProvenanceEntry } from './grant-merge'

const JULY: ProvenanceEntry = { source: 'admin:paulkilty1@gmail.com', set_at: '2026-07-24T09:00:00Z', pinned: true }
const cited = (snippet: string, at = '2026-09-01T12:00:00Z'): ProvenanceEntry => ({
  source: 'system:review-sweep' as never, set_at: at, pinned: false,
  citation: { snippet, confidence: 'high' },
})
const uncited = (at = '2026-09-01T12:00:00Z'): ProvenanceEntry =>
  ({ source: 'system:review-sweep' as never, set_at: at, pinned: false })

const QUOTE = 'Our Annual Grants Fund 2027 is now closed. We anticipate opening the '
            + 'application window for the Annual Grants Fund 2028 in July 2027.'

describe('the ladder still refuses everything it refused before', () => {
  it('refuses a lower-trust write to a NON-perishable field, quote or not', () => {
    const d = mergeFieldUpdate(50_000, JULY, null, cited(QUOTE), 'amount_max')
    expect(d.write).toBe(false)
  })

  it('refuses a lower-trust write that ADDS a perishable claim', () => {
    // The removals-only asymmetry, and the whole reason this is safe. Writing a
    // new date is a claim about the future and still needs a human.
    const d = mergeFieldUpdate('2026-07-24', JULY, '2027-07-01', cited(QUOTE), 'deadline')
    expect(d.write).toBe(false)
    expect(d.write === false && d.reason).toBe('pinned')
  })

  it('refuses to clear a perishable claim with NO quote', () => {
    // Without this, any automated source could clear any human deadline on no
    // evidence at all, which is a worse failure than staleness.
    const d = mergeFieldUpdate('2026-07-24', JULY, null, uncited(), 'deadline')
    expect(d.write).toBe(false)
  })

  it('refuses an OLDER read, even a quoted one', () => {
    const d = mergeFieldUpdate('2026-07-24', JULY, null, cited(QUOTE, '2026-07-01T00:00:00Z'), 'deadline')
    expect(d.write).toBe(false)
  })

  it('refuses when the field name is not passed — every existing caller is unchanged', () => {
    const d = mergeFieldUpdate('2026-07-24', JULY, null, cited(QUOTE))
    expect(d.write).toBe(false)
  })
})

describe('a fresher grounded read may withdraw a stale perishable claim', () => {
  it('clears ScottishPower', () => {
    const d = mergeFieldUpdate('2026-07-24', JULY, null, cited(QUOTE), 'deadline')
    expect(d.write).toBe(true)
    expect(d.write === true && d.value).toBeNull()
  })

  it('names who was overruled, so the digest can report it', () => {
    const d = mergeFieldUpdate('2026-07-24', JULY, null, cited(QUOTE), 'deadline')
    expect(d.write === true && d.superseded).toEqual({
      source: 'admin:paulkilty1@gmail.com',
      setAt: '2026-07-24T09:00:00Z',
      value: '2026-07-24',
    })
  })

  it('keeps the overruled value recoverable', () => {
    const d = mergeFieldUpdate('2026-07-24', JULY, null, cited(QUOTE), 'deadline')
    expect(d.write === true && d.prov.previous).toEqual({
      source: 'admin:paulkilty1@gmail.com', value: '2026-07-24',
    })
  })

  it('covers is_rolling true to false, which is also a withdrawal', () => {
    const d = mergeFieldUpdate(true, JULY, false, cited('Applications are now by invitation only.'), 'is_rolling')
    expect(d.write).toBe(true)
  })

  it('does NOT cover is_rolling false to true, which is a new claim', () => {
    const d = mergeFieldUpdate(false, JULY, true, cited('We accept applications year round.'), 'is_rolling')
    expect(d.write).toBe(false)
  })
})

describe('supersedesAsStale — the boundary', () => {
  it('covers exactly the four timing fields', () => {
    expect([...PERISHABLE_FIELDS].sort()).toEqual(
      ['deadline', 'deadline_cycle', 'is_rolling', 'next_open_date'].sort())
  })

  it('does not fire on an amount, however stale and however well quoted', () => {
    expect(supersedesAsStale('amount_max', JULY, null, cited('Grants of up to £5,000.'))).toBe(false)
  })

  it('does not fire on an unparseable stamp rather than guessing at freshness', () => {
    const broken: ProvenanceEntry = { source: 'admin:x', set_at: 'not a date', pinned: true }
    expect(supersedesAsStale('deadline', broken, null, cited(QUOTE))).toBe(false)
  })
})
