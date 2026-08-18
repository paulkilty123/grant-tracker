import { describe, it, expect } from 'vitest'
import {
  __normaliseGovUkAwardForTests as normaliseGovUkAward,
  __normaliseFindAGrantForTests as normaliseFindAGrant,
} from './crawl'

/**
 * gov.uk's Find a Grant schema requires numeric minimum AND maximum award
 * fields, so a funder with no real figure to give enters a token one and
 * nothing on gov.uk's end flags it. Two live cases:
 *
 *   - BFI's UK Global Screen Fund rows read "from just £1" (fixed by hand on
 *     23 June, reverted by the daily crawl on 14 July, fixed in code after).
 *   - DBIST's AI Growth Lab advertised a maximum of £2 while its own page said
 *     twice that "Participants will not receive funding" (found 18 August).
 *     The minimum placeholder was already stripped, so the max survived alone.
 *
 * The second case is the reason these tests exist: the normaliser was only
 * ever wired to amount_min, and a max-side placeholder walked straight through.
 */
describe('normaliseGovUkAward', () => {
  it('strips the £1 minimum placeholder', () => {
    expect(normaliseGovUkAward(1, 1)).toBeNull()
  })

  it('strips the £2 maximum placeholder', () => {
    // The regression. Before the fix amount_max was copied verbatim and this
    // returned 2, putting "up to £2" on a card for a programme paying nothing.
    expect(normaliseGovUkAward(2, 2)).toBeNull()
  })

  it('keeps £2 as a minimum, because only the maximum uses the higher floor', () => {
    // The two floors are deliberately different. A £2 minimum is a real, if
    // odd, figure; a £2 maximum cannot be.
    expect(normaliseGovUkAward(2, 1)).toBe(2)
  })

  it('leaves genuine micro-grant figures alone', () => {
    // The floors stay at 1 and 2 so real sub-£100 awards survive. Widening
    // them to "anything under £100 is a placeholder" would eat these.
    expect(normaliseGovUkAward(10, 1)).toBe(10)
    expect(normaliseGovUkAward(50, 2)).toBe(50)
    expect(normaliseGovUkAward(250, 2)).toBe(250)
  })

  it('treats a missing or non-numeric award as no stated figure', () => {
    expect(normaliseGovUkAward(undefined, 2)).toBeNull()
    expect(normaliseGovUkAward(null, 2)).toBeNull()
    expect(normaliseGovUkAward('2', 2)).toBeNull()
  })
})

/**
 * The helper tests above pass even when nothing calls the helper, which is
 * exactly the state the AI Growth Lab bug lived in: normaliseGovUkAward was
 * correct and complete, and amount_max simply never went through it. These
 * drive the real record so the wiring itself is what is under test.
 */
describe('normaliseFindAGrant, on the record that carried the bug', () => {
  // Trimmed from the row's stored raw_data, verbatim.
  const aiGrowthLab = {
    label: 'ai-growth-labs-1',
    grantName: 'AI Growth Lab',
    grantFunder: 'Department for Business, Innovation, Science and Trade',
    grantLocation: ['National'],
    grantApplicantType: ['Non-profit', 'Private Sector'],
    grantMinimumAward: 1,
    grantMaximumAward: 2,
    grantTotalAwardAmount: 6900000,
    grantShortDescription: 'Participants will not receive funding.',
  }

  it('stores no maximum for a programme that pays nothing', () => {
    expect(normaliseFindAGrant(aiGrowthLab)?.amount_max).toBeNull()
  })

  it('stores no minimum either', () => {
    expect(normaliseFindAGrant(aiGrowthLab)?.amount_min).toBeNull()
  })

  it('does not mistake the £6.9m scheme total for a per-applicant award', () => {
    const row = normaliseFindAGrant(aiGrowthLab)
    expect(row?.amount_max).not.toBe(6900000)
    expect(row?.amount_min).not.toBe(6900000)
  })

  it('still carries a real award range straight through', () => {
    const row = normaliseFindAGrant({
      ...aiGrowthLab,
      grantMinimumAward: 5000,
      grantMaximumAward: 250000,
    })
    expect(row?.amount_min).toBe(5000)
    expect(row?.amount_max).toBe(250000)
  })
})
