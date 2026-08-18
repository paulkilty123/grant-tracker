import { describe, it, expect } from 'vitest'
import { buildAwardText, extractGrantAmounts } from './grant-amounts'

const amounts = (t: string) => extractGrantAmounts(buildAwardText([t]))
const max     = (t: string) => amounts(t).amount_max

// ─────────────────────────────────────────────────────────────────────────────
// This file did not exist until 2026-08-18, which is why a regex tuned against a
// dozen named production cases could be edited with the suite still green. Each
// case below is a real catalogue row, named, so a future simplification has to
// argue with the evidence rather than with a threshold.
// ─────────────────────────────────────────────────────────────────────────────

describe('a per-grant figure is kept', () => {
  it('reads a plain ceiling', () => {
    expect(max('Grants of up to £2,000 for small local organisations.')).toBe(2000)
  })

  it('keeps a per-grant rate that happens to be annual', () => {
    // 'per year' looks pool-shaped; the 'up to' in front settles it.
    expect(max('Up to £5,000 per year for up to three years.')).toBe(5000)
  })

  it('keeps a range and reads both ends', () => {
    const a = amounts('Grants range from £2,000 to £10,000 per year.')
    expect(a).toMatchObject({ amount_min: 2000, amount_max: 10000 })
  })

  it('keeps a bare "£10,000 fund", where fund is just the noun', () => {
    expect(max('Applications to the £10,000 fund are open.')).toBe(10000)
  })

  it('amplifies a multi-year commitment to its real ceiling (Trusthouse)', () => {
    expect(max('Grants of up to £50,000/year for up to 3 years.')).toBe(150000)
  })
})

describe('a fund total is not a per-applicant figure', () => {
  it('drops the pot and keeps the cap (Havering Community Chest)', () => {
    const a = amounts(
      'Up to £5,000 per project. Total funding available is approximately £100,000 '
      + '(£80,000 from NHS partners and circa £20,000 from the council).')
    expect(a).toMatchObject({ amount_max: 5000, amount_min: null })
  })

  it('drops an annual pool range (Sterry Family Foundation)', () => {
    expect(max('The Trust awards between £80,000 and £100,000 annually in total.')).toBeNull()
  })

  it('drops a total-awarded range (Adint)', () => {
    expect(max('The total awarded each year is around £450,000–£470,000.')).toBeNull()
  })

  it('drops a named-programme size (Stronger Futures)', () => {
    const a = amounts('The £4m Stronger Futures Programme 3.0 awards grants of £80,000 to £200,000.')
    expect(a.amount_max).toBe(200000)
  })

  it('drops a bare "a total £50 million" (Change Makers)', () => {
    expect(max('Awards are made from a total £50 million programme.')).toBeNull()
  })

  it('drops a fund-level investment commitment (Heritage in Need)', () => {
    expect(max('The funder will invest a minimum of £15 million across all projects.')).toBeNull()
  })

  it('drops "a share of up to £25 million" (Consumer Led Flexibility)', () => {
    expect(max('Organisations can apply for a share of up to £25 million.')).toBeNull()
  })

  it('drops a parenthesised programme total (Nesta)', () => {
    expect(max('Awards to £40 million (major sector programmes).')).toBeNull()
  })
})

describe('cases found live on 2026-08-18', () => {
  it('an applicant income band is eligibility, not a grant (Fishmongers)', () => {
    // Was returning £5,000,000 as the ceiling and disputing a correct £90,000.
    const a = amounts(
      'Grants of £15,000 to £30,000 a year, up to a maximum of £90,000 over three years. '
      + 'Applicant annual income must be between £250,000 and £5,000,000.')
    expect(a.amount_max).toBe(90000)
  })

  it('"available annually" belongs to the fund, even after "up to" (Beinneun)', () => {
    expect(max('The fund has up to £500,000 available annually.')).toBeNull()
  })

  it('"award up to £2m annually in one round" is the round, not the grant (Jerwood)', () => {
    const a = amounts(
      'Grants range from approximately £10,657 to £200,000 per award, '
      + 'with ambition to award up to £2m annually in one open round per year.')
    expect(a.amount_max).toBe(200000)
  })

  it('a rhetorical £1 is not a grant ceiling (Crowdfunder)', () => {
    // £1 became the derived per-applicant max, making a correct £25,000 look
    // 25,000x too large and raising a BLOCKING flag.
    expect(max('If the funder offers 1:1 matching, every £1 raised from the public is doubled.'))
      .toBeNull()
  })
})

describe('max_cued — may this figure argue with a stored amount', () => {
  it('true for an explicit per-grant ceiling', () => {
    expect(amounts('Grants of up to £20,000.').max_cued).toBe(true)
  })

  it('true for a per-grant framed range', () => {
    expect(amounts('Awards of £5,000 to £25,000.').max_cued).toBe(true)
  })

  it('false for a bare figure sitting in prose', () => {
    // The whole point: an uncued figure is a number in a sentence, and must not
    // be allowed to contradict a stored per-applicant amount.
    const a = amounts('Last year the foundation supported 40 charities and £850,000 went to youth work.')
    expect(a.amount_max).toBe(850000)
    expect(a.max_cued).toBe(false)
  })

  it('false when nothing is derivable', () => {
    expect(amounts('No fixed amount is stated.').max_cued).toBe(false)
    expect(amounts('').max_cued).toBe(false)
  })
})

describe('input it must not throw on', () => {
  it('handles empty and junk', () => {
    expect(amounts('')).toEqual({ amount_min: null, amount_max: null, max_cued: false })
    expect(amounts('£')).toEqual({ amount_min: null, amount_max: null, max_cued: false })
  })

  it('never returns a minimum at or above the maximum', () => {
    const a = amounts('Grants of up to £5,000. Total pot £100,000 per year.')
    expect(a.amount_min === null || a.amount_min < (a.amount_max ?? 0)).toBe(true)
  })
})
