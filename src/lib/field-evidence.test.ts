import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isConfirmed, isContradicted, wasChecked, evidenceAgeDays, readStamp,
  buildEvidencePatch, recordFieldEvidence, PAGE_READ_KEY,
  type FieldEvidence,
} from './field-evidence'

/**
 * The whole point of this column is to let a publish gate ask "has anyone
 * actually READ this?" and get an answer that can be no. So the tests are
 * built around the ways it could wrongly say yes — a stamp with no quote, a
 * stamp from a page that disagreed, a stamp from four months ago. Each of those
 * is a row going public on an unchecked claim, which is exactly the 12 August
 * failure this exists to prevent.
 */

const NOW = new Date('2026-08-15T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const EVIDENCE: FieldEvidence = {
  // The page said it, it matches, and we can quote it.
  is_rolling: {
    quote: 'Applications are accepted on a rolling basis throughout the year.',
    source_url: 'https://example.org/apply', checked_at: daysAgo(3),
    by: 'verify:v1', agrees: true,
  },
  // The page addressed it and said something else.
  deadline: {
    quote: 'Draw 1 23-27 March. Draw 2 7-11 September.',
    source_url: 'https://example.org/draw-dates', checked_at: daysAgo(3),
    by: 'verify:v1', agrees: false,
  },
  // We read the page. It was silent on this. That is not evidence.
  max_org_income: {
    quote: null, source_url: 'https://example.org/apply', checked_at: daysAgo(3),
    by: 'verify:v1', agrees: null,
  },
  // Right answer, too long ago to still be worth anything.
  is_invite_only: {
    quote: 'The Trust does not accept unsolicited applications.',
    source_url: 'https://example.org/apply', checked_at: daysAgo(200),
    by: 'verify:v1', agrees: true,
  },
}

describe('isConfirmed — the question a publish gate asks', () => {
  it('is true for a fresh, quoted agreement', () => {
    expect(isConfirmed(EVIDENCE, 'is_rolling', { asOf: NOW })).toBe(true)
  })

  it('is FALSE when the page was read and said nothing', () => {
    // The failure this guards against: treating "we looked and found no answer"
    // as an answer. A null-agrees stamp exists so the engine stops re-reading
    // the same silent page, NOT so the gate can count it as verified.
    expect(isConfirmed(EVIDENCE, 'max_org_income', { asOf: NOW })).toBe(false)
    expect(wasChecked(EVIDENCE, 'max_org_income', { asOf: NOW })).toBe(true)
  })

  it('is FALSE when the page contradicted us', () => {
    // A field the page disagrees with is not merely unverified, it is known
    // wrong. A gate that read this as "evidence exists, let it through" would be
    // worse than one with no evidence column at all.
    expect(isConfirmed(EVIDENCE, 'deadline', { asOf: NOW })).toBe(false)
    expect(isContradicted(EVIDENCE, 'deadline', { asOf: NOW })).toBe(true)
  })

  it('is FALSE once the stamp goes stale', () => {
    expect(isConfirmed(EVIDENCE, 'is_invite_only', { asOf: NOW })).toBe(false)
    expect(isConfirmed(EVIDENCE, 'is_invite_only', { asOf: NOW, maxAgeDays: 365 })).toBe(true)
  })

  it('is FALSE for a field nobody has ever checked', () => {
    expect(isConfirmed(EVIDENCE, 'amount_max', { asOf: NOW })).toBe(false)
    expect(wasChecked(EVIDENCE, 'amount_max', { asOf: NOW })).toBe(false)
  })

  it('is FALSE on an empty column, a null column, and junk', () => {
    expect(isConfirmed(null, 'is_rolling', { asOf: NOW })).toBe(false)
    expect(isConfirmed({}, 'is_rolling', { asOf: NOW })).toBe(false)
    // A malformed stamp must not read as a pass. Row shapes drift.
    expect(isConfirmed({ is_rolling: { agrees: true } } as unknown as FieldEvidence,
      'is_rolling', { asOf: NOW })).toBe(false)
  })

  it('is FALSE when the quote is blank rather than absent', () => {
    const blank: FieldEvidence = {
      deadline: { quote: '   ', source_url: null, checked_at: daysAgo(1), by: 'verify:v1', agrees: true },
    }
    expect(isConfirmed(blank, 'deadline', { asOf: NOW })).toBe(false)
  })

  it('treats a future-dated stamp as fresh, not stale', () => {
    // Clock skew between the app and Postgres should never turn a just-written
    // stamp into a stale one — that would make the gate flap.
    const skewed: FieldEvidence = {
      deadline: { quote: 'Closes 1 December.', source_url: null,
                  checked_at: new Date(NOW.getTime() + 60_000).toISOString(),
                  by: 'verify:v1', agrees: true },
    }
    expect(isConfirmed(skewed, 'deadline', { asOf: NOW })).toBe(true)
  })
})

describe('evidenceAgeDays / readStamp', () => {
  it('measures age in whole days, and returns null when never checked', () => {
    expect(evidenceAgeDays(EVIDENCE, 'is_rolling', NOW)).toBe(3)
    expect(evidenceAgeDays(EVIDENCE, 'is_invite_only', NOW)).toBe(200)
    expect(evidenceAgeDays(EVIDENCE, 'amount_max', NOW)).toBe(null)
  })

  it('returns the normalised stamp for rendering', () => {
    expect(readStamp(EVIDENCE, 'deadline')?.source_url).toBe('https://example.org/draw-dates')
    expect(readStamp(EVIDENCE, 'nothing_here')).toBe(null)
  })
})

describe('buildEvidencePatch', () => {
  it('stamps every field with one shared checked_at', () => {
    const { patch } = buildEvidencePatch([
      { field: 'deadline',   agrees: true,  quote: 'Closes 1 December 2026.', source_url: 'https://example.org/a' },
      { field: 'is_rolling', agrees: false, quote: 'Applications open twice a year.', source_url: 'https://example.org/b' },
    ], { by: 'verify:v1', checkedAt: NOW })

    expect(patch.deadline.checked_at).toBe(NOW.toISOString())
    expect(patch.is_rolling.checked_at).toBe(NOW.toISOString())
    // Per-field source URLs, which is what makes multi-page sourcing storable.
    expect(patch.deadline.source_url).toBe('https://example.org/a')
    expect(patch.is_rolling.source_url).toBe('https://example.org/b')
  })

  it('downgrades a verdict with no quote, and REPORTS it', () => {
    // No quote, no verdict. The engine already applies this to proposals; it is
    // enforced again here so a future caller cannot lose it. The downgrade is
    // non-fatal so one bad field does not cost a whole run — but it is returned,
    // because a silent downgrade is the failure mode this tranche exists to end.
    const { patch, unquoted } = buildEvidencePatch([
      { field: 'is_rolling', agrees: true, quote: null,  source_url: 'https://example.org/a' },
      { field: 'deadline',   agrees: true, quote: '   ', source_url: 'https://example.org/a' },
    ], { by: 'verify:v1', checkedAt: NOW })

    expect(unquoted).toEqual(['is_rolling', 'deadline'])
    expect(patch.is_rolling.agrees).toBe(null)
    expect(patch.deadline.agrees).toBe(null)
    expect(isConfirmed(patch, 'is_rolling', { asOf: NOW })).toBe(false)
  })

  it('carries the proposed value on a contradiction, and only there', () => {
    // A contradiction that does not say what the page DOES state is not
    // actionable, and this stamp is the proposal's only durable home: the one
    // machine-to-human channel the Review Inbox renders today has no quote slot
    // and is overwritten wholesale by the feedback router.
    const { patch } = buildEvidencePatch([
      { field: 'deadline',   agrees: false, quote: 'Closes 1 December 2026.', source_url: null, proposed: '2026-12-01' },
      { field: 'is_rolling', agrees: true,  quote: 'Open all year.', source_url: null, proposed: true },
      { field: 'is_invite_only', agrees: null, quote: null, source_url: null, proposed: true },
    ], { by: 'verify:v1', checkedAt: NOW })

    expect(patch.deadline.proposed).toBe('2026-12-01')
    // An agreement proposes nothing — there is nothing to change.
    expect('proposed' in patch.is_rolling).toBe(false)
    // Nor does a silent page, or the row would hold a value nothing stands behind.
    expect('proposed' in patch.is_invite_only).toBe(false)
  })

  it('drops the proposal when the verdict is downgraded for want of a quote', () => {
    const { patch, unquoted } = buildEvidencePatch([
      { field: 'deadline', agrees: false, quote: null, source_url: null, proposed: '2026-12-01' },
    ], { by: 'verify:v1', checkedAt: NOW })

    expect(unquoted).toEqual(['deadline'])
    expect(patch.deadline.agrees).toBe(null)
    expect('proposed' in patch.deadline).toBe(false)
  })

  it('stamps a page read that found nothing, so the row can still drain', () => {
    // A page that fails the gate yields no facts and so no field stamps. The
    // work queue orders by the oldest stamp on the row, so without a page-read
    // stamp such a row is never drained: it comes back at the front of every
    // run, for ever. 138 rows in the catalogue are in exactly that state.
    const { patch } = buildEvidencePatch([
      { field: PAGE_READ_KEY, agrees: null, quote: null,
        source_url: 'https://example.org/', note: 'fixable_link: wrong_fund' },
    ], { by: 'verify:v1', checkedAt: NOW })

    expect(patch[PAGE_READ_KEY].checked_at).toBe(NOW.toISOString())
    expect(patch[PAGE_READ_KEY].note).toBe('fixable_link: wrong_fund')
    // It records an attempt, never a fact. No gate may read it as evidence.
    expect(isConfirmed(patch, PAGE_READ_KEY, { asOf: NOW })).toBe(false)
    expect(wasChecked(patch, PAGE_READ_KEY, { asOf: NOW })).toBe(true)
  })

  it('trims the quote and leaves a silent field with no quote at all', () => {
    const { patch, unquoted } = buildEvidencePatch([
      { field: 'deadline',       agrees: true, quote: '  Closes 1 December.  ', source_url: null },
      { field: 'max_org_income', agrees: null, quote: null, source_url: 'https://example.org/a' },
    ], { by: 'verify:v1', checkedAt: NOW })

    expect(patch.deadline.quote).toBe('Closes 1 December.')
    expect(patch.max_org_income.quote).toBe(null)
    // A genuinely silent page is not a caller bug, so it is not reported.
    expect(unquoted).toEqual([])
  })
})

// A stand-in for the Supabase client, exposing only .rpc().
type FakeDb = { calls: unknown[]; rpc(fn: string, args: unknown): Promise<{ data: unknown; error: unknown }> }
const fakeDb = (impl: () => { data: unknown; error: unknown }): FakeDb => ({
  calls: [] as unknown[],
  rpc(fn: string, args: unknown) { this.calls.push({ fn, args }); return Promise.resolve(impl()) },
})
/** Only .rpc() is exercised, so the rest of the client surface is not modelled. */
const asClient = (db: FakeDb) => db as unknown as SupabaseClient

describe('recordFieldEvidence — a 200 is not a write', () => {
  const patch = buildEvidencePatch(
    [{ field: 'deadline', agrees: true, quote: 'Closes 1 December.', source_url: null }],
    { by: 'verify:v1', checkedAt: NOW },
  ).patch

  it('returns what it stamped when the merged object comes back', async () => {
    const db = fakeDb(() => ({ data: patch, error: null }))
    const res = await recordFieldEvidence({ id: 'abc', patch, db: asClient(db) })
    expect(res.stamped).toEqual(['deadline'])
    expect(db.calls[0]).toEqual({ fn: 'merge_field_evidence', args: { row_id: 'abc', patch } })
  })

  it('THROWS when the row matched nothing', async () => {
    // This is what a cron writing through a cookie-scoped client looks like: it
    // resolves to anon, matches zero rows under RLS, and reports success. Three
    // crons in this codebase did exactly that for their whole existence.
    const db = fakeDb(() => ({ data: null, error: null }))
    await expect(recordFieldEvidence({ id: 'abc', patch, db: asClient(db) })).rejects.toThrow(/matched no row/)
  })

  it('THROWS when a field did not survive the merge', async () => {
    const db = fakeDb(() => ({ data: { something_else: {} }, error: null }))
    await expect(recordFieldEvidence({ id: 'abc', patch, db: asClient(db) })).rejects.toThrow(/did not persist: deadline/)
  })

  it('THROWS on an RPC error rather than returning quietly', async () => {
    const db = fakeDb(() => ({ data: null, error: { message: 'permission denied' } }))
    await expect(recordFieldEvidence({ id: 'abc', patch, db: asClient(db) })).rejects.toThrow(/permission denied/)
  })

  it('does not call the database at all for an empty patch', async () => {
    const db = fakeDb(() => ({ data: null, error: null }))
    const res = await recordFieldEvidence({ id: 'abc', patch: {}, db: asClient(db) })
    expect(res.stamped).toEqual([])
    expect(db.calls).toEqual([])
  })
})
