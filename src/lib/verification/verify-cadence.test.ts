import { describe, it, expect } from 'vitest'
import {
  computeCadence, futureCheckpoints, previousSilentStreak,
  ALWAYS_OPEN_DAYS, LONG_STOP_DAYS, SILENT_BACKOFF_DAYS, OPEN_LEAD_DAYS,
} from './verify-cadence'
import type { FieldEvidence } from '@/lib/field-evidence'

const NOW = new Date('2026-08-16T09:00:00Z')

/** A quoted agreement — the only thing that counts as confirmation. */
function confirmed(field: string, quote = 'Applications are accepted at any time.'): FieldEvidence {
  return {
    [field]: {
      quote, source_url: 'https://example.org/fund', checked_at: NOW.toISOString(),
      by: 'verify:v1', agrees: true,
    },
  }
}

/** Read, and the page said nothing about it. */
function silent(field: string): FieldEvidence {
  return {
    [field]: {
      quote: null, source_url: 'https://example.org/fund', checked_at: NOW.toISOString(),
      by: 'verify:v1', agrees: null,
    },
  }
}

const BARE = { deadline: null, next_open_date: null, deadline_cycle: null, evidence: null }

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('shape B — dated', () => {
  it('checks the day after a closing date, not on a clock', () => {
    const d = computeCadence({ ...BARE, deadline: '2026-09-30' }, { checkedAt: NOW })
    expect(d.shape).toBe('dated')
    expect(iso(d.dueAt)).toBe('2026-10-01')
  })

  it('checks ahead of an opening date, then again the day after it', () => {
    // next_open_date is 60 days out, so the run-up checkpoint is the near one.
    const far = computeCadence({ ...BARE, next_open_date: '2026-10-15' }, { checkedAt: NOW })
    expect(iso(far.dueAt)).toBe('2026-10-05')   // D − OPEN_LEAD_DAYS

    // Read INSIDE the run-up window: the run-up checkpoint is behind us, so the
    // next one is the day after the opening. This is the case a stored interval
    // could not express and the reason a due date is a checkpoint.
    const inside = computeCadence({ ...BARE, next_open_date: '2026-08-20' }, { checkedAt: NOW })
    expect(iso(inside.dueAt)).toBe('2026-08-21')
  })

  // The London LGBT+ Fund's real schedule, which is also the row that exposed
  // the third-date-type bug in deadline-cycle.ts.
  const LGBT_CYCLE = [
    { day: 17, month: 6,  label: 'Fund launches' },
    { day: 12, month: 8,  label: 'Application window closes' },
    { day: 30, month: 11, label: 'Outcomes communicated' },
  ]

  it('reads a yearless cycle the day after it closes', () => {
    const d = computeCadence(
      { ...BARE, deadline_cycle: LGBT_CYCLE },
      { checkedAt: new Date('2026-08-01T09:00:00Z') },
    )
    expect(d.shape).toBe('dated')
    // Not 30 November, which is when outcomes go out, and not 17 June, which is
    // when the fund opens. The day after the window shuts.
    expect(iso(d.dueAt)).toBe('2026-08-13')
  })

  it('rolls the same cycle into next year once this year has passed', () => {
    const d = computeCadence(
      { ...BARE, deadline_cycle: LGBT_CYCLE },
      { checkedAt: new Date('2027-01-04T09:00:00Z') },
    )
    // 7 June 2027 — the run-up to the launch, ten days ahead of 17 June.
    expect(iso(d.dueAt)).toBe('2027-06-07')
  })

  it('applies the long stop when the whole cycle is beyond the horizon', () => {
    // From 16 August the next thing worth reading is June 2027, ten months out.
    // Six months is the most any row waits.
    const d = computeCadence({ ...BARE, deadline_cycle: LGBT_CYCLE }, { checkedAt: NOW })
    expect(d.days).toBe(LONG_STOP_DAYS)
    expect(d.reason).toContain('2027-06-07')
    expect(d.reason).toContain('long stop')
  })

  it('never schedules a read off a post-decision entry', () => {
    const outcomesOnly = [{ day: 30, month: 11, label: 'Outcomes communicated' }]
    expect(futureCheckpoints({ ...BARE, deadline_cycle: outcomesOnly }, NOW)).toEqual([])
  })

  it('caps a distant checkpoint at the long stop', () => {
    const d = computeCadence({ ...BARE, deadline: '2027-12-01' }, { checkedAt: NOW })
    expect(d.days).toBe(LONG_STOP_DAYS)
    expect(d.reason).toContain('long stop')
  })

  it('drops an impossible day rather than letting it roll into the next month', () => {
    // Date.UTC(2026, 1, 31) is 3 March. A cycle claiming 31 February is data we
    // cannot honour, and scheduling against a silently corrected date is how a
    // wrong answer looks plausible.
    const d = futureCheckpoints({ ...BARE, deadline_cycle: [{ day: 31, month: 2 }] }, NOW)
    expect(d).toEqual([])
  })

  it('does not rest a row whose only dates have expired', () => {
    // The dated long stop would give this row a 180-day nap. It holds a deadline
    // that has gone, which is a claim a user can see and not a settled state, so
    // it falls through to the short end of the silent backoff instead.
    const d = computeCadence(
      { ...BARE, deadline: '2026-01-05', evidence: silent('deadline') },
      { checkedAt: NOW },
    )
    expect(d.shape).toBe('silent')
    expect(d.days).toBe(SILENT_BACKOFF_DAYS[0])
  })
})

describe('shape A — evidenced always-open', () => {
  it('waits half a year when the page states year-round and we hold the quote', () => {
    const d = computeCadence({ ...BARE, evidence: confirmed('is_rolling') }, { checkedAt: NOW })
    expect(d.shape).toBe('always_open')
    expect(d.days).toBe(ALWAYS_OPEN_DAYS)
  })

  it('is not entered on an unquoted rolling flag', () => {
    // `is_rolling = true` on the ROW is a claim; only a quote is evidence. A row
    // asserting rolling with nothing behind it is the whole reason band 0 exists
    // and must not be handed a 180-day nap.
    const d = computeCadence({ ...BARE, evidence: silent('is_rolling') }, { checkedAt: NOW })
    expect(d.shape).toBe('silent')
    expect(d.days).toBe(SILENT_BACKOFF_DAYS[0])
  })

  // ── Paul's condition, 2026-08-16 ──────────────────────────────────────────
  // "Shape A needs its own escape hatch: if an always-open row's page later
  //  shows dates, it must leave shape A immediately rather than waiting out its
  //  180 days — you've said it does, just make it a test."
  //
  // This is the in-process half. The other half is migration 056's trigger,
  // which clears `verify_due_at` when a timing column changes from ANY write
  // path, so a date arriving between reads makes the row due at once. That half
  // is proved against the database in the migration's own DO block.
  describe('escape hatch: a date always beats a confirmed rolling flag', () => {
    it('leaves shape A the moment a deadline appears', () => {
      const evidence = confirmed('is_rolling')
      const before = computeCadence({ ...BARE, evidence }, { checkedAt: NOW })
      expect(before.shape).toBe('always_open')
      expect(before.days).toBe(180)

      const after = computeCadence({ ...BARE, evidence, deadline: '2026-09-30' }, { checkedAt: NOW })
      expect(after.shape).toBe('dated')
      expect(iso(after.dueAt)).toBe('2026-10-01')
      expect(after.days).toBeLessThan(ALWAYS_OPEN_DAYS)
    })

    it('leaves shape A the moment a reopen date appears', () => {
      const after = computeCadence(
        { ...BARE, evidence: confirmed('is_rolling'), next_open_date: '2026-11-01' },
        { checkedAt: NOW },
      )
      expect(after.shape).toBe('dated')
      expect(iso(after.dueAt)).toBe('2026-10-22')   // 1 Nov − OPEN_LEAD_DAYS
      expect(after.days).toBeLessThan(ALWAYS_OPEN_DAYS)
    })

    it('leaves shape A the moment a round schedule appears', () => {
      const after = computeCadence(
        { ...BARE, evidence: confirmed('is_rolling'), deadline_cycle: [{ day: 1, month: 10 }] },
        { checkedAt: NOW },
      )
      expect(after.shape).toBe('dated')
      expect(iso(after.dueAt)).toBe('2026-10-02')
      expect(after.days).toBeLessThan(ALWAYS_OPEN_DAYS)
    })
  })
})

describe('shape C — silent, backing off', () => {
  it('doubles the gap on each consecutive silence and then caps', () => {
    const runs = [0, 1, 2, 3, 4, 5, 9].map(previousStreak =>
      computeCadence({ ...BARE, evidence: silent('deadline') }, { checkedAt: NOW, previousStreak }))
    expect(runs.map(r => r.days)).toEqual([14, 28, 56, 112, 180, 180, 180])
    expect(runs.map(r => r.silentStreak)).toEqual([1, 2, 3, 4, 5, 6, 10])
    expect(runs.every(r => r.shape === 'silent')).toBe(true)
  })

  it('resets the streak the moment the page answers', () => {
    // A contradiction is an answer. The row has no dates yet — the correction is
    // still only a proposal — but the page IS talking about timing, so it goes
    // back on a short leash rather than continuing to back off.
    const contradicts: FieldEvidence = {
      deadline: {
        quote: 'The 2026 round has now closed.', source_url: 'https://example.org/f',
        checked_at: NOW.toISOString(), by: 'verify:v1', agrees: false,
      },
    }
    const d = computeCadence({ ...BARE, evidence: contradicts }, { checkedAt: NOW, previousStreak: 4 })
    expect(d.silentStreak).toBe(0)
    expect(d.days).toBe(SILENT_BACKOFF_DAYS[0])
  })

  it('treats a stated schedule as a timing answer even when the fields are silent', () => {
    const d = computeCadence(
      { ...BARE, evidence: confirmed('deadline_cycle', 'Rounds close in March and September.') },
      { checkedAt: NOW, previousStreak: 3 },
    )
    expect(d.silentStreak).toBe(0)
  })

  it('reads the previous streak off the page-read stamp, and survives junk', () => {
    expect(previousSilentStreak({
      _page_read: { quote: null, source_url: null, checked_at: NOW.toISOString(), by: 'v', agrees: null, silent_streak: 3 },
    })).toBe(3)
    expect(previousSilentStreak(null)).toBe(0)
    expect(previousSilentStreak({} as FieldEvidence)).toBe(0)
    expect(previousSilentStreak({
      _page_read: { quote: null, source_url: null, checked_at: NOW.toISOString(), by: 'v', agrees: null, silent_streak: -2 },
    })).toBe(0)
  })
})

describe('precedence', () => {
  it('is dated, then always-open, then silent', () => {
    const evidence = confirmed('is_rolling')
    expect(computeCadence({ ...BARE, evidence, deadline: '2026-09-01' }, { checkedAt: NOW }).shape)
      .toBe('dated')
    expect(computeCadence({ ...BARE, evidence }, { checkedAt: NOW }).shape)
      .toBe('always_open')
    expect(computeCadence({ ...BARE, evidence: silent('is_rolling') }, { checkedAt: NOW }).shape)
      .toBe('silent')
  })

  it('never returns a due date in the past', () => {
    const inputs = [
      { ...BARE, deadline: '2020-01-01' },
      { ...BARE, deadline_cycle: [{ day: 15, month: 8 }] },
      { ...BARE, next_open_date: '2026-08-16' },
      { ...BARE, evidence: silent('deadline') },
    ]
    for (const i of inputs) {
      expect(computeCadence(i, { checkedAt: NOW }).dueAt.getTime()).toBeGreaterThan(NOW.getTime())
    }
  })
})
