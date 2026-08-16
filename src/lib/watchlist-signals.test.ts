import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasCollapsed, flagRowsForUrl } from './watchlist-signals'

describe('hasCollapsed', () => {
  it('catches the Five Lamps case: a page that stopped rendering its content', () => {
    expect(hasCollapsed(11, 0)).toBe(true)
  })

  it('catches a page that lost more than half of a substantial listing', () => {
    expect(hasCollapsed(30, 14)).toBe(true)
    expect(hasCollapsed(30, 15)).toBe(false)   // exactly half is not "most"
  })

  it('does not call a thin page a collapse', () => {
    // A site that has always fingerprinted at 2 or 3 items is thin, not
    // collapsing, and flagging it every week is how a precise signal becomes
    // noise and then gets ignored.
    expect(hasCollapsed(3, 0)).toBe(false)
    expect(hasCollapsed(9, 4)).toBe(false)
    expect(hasCollapsed(0, 0)).toBe(false)
    expect(hasCollapsed(null, 0)).toBe(false)
    expect(hasCollapsed(undefined, 0)).toBe(false)
  })

  it('is never true when the page gained items', () => {
    expect(hasCollapsed(11, 12)).toBe(false)
    expect(hasCollapsed(0, 20)).toBe(false)
  })
})

/** Records the predicate chain so the test can assert on the query, not the mock. */
function fakeDb(result: { data?: { id: string }[]; error?: { message: string } }) {
  const calls: { fn: string; args: unknown[] }[] = []
  const chain: Record<string, unknown> = {}
  for (const fn of ['update', 'eq', 'or']) {
    chain[fn] = (...args: unknown[]) => { calls.push({ fn, args }); return chain }
  }
  chain.select = (...args: unknown[]) => { calls.push({ fn: 'select', args }); return Promise.resolve(result) }
  return {
    db: { from: (t: string) => { calls.push({ fn: 'from', args: [t] }); return chain } } as unknown as SupabaseClient,
    calls,
  }
}

describe('flagRowsForUrl', () => {
  afterEach(() => vi.restoreAllMocks())

  it('flags only the rows on that exact URL, and returns how many', async () => {
    const { db, calls } = fakeDb({ data: [{ id: 'a' }, { id: 'b' }] })
    expect(await flagRowsForUrl(db, 'https://f.org/fund', 'watchlist_change')).toBe(2)

    expect(calls.find(c => c.fn === 'from')?.args[0]).toBe('scraped_grants')
    expect(calls.find(c => c.fn === 'update')?.args[0]).toEqual({ verify_flag: 'watchlist_change' })
    // The host is NOT part of the predicate. 261 rows share a host with a
    // watchlist entry against 54 that match exactly, and the shared hosts are
    // the noisiest sites we watch — matching by host would turn one cosmetic
    // edit into dozens of unrelated rows at the front of the queue.
    expect(calls.find(c => c.fn === 'eq')?.args).toEqual(['apply_url', 'https://f.org/fund'])
  })

  it('keeps null-state rows in scope', async () => {
    // `not.in` on a NULL enum yields NULL, which silently drops the row. That is
    // the same trap migration 054 documents for `coalesce` on this column.
    const { db, calls } = fakeDb({ data: [] })
    await flagRowsForUrl(db, 'https://f.org/fund', 'listing_collapsed')
    expect(calls.find(c => c.fn === 'or')?.args[0]).toContain('pipeline_state.is.null')
  })

  it('reports zero rather than throwing when the write fails', async () => {
    // A failed flag must not abort the watchlist run that found the change.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb({ error: { message: 'permission denied' } })
    expect(await flagRowsForUrl(db, 'https://f.org/fund', 'watchlist_change')).toBe(0)
  })

  it('does nothing for an empty URL', async () => {
    const { db, calls } = fakeDb({ data: [{ id: 'a' }] })
    expect(await flagRowsForUrl(db, '', 'watchlist_change')).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
