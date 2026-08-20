import { describe, it, expect } from 'vitest'
import { detectReopening, type ReopeningRow } from './reopening'

const TODAY = '2026-08-20'

/** Every fixture carries a recent `_page_read`, because rule 3 requires one. */
const row = (evidence: Record<string, unknown>, deadline: string | null = null): ReopeningRow => ({
  id: 'r1', title: 'Test Fund', deadline,
  field_evidence: { _page_read: read({ note: 'verified' }), ...evidence },
})

const read = (over: Record<string, unknown>) => ({
  by: 'verify:v1', checked_at: '2026-08-19T09:00:00.000Z',
  source_url: 'https://example.org/fund', agrees: null, quote: null, ...over,
})

describe('detectReopening', () => {
  it('fires when the page states a future closing date we do not hold', () => {
    const r = row({ deadline: read({ agrees: false, proposed: '2026-09-21', quote: 'will close on Monday 21 September at 12 noon' }) })
    expect(detectReopening(r, TODAY)?.closesOn).toBe('2026-09-21')
  })

  it('fires when the page confirms a future closing date we already hold', () => {
    const r = row({ deadline: read({ agrees: true, quote: 'Applications close 30 November 2026.' }) }, '2026-11-30')
    expect(detectReopening(r, TODAY)?.closesOn).toBe('2026-11-30')
  })

  it('stays silent on a past date, which is what "between rounds" means', () => {
    const r = row({ deadline: read({ agrees: false, proposed: '2026-08-14', quote: 'The next deadline is 5pm on August 14, 2026' }) })
    expect(detectReopening(r, TODAY)).toBeNull()
  })

  // ── Rule 3: the year the extractor guessed is wrong ──
  //
  // The case that prompted the whole detector and that the first version MISSED.
  // Wiltshire & Swindon's page says "will close on Monday 21 September" with no
  // year; the extractor resolved it to 2025-09-21, a past date, on a fund that
  // was open. A bare day and month should roll forward.
  it('fires when the guessed year is past but the day has not come round this year', () => {
    const r = row({
      deadline: read({
        agrees: false, proposed: '2025-09-21',
        quote: 'This programme is currently open for applications, and will close on Monday 21 September at 12 noon',
      }),
    })
    const hit = detectReopening(r, TODAY)
    expect(hit?.closesOn).toBe('2026-09-21')
    expect(hit?.confidence).toBe('same_cycle')
  })

  it('does not roll forward a day that has already passed this year', () => {
    const r = row({ deadline: read({ agrees: false, proposed: '2025-08-14', quote: 'closes 14 August' }) })
    expect(detectReopening(r, TODAY)).toBeNull()
  })

  // The inference is "the page said this lately, so the date is the next one".
  // On a stale stamp that reasoning does not hold.
  it('will not roll a year forward on a stale read', () => {
    const r: ReopeningRow = {
      id: 'r1', title: 'Test Fund', deadline: null,
      field_evidence: {
        _page_read: read({ checked_at: '2026-01-02T09:00:00.000Z' }),
        deadline: read({ agrees: false, proposed: '2025-09-21', quote: 'closes 21 September' }),
      },
    }
    expect(detectReopening(r, TODAY)).toBeNull()
  })

  // Skipton Charitable Foundation, which the first version of rule 3 fired on.
  // Its quote states the year outright, so the extractor was not guessing and
  // the date is genuinely past. Rolling it forward would invent a round.
  it('will not roll a year forward when the page states the year', () => {
    const r = row({
      deadline: read({
        agrees: false, proposed: '2025-10-31',
        quote: 'Applications will close on Friday 31st October 2025 at 5pm',
      }),
    })
    expect(detectReopening(r, TODAY)).toBeNull()
  })

  it('labels a full future date as firmer than a rolled-forward one', () => {
    const firm = row({ deadline: read({ agrees: false, proposed: '2026-09-21', quote: 'closes 21 September 2026' }) })
    expect(detectReopening(firm, TODAY)?.confidence).toBe('stated')
  })

  // The trap that would have made this wrong on its first run. `agrees` means the
  // page matched what WE stored, not that the page says rolling — Forever
  // Manchester's Bright Futures Fund scores agrees:true on a quote reading
  // "NOW CLOSED to applications".
  it('never treats is_rolling agreement as openness', () => {
    const r = row({
      is_rolling: read({ agrees: true, quote: 'The latest round of the Bright Futures Fund is NOW CLOSED to applications.' }),
    })
    expect(detectReopening(r, TODAY)).toBeNull()
  })

  it('stays silent when the page says the fund is gone, whatever else it holds', () => {
    const r = row({
      still_listed: read({ agrees: false, quote: 'This fund has been withdrawn.' }),
      deadline: read({ agrees: false, proposed: '2026-12-01' }),
    })
    expect(detectReopening(r, TODAY)).toBeNull()
  })

  // `agrees: true` with nothing behind it is not evidence, and the same rule
  // governs field proposals elsewhere in the engine.
  it('requires a quote before trusting an agreement', () => {
    const r = row({ deadline: read({ agrees: true, quote: null }) }, '2026-11-30')
    expect(detectReopening(r, TODAY)).toBeNull()
  })

  it('stays silent on a row the engine has never read', () => {
    expect(detectReopening({ id: 'r1', deadline: '2026-11-30', field_evidence: null }, TODAY)).toBeNull()
    expect(detectReopening({ id: 'r1', deadline: '2026-11-30', field_evidence: {} }, TODAY)).toBeNull()
  })

  it('gives a reason a person can read', () => {
    const r = row({ deadline: read({ agrees: false, proposed: '2026-09-21', quote: 'closes 21 September' }) })
    expect(detectReopening(r, TODAY)?.reason).toContain('has not passed')
  })
})
