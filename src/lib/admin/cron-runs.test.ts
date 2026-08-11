import { describe, it, expect } from 'vitest'
import { formatYield } from './cron-runs'

describe('formatYield', () => {
  // The exact summary process-discovery-queue wrote on 2026-08-11 23:05:45,
  // copied from cron_runs rather than invented, so this test fails if the
  // producer's shape and the renderer's expectation ever drift apart.
  const real = {
    ok: true,
    processed: 10,
    imported: 10,
    yield: {
      found:     { grant: 5, programme: 5 },
      inReview:  { grant: 8, in_kind: 1, programme: 13, investment: 1, blended_finance: 3 },
      published: { grant: 9, programme: 1, investment: 1 },
    },
  }

  it('renders a real recorded summary', () => {
    expect(formatYield(real)).toBe(
      'found 10 (grant 5, prog 5) · 26 in review · 11 published (grant 9, inv 1, prog 1)',
    )
  })

  it('shortens the four catalogue types and passes anything else through', () => {
    const out = formatYield({ yield: { found: { in_kind: 2, blended_finance: 1 } } })
    expect(out).toBe('found 3 (in-kind 2, blended_finance 1)')
  })

  it('returns null when the run reported no yield, so the page renders one line', () => {
    expect(formatYield({ processed: 4 })).toBeNull()
    expect(formatYield(null)).toBeNull()
    expect(formatYield(undefined)).toBeNull()
  })

  it('survives a run that found nothing', () => {
    expect(formatYield({ yield: { found: {} } })).toBe('found 0')
  })

  it('omits the funnel when only `found` is present, as discover-sweep reports', () => {
    expect(formatYield({ yield: { found: { grant: 2 } } })).toBe('found 2 (grant 2)')
  })

  it('ignores zero counts rather than printing "grant 0"', () => {
    expect(formatYield({ yield: { found: { grant: 3, in_kind: 0 } } })).toBe('found 3 (grant 3)')
  })
})
