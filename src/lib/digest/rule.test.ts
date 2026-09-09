import { describe, it, expect } from 'vitest'
import { plainRule, shortDate, stripPlaceholderLead, matchOrder } from './build'
import { daysUntil } from './text'
import { nearMissMeta } from './near-miss'

describe('near-miss rule, in the funder’s terms', () => {
  it('rewrites the engine’s structure message funder-first', () => {
    const raw = 'CIC (limited by guarantee) is not in the eligible structures list ' +
      '(Registered charity, Charitable Incorporated Organisation, Limited by guarantee, Unincorporated)'
    expect(plainRule(raw)).toBe(
      'They fund Registered charity, Charitable Incorporated Organisation, Limited by guarantee ' +
      'and Unincorporated. Our record has you as CIC (limited by guarantee).',
    )
  })

  it('never leaks our vocabulary into the email', () => {
    const raw = 'CIC is not in the eligible structures list (Registered charity, CIO)'
    // "eligible structures list" is a database phrase; nobody says it aloud.
    expect(plainRule(raw)).not.toMatch(/eligible structures list/i)
  })

  it('handles a single allowed structure without a stray "and"', () => {
    expect(plainRule('CIC is not in the eligible structures list (Registered charity)'))
      .toBe('They fund Registered charity. Our record has you as CIC.')
  })

  it('passes anything it does not recognise through untouched', () => {
    // Mangling a rule we do not understand is worse than repeating it.
    const other = 'Restricted to Scotland — your org is in England.'
    expect(plainRule(other)).toBe(other)
  })
})

describe('short dates', () => {
  it('abbreviates every month to exactly three letters', () => {
    // en-GB toLocaleString renders September as "Sept", four characters where
    // every other month is three, and the ragged column shows in the meta line.
    for (let m = 0; m < 12; m++) {
      const iso = `2026-${String(m + 1).padStart(2, '0')}-10`
      const out = shortDate(iso)
      expect(out.split(' ')[1]).toHaveLength(3)
    }
    expect(shortDate('2026-09-10')).toBe('10 Sep')
    expect(shortDate('2026-11-19')).toBe('19 Nov')
  })
})

describe('closed opportunities never reach a match row', () => {
  it('is the bug the thin-week render exposed', () => {
    // "Champions for Children · closes 30 Jun" rendered on 31 August. The
    // catalogue still carries active, published rows whose deadline has passed;
    // the closing section filtered them and the match list did not.
    const from = new Date('2026-08-31T12:00:00Z')
    expect(daysUntil('2026-06-30', from)).toBeLessThan(0)
    expect(daysUntil('2026-09-11', from)).toBeGreaterThan(0)
  })
})

describe('the year appears once it stops being obvious', () => {
  const now = new Date('2026-08-31T12:00:00Z')
  it('omits the year inside the current year', () => {
    expect(shortDate('2026-09-10', now)).toBe('10 Sep')
    expect(shortDate('2026-11-19', now)).toBe('19 Nov')
  })
  it('shows it across a year boundary', () => {
    // Champions for Children closes 2027-06-30, 303 days out, and rendered as
    // "closes 30 Jun" next to deadlines ten days away.
    expect(shortDate('2027-06-30', now)).toBe('30 Jun 2027')
    expect(shortDate('2025-06-30', now)).toBe('30 Jun 2025')
  })
})


describe('placeholder lead on exclusions', () => {
  it('drops "Not explicitly stated. However, ..." and keeps the caveat', () => {
    expect(stripPlaceholderLead('Not explicitly stated. However, applicants must be based in England.'))
      .toBe('Applicants must be based in England.')
  })
  it('leaves a bare placeholder for the saysNone test to drop', () => {
    expect(stripPlaceholderLead('Not explicitly stated.')).toBe('')
  })
  it('leaves a real exclusion alone', () => {
    expect(stripPlaceholderLead('No funding for individuals or statutory bodies.'))
      .toBe('No funding for individuals or statutory bodies.')
  })
})

describe('match rotation by send history', () => {
  const mk = (id: string, score: number, fresh = false) => ({ row: { id }, score, fresh })
  it('puts matches shown in the window below unshown ones, best repeats last', () => {
    const seen = new Set(['new_match:a', 'new_match:b'])
    const pool = [mk('a', 95), mk('b', 90), mk('c', 70), mk('d', 80)]
    expect(pool.sort(matchOrder(seen)).map(s => s.row.id)).toEqual(['d', 'c', 'a', 'b'])
  })
  it('falls back to fresh-then-score when nothing has been shown', () => {
    const pool = [mk('a', 95), mk('b', 60, true), mk('c', 70)]
    expect(pool.sort(matchOrder(new Set())).map(s => s.row.id)).toEqual(['b', 'a', 'c'])
  })
  it('never empties the list: with everything shown, order is fresh then score', () => {
    const seen = new Set(['new_match:a', 'new_match:b', 'new_match:c'])
    const pool = [mk('a', 70), mk('b', 90), mk('c', 80)]
    expect(pool.sort(matchOrder(seen)).map(s => s.row.id)).toEqual(['b', 'c', 'a'])
  })
})
