import { describe, it, expect } from 'vitest'
import { amountSuggestionFrom } from './grant-flags'

const flag = (suggested?: unknown) => ({
  checks: [{ code: 'amount_pot_suspected', detail: 'x', source: 's', at: 'now', ...(suggested ? { suggested } : {}) }],
})
const stored = (amount_min: number | null, amount_max: number | null) => ({ amount_min, amount_max })

describe('the figure a flag is arguing for', () => {
  it('is offered when it differs from what is stored', () => {
    expect(amountSuggestionFrom(flag({ amount_max: 2000, amount_min: null }), stored(500, 10000)))
      .toEqual({ amount_min: null, amount_max: 2000 })
  })

  it('is not offered when it matches the row — the button would do nothing', () => {
    expect(amountSuggestionFrom(flag({ amount_max: 3200, amount_min: null }), stored(null, 3200))).toBeNull()
  })
})

describe('flags written before the figure was stored', () => {
  // The detail sentence carries the number as prose. Parsing our own sentences
  // back into numbers is not worth the failure mode, so those rows simply get
  // no button and the amount boxes remain.
  it('offer nothing rather than guessing', () => {
    expect(amountSuggestionFrom(flag(), stored(500, 10000))).toBeNull()
    expect(amountSuggestionFrom(flag({}), stored(500, 10000))).toBeNull()
  })
})

describe('rows with nothing to say', () => {
  it('copes with absent, malformed and unrelated data', () => {
    expect(amountSuggestionFrom(null, stored(1, 2))).toBeNull()
    expect(amountSuggestionFrom({}, stored(1, 2))).toBeNull()
    expect(amountSuggestionFrom({ checks: 'nope' }, stored(1, 2))).toBeNull()
    expect(amountSuggestionFrom({ checks: [null, 3] }, stored(1, 2))).toBeNull()
  })

  it('ignores a flag that is not about the amount', () => {
    const other = { checks: [{ code: 'possible_multi_round_uncaptured', suggested: { amount_max: 99 } }] }
    expect(amountSuggestionFrom(other, stored(1, 2))).toBeNull()
  })
})
