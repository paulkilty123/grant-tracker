import { describe, it, expect } from 'vitest'
import { extractTagsDiff } from './review-reasons'

/** The blob reenrich-stale leaves behind: what the last re-classify changed. */
const prov = {
  pipeline_state: {
    diff: {
      impact_sectors:       { before: ['sport', 'young_people'], after: ['sport'] },
      target_beneficiaries: { before: ['young_people', 'women_girls'], after: ['women_girls'] },
    },
  },
}

describe('a change still in effect', () => {
  it('is reported, with what went and what came', () => {
    const d = extractTagsDiff(prov, { impact_sectors: ['sport'], target_beneficiaries: ['women_girls'] })
    expect(d.map(x => x.field)).toEqual(['impact_sectors', 'target_beneficiaries'])
    expect(d[0].removed).toEqual(['young_people'])
  })

  it('survives a reordered list — order is not a change', () => {
    const d = extractTagsDiff(
      { pipeline_state: { diff: { impact_sectors: { before: ['a'], after: ['x', 'y'] } } } },
      { impact_sectors: ['y', 'x'] },
    )
    expect(d).toHaveLength(1)
  })
})

describe('a change the reviewer has already dealt with', () => {
  // Football Foundation, Grass Pitch Maintenance Fund, 2026-08-17: three presses
  // of "Put it back", all three writes landed, and the card offered all three
  // again. The stored blob records a past event and nothing clears it, so the
  // row's CURRENT value has to be what decides.
  it('drops the diff once the field is put back', () => {
    const d = extractTagsDiff(prov, {
      impact_sectors:       ['sport', 'young_people'],
      target_beneficiaries: ['young_people', 'women_girls'],
    })
    expect(d).toEqual([])
  })

  it('drops it for an edit to a third value, not just an exact undo', () => {
    const d = extractTagsDiff(prov, { impact_sectors: ['sport', 'education'], target_beneficiaries: ['women_girls'] })
    expect(d.map(x => x.field)).toEqual(['target_beneficiaries'])
  })
})

describe('when the caller did not select the column', () => {
  // A query missing the column reads undefined, which is not "no longer equal
  // to after" — it is no information. Hiding on it would silently drop every
  // diff for that field.
  it('keeps the diff rather than clearing it on absent data', () => {
    expect(extractTagsDiff(prov, { impact_sectors: ['sport'] })).toHaveLength(2)
    expect(extractTagsDiff(prov, {})).toHaveLength(2)
    expect(extractTagsDiff(prov)).toHaveLength(2)
    expect(extractTagsDiff(prov, null)).toHaveLength(2)
  })

  it('keeps it when the column holds something that is not a tag list', () => {
    expect(extractTagsDiff(prov, { impact_sectors: null, target_beneficiaries: 'sport' })).toHaveLength(2)
  })
})

describe('nothing to report', () => {
  it('returns empty without a diff blob', () => {
    expect(extractTagsDiff(null)).toEqual([])
    expect(extractTagsDiff({ pipeline_state: { source: 'x' } })).toEqual([])
  })
})
