import { describe, it, expect } from 'vitest'
import { structureIsLimiting, type StructureCount } from './structure-opportunity'

const c = (structure: string, eligible: number, current = false) =>
  ({ structure, eligible, current }) as StructureCount

describe('structureIsLimiting', () => {
  it('fires for a not-yet-registered org, which is the case it exists for', () => {
    // The real ASP Belong shape: 25 eligible now, 296 if constituted.
    expect(structureIsLimiting([
      c('unincorporated', 296),
      c('registered_charity', 280),
      c('not_registered', 25, true),
    ])).toBe(true)
  })

  it('stays quiet when the org already has the most open structure', () => {
    expect(structureIsLimiting([
      c('registered_charity', 564, true),
      c('cic_guarantee', 454),
    ])).toBe(false)
  })

  it('stays quiet for a gap that is real but not worth changing legal form over', () => {
    // 40 more rows, but not double. Nagging a charity to become a CIO over
    // this would be worse than saying nothing.
    expect(structureIsLimiting([
      c('cic_guarantee', 300),
      c('registered_charity', 260, true),
    ])).toBe(false)
  })

  it('stays quiet when the ratio is big but the absolute gap is tiny', () => {
    // 4x more, but 12 extra rows is noise on a 639-row catalogue.
    expect(structureIsLimiting([
      c('cic_guarantee', 16),
      c('sole_trader', 4, true),
    ])).toBe(false)
  })

  it('stays quiet when the current structure is unknown', () => {
    expect(structureIsLimiting([c('registered_charity', 564), c('cic_guarantee', 454)])).toBe(false)
  })
})
