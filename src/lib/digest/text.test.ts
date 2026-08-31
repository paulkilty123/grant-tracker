import { describe, it, expect } from 'vitest'
import { plural, verb, spell, spellCap, daysUntil, humanDate, countdown, amountLabel, metaLine, esc } from './text'

describe('plurals', () => {
  it('agrees the noun', () => {
    expect(plural(1, 'grant')).toBe('1 grant')
    expect(plural(3, 'grant')).toBe('3 grants')
    expect(plural(0, 'grant')).toBe('0 grants')
  })

  it('takes an explicit plural for irregulars', () => {
    expect(plural(1, 'new match', 'new matches')).toBe('1 new match')
    expect(plural(3, 'new match', 'new matches')).toBe('3 new matches')
    expect(plural(1, 'opportunity', 'opportunities')).toBe('1 opportunity')
    expect(plural(24, 'opportunity', 'opportunities')).toBe('24 opportunities')
  })

  it('agrees the verb — the exact bug that shipped last time', () => {
    // The previous send read "We found 1 grant that match your profile".
    expect(`${plural(1, 'grant')} that ${verb(1, 'matches', 'match')}`).toBe('1 grant that matches')
    expect(`${plural(3, 'grant')} that ${verb(3, 'matches', 'match')}`).toBe('3 grants that match')
  })

  it('spells small numbers and leaves large ones as numerals', () => {
    expect(spell(1)).toBe('one')
    expect(spell(10)).toBe('ten')
    expect(spell(11)).toBe('11')
    expect(spellCap(3)).toBe('Three')
  })
})

describe('countdown tile', () => {
  it('never reads "1 days"', () => {
    expect(countdown(1)).toEqual({ n: '1', unit: 'day' })
    expect(countdown(6)).toEqual({ n: '6', unit: 'days' })
  })
  it('says today rather than "0 days"', () => {
    expect(countdown(0).unit).toBe('today')
  })
})

describe('dates', () => {
  const from = new Date('2026-09-01T12:00:00Z')
  it('counts whole days regardless of time of day', () => {
    expect(daysUntil('2026-09-10', from)).toBe(9)
    expect(daysUntil('2026-09-01', from)).toBe(0)
    expect(daysUntil('2026-08-30', from)).toBe(-2)
  })
  it('formats without a year', () => {
    expect(humanDate('2026-10-14')).toBe('14 October')
  })
})

describe('amount line', () => {
  it('returns null rather than a placeholder when there is nothing to say', () => {
    // "Amount varies" is banned as a headline figure; the caller drops the
    // segment instead of printing a shrug.
    expect(amountLabel(null, null)).toBeNull()
    expect(amountLabel(0, 0)).toBeNull()
  })
  it('renders the shapes it can', () => {
    expect(amountLabel(5000, 25000)).toBe('£5,000–£25,000')
    expect(amountLabel(null, 15000)).toBe('Up to £15,000')
    expect(amountLabel(1000, null)).toBe('From £1,000')
    expect(amountLabel(5000, 5000)).toBe('£5,000')
  })
  it('says so when the funder publishes none', () => {
    expect(amountLabel(null, null, true)).toBe('Amount not published')
  })
})

describe('meta line', () => {
  it('drops absent parts so there are no stranded separators', () => {
    expect(metaLine(['Ealing Council', null, 'closes 10 Sep'])).toBe('Ealing Council · closes 10 Sep')
    expect(metaLine([null, undefined, ''])).toBe('')
  })
})

describe('escaping', () => {
  it('escapes a funder name carrying an ampersand', () => {
    // "Hammersmith & Fulham" appears in real rows and must not break the HTML.
    expect(esc('Hammersmith & Fulham')).toBe('Hammersmith &amp; Fulham')
    expect(esc('<script>')).toBe('&lt;script&gt;')
  })
})
