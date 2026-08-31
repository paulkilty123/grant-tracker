import { describe, it, expect } from 'vitest'
import { plainRule, shortDate } from './build'
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

describe('every opportunity row says what kind it is', () => {
  it('labels grants too, so absence never carries the meaning', () => {
    // 476 of the 581 published rows are grants, so it is tempting to label only
    // the other 105. But a reader cannot know that no label means grant unless
    // somebody tells them, and the non-grant breadth is the differentiator.
    expect(nearMissMeta(
      { funder: 'A funder', amountMin: 1000, amountMax: 4000 } as never, null, 'Grant',
    )).toBe('Grant · A funder · £1k – £4k')
  })

  it('puts the type first, before the funder', () => {
    expect(nearMissMeta(
      { funder: 'Big Issue Invest', amountMin: 0, amountMax: 0 } as never, null, 'Investment',
    )).toBe('Investment · Big Issue Invest')
  })
})
