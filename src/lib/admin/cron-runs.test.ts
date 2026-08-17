import { describe, it, expect } from 'vitest'
import { formatYield, formatVerify, reapAbandonedRuns } from './cron-runs'

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

  // Paul's condition on approving the backoff, 2026-08-16: "Shape C's count goes
  // on the Pipeline line beside live_unbacked from day one, so a deferred gap
  // never reads as a closed one."
  describe('the standing gaps', () => {
    const WITH_QUEUE = {
      ...REAL,
      queue: {
        eligible: 963, neverChecked: 291, band0: 341, excluded: 918,
        liveUnbacked: 341, liveUnbackedDue: 341,
        timingUnknown: 378, timingUnknownLive: 318, flagged: 0,
      },
    }

    it('puts the two standing counts on the line', () => {
      expect(formatVerify(WITH_QUEUE)).toContain('queue: 341 claimed, 378 unknown')
    })

    it('shows a zero rather than dropping the segment', () => {
      // A line that only appears while the news is bad teaches a reader to stop
      // looking for it, and "unknown 0" is the thing we are working towards.
      const clean = { ...WITH_QUEUE, queue: { ...WITH_QUEUE.queue, liveUnbacked: 0, timingUnknown: 0 } }
      expect(formatVerify(clean)).toContain('queue: 0 claimed, 0 unknown')
    })

    it('leads with flagged rows when something says a page changed', () => {
      const flagged = { ...WITH_QUEUE, queue: { ...WITH_QUEUE.queue, flagged: 3 } }
      expect(formatVerify(flagged)).toContain('queue: 3 flagged, 341 claimed, 378 unknown')
    })

    // 2026-08-17. 29 live rows were in a conflicting admin state and, because of
    // it, excluded from verification entirely: 21 published rows still carrying
    // a "review and activate" note from the July gap audits, and 8 that are
    // is_active while pipeline_state says archived. Nothing on any screen said
    // so, and the coverage number could not reach its own total.
    it('carries the live rows in two states, so the desync cannot hide again', () => {
      const conflict = { ...WITH_QUEUE, queue: { ...WITH_QUEUE.queue, liveStateConflict: 29 } }
      expect(formatVerify(conflict))
        .toContain('queue: 341 claimed, 378 unknown, 29 in two states')
    })

    it('shows it at zero too, which is the state being worked towards', () => {
      const settled = { ...WITH_QUEUE, queue: { ...WITH_QUEUE.queue, liveStateConflict: 0 } }
      expect(formatVerify(settled)).toContain('0 in two states')
    })

    it('renders nothing extra for a run predating the counts', () => {
      // REAL is a real summary from before this shipped. It must still render.
      expect(formatVerify(REAL)).not.toContain('queue:')
    })
  })

  it('reports a disarmed run as checking nothing rather than as no line at all', () => {
    // A disarmed run carries no `verify` block, so it falls to null and the row
    // keeps its single-line height. The armed-but-empty case still renders.
    expect(formatVerify({ armed: false, ranWork: false, checked: 0 })).toBeNull()
    expect(formatVerify({ checked: 0, verify: { evidence: {} } })).toBe('checked 0')
  })
})

// A stand-in for the query builder, recording the predicate chain so the test
// can assert WHICH rows would be touched. The bug this guards against is a reap
// that is too eager, and that lives entirely in the predicates.
type Call = { table?: string; update?: Record<string, unknown>; preds: string[] }
function fakeDb(rows: { id: string; job: string }[], error: { message: string } | null = null) {
  const calls: Call[] = []
  let cur: Call
  const chain = {
    is(col: string, v: unknown)  { cur.preds.push(`is:${col}=${String(v)}`); return chain },
    lt(col: string, v: unknown)  { cur.preds.push(`lt:${col}=${String(v)}`); return chain },
    select()                     { return Promise.resolve({ data: error ? null : rows, error }) },
  }
  const db = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          cur = { table, update: patch, preds: [] }; calls.push(cur); return chain
        },
      }
    },
  }
  return { db: db as unknown as Parameters<typeof reapAbandonedRuns>[0], calls }
}

describe('reapAbandonedRuns — the failure that cannot report itself', () => {
  const NOW = new Date('2026-08-16T12:00:00.000Z')

  it('closes an abandoned run as FAILED, not as some new fourth state', () => {
    // ok=false is what the Pipeline page already renders red. Inventing a
    // separate "abandoned" state would mean a second signal for someone to not
    // watch; the whole point is that a killed job shows up in the place people
    // already look.
    const { db, calls } = fakeDb([{ id: 'r1', job: 'discover-sweep' }])
    return reapAbandonedRuns(db, NOW).then(n => {
      expect(n).toBe(1)
      expect(calls[0].table).toBe('cron_runs')
      expect(calls[0].update?.ok).toBe(false)
      expect(calls[0].update?.finished_at).toBe(NOW.toISOString())
      expect(String(calls[0].update?.error)).toMatch(/never reported back/)
    })
  })

  it('only touches rows that are open AND older than fifteen minutes', () => {
    // 300s is Vercel's hard cap, so fifteen minutes is five times the longest
    // legitimate run. A false reap marks a healthy job failed, which is a worse
    // lie than the silence it replaces.
    const { db, calls } = fakeDb([])
    return reapAbandonedRuns(db, NOW).then(() => {
      expect(calls[0].preds).toEqual([
        'is:ok=null',
        'is:finished_at=null',
        'lt:started_at=2026-08-16T11:45:00.000Z',
      ])
    })
  })

  it('returns zero and does not throw when the database refuses', async () => {
    // Bookkeeping that can break the job it observes is worse than none. This
    // runs at the top of every recordRun, so a throw here would take out every
    // cron on the platform at once.
    const { db } = fakeDb([], { message: 'permission denied' })
    await expect(reapAbandonedRuns(db, NOW)).resolves.toBe(0)
  })
})
