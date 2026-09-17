import { describe, it, expect } from 'vitest'
import { betweenRoundsChip, betweenRoundsDeadlineText } from './utils'

const nextYear = new Date().getFullYear() + 1

describe('betweenRoundsChip', () => {
  it('names the month for a fund closed today with a dated reopening', () => {
    const g = { isRolling: false, deadline: null, nextOpenDate: `Applications open in January ${nextYear}.` }
    expect(betweenRoundsChip(g)).toBe(`Opens Jan ${nextYear}`)
    expect(betweenRoundsDeadlineText(g)).toBe(`Closed, reopens Jan ${nextYear}`)
  })
  it('is absent for open, rolling and dated funds, so absence means open', () => {
    expect(betweenRoundsChip({ isRolling: true, deadline: null, nextOpenDate: `January ${nextYear}` })).toBeNull()
    expect(betweenRoundsChip({ isRolling: false, deadline: `${nextYear}-03-01`, nextOpenDate: `January ${nextYear}` })).toBeNull()
    expect(betweenRoundsChip({ isRolling: false, deadline: null, nextOpenDate: null })).toBeNull()
  })
  it('says closed for now when the reopening cannot be dated, with no dash', () => {
    const g = { isRolling: false, deadline: null, nextOpenDate: 'TBC, between rounds' }
    expect(betweenRoundsChip(g)).toBe('Closed for now')
    expect(betweenRoundsDeadlineText(g)).toBe('Closed, check funder')
    expect(betweenRoundsDeadlineText(g)).not.toMatch(/[—–]/)
  })
  it('carries the earliest-year and around-month phrasings through', () => {
    expect(betweenRoundsChip({ isRolling: false, deadline: null, nextOpenDate: `Not before ${nextYear}` })).toBe(`Opens ${nextYear} at the earliest`)
    expect(betweenRoundsDeadlineText({ isRolling: false, deadline: null, nextOpenDate: 'late November' })).toBe('Closed, reopens around Nov')
  })
})
