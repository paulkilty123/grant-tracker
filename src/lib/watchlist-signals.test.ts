import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasCollapsed, flagRowsForUrl, extractFingerprint } from './watchlist-signals'

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

// ── extractFingerprint, both grammars ────────────────────────────────────────
//
// The markdown branch exists because the reader proxy returns markdown while a
// direct fetch returns HTML. Running the HTML patterns over markdown finds
// nothing, and "nothing" is indistinguishable from a listing that has collapsed
// to zero items — which is an alert, on a page that never moved.
describe('extractFingerprint', () => {
  const HTML = `
    <html><body>
      <h1>Grants and funding</h1>
      <h2>Community Grant Programme</h2>
      <p>Something not picked up.</p>
      <strong>Applications open 1 September</strong>
      <h3>Small Grants Fund</h3>
    </body></html>`

  const MARKDOWN = `
# Grants and funding

## Community Grant Programme

Something not picked up.

**Applications open 1 September**

### Small Grants Fund
`

  it('reads headings and bold out of HTML', () => {
    const { fingerprint, count } = extractFingerprint(HTML, 'direct')
    expect(count).toBe(4)
    expect(fingerprint).toContain('community grant programme')
    expect(fingerprint).toContain('applications open 1 september')
  })

  it('reads the same page out of markdown', () => {
    const { fingerprint, count } = extractFingerprint(MARKDOWN, 'proxy')
    expect(count).toBe(4)
    expect(fingerprint).toContain('community grant programme')
    expect(fingerprint).toContain('applications open 1 september')
  })

  // The whole reason migration 067 stores which reader was used.
  it('finds nothing when markdown is read with the HTML grammar', () => {
    expect(extractFingerprint(MARKDOWN, 'direct').count).toBe(0)
  })

  it('strips markdown link syntax so a URL change is not a content change', () => {
    const a = extractFingerprint('## [Apply now](https://x.test/a)', 'proxy')
    const b = extractFingerprint('## [Apply now](https://x.test/b?utm=2)', 'proxy')
    expect(a.fingerprint).toBe('apply now')
    expect(a.fingerprint).toBe(b.fingerprint)
  })

  it('sorts and deduplicates so a reordered menu is not a change', () => {
    const a = extractFingerprint('<h2>Beta fund</h2><h2>Alpha fund</h2>', 'direct')
    const b = extractFingerprint('<h2>Alpha fund</h2><h2>Beta fund</h2><h2>Beta fund</h2>', 'direct')
    expect(a.fingerprint).toBe(b.fingerprint)
  })
})
