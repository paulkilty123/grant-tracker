import { describe, it, expect } from 'vitest'
import { summariseEvidence, evidenceHeadline } from './evidence-summary'
import type { FieldEvidence } from '@/lib/field-evidence'

/**
 * This panel is the first thing on the review screen that comes from outside our
 * own data. So the tests are about whether a reviewer would be MISLED by it: a
 * contradiction buried below confirmations, a silence presented as a gap when
 * the surface actually fills it in with a claim, or a row that was read
 * presented as never checked.
 */

// Copied from what the engine actually wrote for Movement for Good, not invented.
const MOVEMENT_FOR_GOOD: FieldEvidence = {
  _page_read:     { quote: null, source_url: 'https://movementforgood.com/', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: null, note: 'verified' },
  is_grant:       { quote: 'Every entry gives them the chance to receive a donation', source_url: 'https://movementforgood.com/', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: true },
  is_rolling:     { quote: 'Draw 2 7-11 September 100 x £1,000 awards', source_url: 'https://movementforgood.com/draws/1000', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: false, proposed: false },
  deadline:       { quote: null, source_url: 'https://movementforgood.com/', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: null },
  max_org_income: { quote: null, source_url: 'https://movementforgood.com/', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: null },
}

describe('summariseEvidence', () => {
  it('puts the contradiction first, above anything confirmed', () => {
    // The one line that should stop somebody clicking publish must not sit
    // below a list of things that need no decision at all.
    const s = summariseEvidence(MOVEMENT_FOR_GOOD)!
    expect(s.lines[0].field).toBe('is_rolling')
    expect(s.lines[0].verdict).toBe('contradicted')
    expect(s.lines[0].proposed).toBe(false)
    expect(s.lines[0].quote).toMatch(/Draw 2/)
  })

  it('cites the page each fact came from, which is not always apply_url', () => {
    // The rolling verdict came from a subpage; the scope check came from the
    // homepage. A panel that showed one URL for the row would be wrong about one
    // of them.
    const s = summariseEvidence(MOVEMENT_FOR_GOOD)!
    expect(s.lines.find(l => l.field === 'is_rolling')?.sourceUrl).toBe('https://movementforgood.com/draws/1000')
    expect(s.lines.find(l => l.field === 'is_grant')?.sourceUrl).toBe('https://movementforgood.com/')
  })

  it('counts an unbacked CLAIM, not every silence', () => {
    // is_rolling and deadline are asserted, so their silence or contradiction is
    // a claim with nothing behind it. max_org_income is silent too and does not
    // count: an absent amount renders as absent and misleads nobody.
    const s = summariseEvidence(MOVEMENT_FOR_GOOD)!
    expect(s.unbacked).toBe(2)
    expect(s.counts).toEqual({ contradicted: 1, silent: 2, confirmed: 1 })
  })

  it('reports when and what page, from the page-read stamp', () => {
    const s = summariseEvidence(MOVEMENT_FOR_GOOD)!
    expect(s.checkedAt).toBe('2026-08-16T12:00:00.000Z')
    expect(s.readUrl).toBe('https://movementforgood.com/')
    expect(s.outcome).toBe('verified')
  })

  it('is null when nothing has ever read the row, so the panel can say so', () => {
    // Never checked and checked-but-silent are different states and the screen
    // must not merge them: one is our failure, the other is the funder's page.
    expect(summariseEvidence(null)).toBe(null)
    expect(summariseEvidence({})).toBe(null)
  })

  it('still dates a row stamped before the page-read key existed', () => {
    const old: FieldEvidence = {
      is_rolling: { quote: 'Open all year.', source_url: 'https://x/', checked_at: '2026-08-15T09:00:00.000Z', by: 'verify:v1', agrees: true },
    }
    expect(summariseEvidence(old)!.checkedAt).toBe('2026-08-15T09:00:00.000Z')
  })

  it('reports a gate failure as the outcome rather than as a verified read', () => {
    const failed: FieldEvidence = {
      _page_read: { quote: null, source_url: 'https://x/', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: null, note: 'fixable_link: wrong_fund' },
    }
    const s = summariseEvidence(failed)!
    expect(s.outcome).toBe('fixable_link: wrong_fund')
    expect(s.lines).toEqual([])
    expect(evidenceHeadline(s)).toBe('read, nothing stated')
  })
})

describe('evidenceHeadline', () => {
  it('leads with a contradiction, then an unbacked claim, then confirmation', () => {
    expect(evidenceHeadline(summariseEvidence(MOVEMENT_FOR_GOOD))).toBe('1 field the page contradicts')

    const unbackedOnly: FieldEvidence = {
      is_rolling: { quote: null, source_url: 'https://x/', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: null },
    }
    expect(evidenceHeadline(summariseEvidence(unbackedOnly))).toBe('1 claim the page does not back')

    const good: FieldEvidence = {
      deadline: { quote: 'Closes 1 December.', source_url: 'https://x/', checked_at: '2026-08-16T12:00:00.000Z', by: 'verify:v1', agrees: true },
    }
    expect(evidenceHeadline(summariseEvidence(good))).toBe('1 confirmed against the page')
  })

  it('is null when there is no evidence, so no line is drawn', () => {
    expect(evidenceHeadline(null)).toBe(null)
  })
})
