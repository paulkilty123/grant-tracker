import { describe, it, expect } from 'vitest'
import { formatYield, formatVerify } from './cron-runs'

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

describe('formatVerify', () => {
  // Copied from the summary a real local run returned, not invented, so the
  // producer's shape is pinned to the renderer's expectation. If verify-rows
  // renames a key this test fails rather than the line quietly going blank.
  const REAL = {
    success: true, armed: false, ranWork: true, checked: 3, requested: 3,
    stoppedEarly: false, remaining: 0, elapsedMs: 4912,
    queue: { eligible: 958, neverChecked: 954, band0: 508, excluded: 915 },
    verify: {
      outcomes: { fixable_link: 1, verified: 2 },
      evidence: { confirmed: 4, contradicted: 0, silent: 8, unquoted: 0 },
      proposals: 0, fixableLinks: 1, failures: 0,
    },
  }

  it('renders the run that actually happened', () => {
    expect(formatVerify(REAL)).toBe('checked 3 · 4 confirmed, 8 unread · 1 link to fix')
  })

  it('says when a run stopped on the clock, and how much is left', () => {
    expect(formatVerify({ ...REAL, stoppedEarly: true, remaining: 41 }))
      .toBe('checked 3 · 4 confirmed, 8 unread · 1 link to fix · stopped on the clock, 41 left')
  })

  it('names contradictions and pluralises proposals', () => {
    const s = { checked: 12, verify: { evidence: { confirmed: 30, contradicted: 4, silent: 38 }, proposals: 4 } }
    expect(formatVerify(s)).toBe('checked 12 · 30 confirmed, 4 contradicted, 38 unread · 4 proposals')
    const one = { checked: 1, verify: { evidence: { confirmed: 1 }, proposals: 1, fixableLinks: 1 } }
    expect(formatVerify(one)).toBe('checked 1 · 1 confirmed · 1 proposal · 1 link to fix')
  })

  it('is null for every other job, so no other row grows a second line', () => {
    expect(formatVerify({ processed: 4 })).toBeNull()
    expect(formatVerify({ yield: { found: { grant: 2 } } })).toBeNull()
    expect(formatVerify(null)).toBeNull()
    expect(formatVerify(undefined)).toBeNull()
  })

  it('reports a disarmed run as checking nothing rather than as no line at all', () => {
    // A disarmed run carries no `verify` block, so it falls to null and the row
    // keeps its single-line height. The armed-but-empty case still renders.
    expect(formatVerify({ armed: false, ranWork: false, checked: 0 })).toBeNull()
    expect(formatVerify({ checked: 0, verify: { evidence: {} } })).toBe('checked 0')
  })
})
